import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Job, Workspace } from "../shared/types";
import { isJobUrl, type PortalId } from "../shared/portals";
import { classify, extractSkills, locationMatches } from "./engine";
import { decode } from "./html";
import { SourceError } from "./connectors";
import { publicDiscoveryAvailable } from "./provider-capabilities";

export type PortalResult = {
  jobs: Job[];
  checkedAt: string;
  cached: boolean;
  method?: string;
  searchSuggestionsHtml?: string;
};
const cache = new Map<string, { expiresAt: number; result: PortalResult }>();
const inflight = new Map<string, Promise<PortalResult>>();
const cooldowns = new Map<string, number>();
const maxPageBytes = 3000000;
export function clearPublicPortalCache() {
  cache.clear();
  cooldowns.clear();
}
async function publicHtml(url: string, accept = "text/html") {
  const host = new URL(url).hostname;
  const cooldown = cooldowns.get(host) || 0;
  if (cooldown > Date.now())
    throw new SourceError(
      "A fonte atingiu seu limite. Aguarde antes de buscar novamente.",
      cooldown - Date.now(),
    );
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: accept,
        "User-Agent": "EmpreGatos/1.0 (public-job-search)",
      },
    });
  } catch {
    throw new SourceError(
      "Não foi possível consultar a página pública do portal. Tente novamente.",
    );
  }
  if (!response.ok) {
    let retryAfter = 0;
    if (response.status === 429) {
      const raw = response.headers.get("retry-after") || "60";
      const parsed = /^\d+$/.test(raw)
        ? Number(raw) * 1000
        : Date.parse(raw) - Date.now();
      retryAfter = Math.min(
        3600000,
        Math.max(60000, Number.isFinite(parsed) ? parsed : 60000),
      );
      cooldowns.set(host, Date.now() + retryAfter);
    }
    await response.body?.cancel().catch(() => {});
    throw new SourceError(
      `O portal não disponibilizou a consulta pública (HTTP ${response.status}).`,
      retryAfter,
    );
  }
  if (Number(response.headers.get("content-length")) > maxPageBytes) {
    await response.body?.cancel().catch(() => {});
    throw new SourceError("A página do portal excedeu o limite de leitura.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    // Limit downloaded bytes before buffering or decoding the entire response.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxPageBytes)
        throw new SourceError(
          "A página do portal excedeu o limite de leitura.",
        );
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SourceError) throw error;
    throw new SourceError(
      "Não foi possível ler a página pública do portal. Tente novamente.",
    );
  } finally {
    reader.releaseLock();
  }
}
function makeJob(
  portal: PortalId,
  data: {
    title: string;
    company: string;
    url: string;
    location: string;
    description: string;
    publishedAt?: string | null;
    modality?: string;
  },
): Job {
  return {
    ...data,
    id: randomUUID(),
    source: portal === "gupy" ? "Gupy" : "LinkedIn",
    ...classify(data.title + "\n" + data.description),
    level: classify(data.title).level,
    ...(data.modality ? { modality: data.modality } : {}),
    salaryMin: null,
    salaryMax: null,
    currency: "",
    requiredSkills: [],
    skills: extractSkills(data.title + "\n" + data.description),
    publishedAt: data.publishedAt || null,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    demo: false,
    availability: "unknown",
    geographicEligibility: data.location,
    origins: [
      {
        source: "portal",
        url: data.url,
        id: `${portal}:${new URL(data.url).pathname}`,
      },
    ],
    match: {
      score: 0,
      strengths: [],
      gaps: [],
      blockers: [],
      matchedSkills: [],
      missingSkills: [],
      radar: false,
      explanation: "",
    },
  };
}
const gupyJob = z.object({
  id: z.number().int().positive(),
  name: z.string().min(2).max(200),
  careerPageName: z.string().min(2).max(200),
  jobUrl: z.string().url(),
  description: z.string().max(100000),
  city: z.string().optional(),
  state: z.string().optional(),
  workplaceType: z.string().optional(),
  publishedDate: z.string().optional(),
  applicationDeadline: z.string().nullish(),
});
/** Read the public listings used by each portal; no account credentials or access to private listings. */
export async function discoverPublicPortal(
  portal: "gupy" | "linkedin",
  workspace: Workspace,
): Promise<PortalResult> {
  if (portal === "linkedin" && !publicDiscoveryAvailable(portal, false))
    throw new SourceError(
      "A busca LinkedIn exige autorização do provedor nesta instalação.",
    );
  const key = JSON.stringify([
    portal,
    workspace.filters.titles,
    workspace.filters.locations,
    workspace.filters.modalities,
    workspace.filters.remoteAnywhere,
    workspace.filters.ageDays,
    workspace.filters.dateKnownOnly,
    workspace.profile.headline,
    workspace.profile.location,
  ]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return structuredClone({
      ...cached.result,
      cached: true,
      method: "consulta pública em cache",
    });
  const running = inflight.get(key);
  if (running) return structuredClone(await running);
  const task = readPublicPortal(portal, workspace);
  inflight.set(key, task);
  try {
    const result = await task;
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, {
      expiresAt: Date.now() + 300000,
      result: structuredClone(result),
    });
    return result;
  } finally {
    inflight.delete(key);
  }
}
async function readPublicPortal(
  portal: "gupy" | "linkedin",
  workspace: Workspace,
): Promise<PortalResult> {
  const titles = [
    ...new Set(
      workspace.filters.titles.length
        ? workspace.filters.titles
        : [workspace.profile.headline],
    ),
  ]
    .filter(Boolean)
    .slice(0, 4);
  const jobs = new Map<string, Job>();
  const detailed = new Set<string>();
  titleSearch: for (const title of titles) {
    if (portal === "gupy") {
      const list: unknown[] = [];
      const locations =
        workspace.filters.locations.length &&
        !(
          workspace.filters.remoteAnywhere !== false &&
          workspace.filters.modalities.includes("Remoto")
        )
          ? workspace.filters.locations.slice(0, 3)
          : [""];
      for (const location of locations) {
        const params = new URLSearchParams({
          jobName: title,
          limit: "50",
          offset: "0",
        });
        const modalities = workspace.filters.modalities
          .map(
            (modality) =>
              (
                ({
                  Remoto: "remote",
                  Presencial: "on-site",
                  Híbrido: "hybrid",
                }) as Record<string, string>
              )[modality],
          )
          .filter(Boolean);
        if (modalities.length)
          params.set("workplaceType", modalities.join(","));
        params.set("sortBy", "publishedDate");
        params.set("sortOrder", "desc");
        if (location && !/^(?:brasil|brazil|br)$/i.test(location.trim())) {
          const city = location.split(/[,/]/)[0].trim();
          params.set("city", city);
        }
        // Bounded pagination; never infer an empty search from the first page alone.
        const seenPages = new Set<string>();
        for (let page = 0; page < 3; page++) {
          params.set("offset", String(page * 50));
          const response = await publicHtml(
            `https://portal.gupy.io/api/job-search/jobs?${params}`,
            "application/json",
          );
          let data: unknown, total: unknown;
          try {
            const payload = JSON.parse(response);
            data = payload.data;
            total = payload.pagination?.total;
          } catch {
            /* format validation below */
          }
          if (!Array.isArray(data))
            throw new SourceError(
              "A Gupy mudou o formato da página de vagas. Use a busca no portal enquanto atualizamos a leitura.",
            );
          const signature = JSON.stringify(data.map((item) => item?.id));
          if (data.length && seenPages.has(signature))
            throw new SourceError(
              "A Gupy repetiu uma página de resultados. A consulta precisa ser refeita.",
            );
          seenPages.add(signature);
          list.push(...data);
          if (
            data.length < 50 ||
            (typeof total === "number" && (page + 1) * 50 >= total)
          )
            break;
        }
      }
      let validRecords = 0;
      for (const item of list.slice(0, 450)) {
        const parsed = gupyJob.safeParse(item);
        if (!parsed.success || !isJobUrl("gupy", parsed.data.jobUrl)) continue;
        validRecords++;
        const data = parsed.data;
        if (
          data.applicationDeadline &&
          Date.parse(data.applicationDeadline) < Date.now()
        )
          continue;
        const modality = (
          {
            remote: "Remoto",
            "on-site": "Presencial",
            hybrid: "Híbrido",
          } as Record<string, string>
        )[data.workplaceType || ""];
        const location =
          [data.city, data.state].filter(Boolean).join(", ") ||
          "Localização não informada";
        const publishedAt =
          data.publishedDate && Number.isFinite(Date.parse(data.publishedDate))
            ? new Date(data.publishedDate).toISOString()
            : null;
        const job = makeJob(portal, {
          title: data.name.trim(),
          company: data.careerPageName.trim(),
          url: data.jobUrl,
          description: decode(data.description),
          location,
          modality,
          publishedAt,
        });
        jobs.set(String(data.id), job);
      }
      if (list.length && !validRecords)
        throw new SourceError(
          "A fonte retornou anúncios inválidos ou mudou seu formato. Isso não é uma busca sem resultados.",
        );
    } else {
      const params = new URLSearchParams({
        keywords: title,
        location:
          (workspace.filters.remoteAnywhere !== false &&
          workspace.filters.modalities.includes("Remoto")
            ? "Brazil"
            : workspace.filters.locations[0]) ||
          workspace.profile.location ||
          "Brazil",
        geoId: "106057199",
        start: "0",
      });
      if (workspace.filters.dateKnownOnly)
        params.set("f_TPR", `r${workspace.filters.ageDays * 86400}`);
      params.set("sortBy", "DD");
      if (workspace.filters.modalities.length === 1) {
        const modality = (
          { Presencial: "1", Remoto: "2", Híbrido: "3" } as Record<
            string,
            string
          >
        )[workspace.filters.modalities[0]];
        if (modality) params.set("f_WT", modality);
      }
      const html = await publicHtml(
        `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`,
      );
      if (!html.trim()) continue;
      const cards = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
      if (!cards.length && !/no.results|no.jobs|nenhuma vaga/i.test(html))
        throw new SourceError(
          "O LinkedIn não disponibilizou uma lista pública de vagas. Use a busca no portal.",
        );
      for (const [, card] of cards.slice(0, 15)) {
        const field = (name: string) =>
          decode(
            card.match(
              new RegExp(
                `<([a-z0-9]+)[^>]*class="[^"]*${name}[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`,
                "i",
              ),
            )?.[2] || "",
          );
        const id = card.match(/urn:li:jobPosting:(\d+)/)?.[1];
        const url = `https://www.linkedin.com/jobs/view/${id}`;
        const title = field("base-search-card__title"),
          company = field("base-search-card__subtitle"),
          location = field("job-search-card__location");
        if (!id || !title || !company || !isJobUrl("linkedin", url)) continue;
        const published = card.match(/datetime="([^"]+)"/)?.[1];
        const job = makeJob(portal, {
          title,
          company,
          location: location || "Localização não informada",
          url,
          description: `${title}\n${company}\n${location}\nA lista pública não informa todos os requisitos. Abra o anúncio original para conferir.`,
          publishedAt:
            published && Number.isFinite(Date.parse(published))
              ? new Date(published).toISOString()
              : null,
        });
        // A short list entry does not prove skills, seniority, contract or work arrangement.
        job.skills = [];
        job.level = "Não especificado";
        job.contract = "Não especificado";
        job.modality = "Não especificado";
        if (!jobs.has(id)) jobs.set(id, job);
      }
      // Read a bounded number of individual announcements, with at most three requests at once.
      const pending = [...jobs.entries()]
        .filter(
          ([id, job]) =>
            !detailed.has(id) &&
            (!workspace.filters.locations.length ||
              (workspace.filters.remoteAnywhere !== false &&
                workspace.filters.modalities.includes("Remoto")) ||
              locationMatches(job.location, workspace.filters.locations)),
        )
        .slice(0, Math.max(0, 12 - detailed.size));
      for (let offset = 0; offset < pending.length; offset += 3) {
        const results = await Promise.allSettled(
          pending.slice(offset, offset + 3).map(async ([id, job]) => {
            detailed.add(id);
            const page = await publicHtml(
              `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`,
            );
            const description = decode(
              page.match(
                /<div[^>]*class="[^"]*show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i,
              )?.[1] || "",
            );
            if (description.length < 20) return;
            job.description = description.slice(0, 100000);
            Object.assign(job, classify(job.title + "\n" + job.description));
            job.level = classify(job.title).level;
            job.skills = extractSkills(job.title + "\n" + job.description);
          }),
        );
        // A detail-page failure preserves the genuine listing, with its requirements explicitly unknown.
        if (
          results.some(
            (result) =>
              result.status === "rejected" &&
              result.reason instanceof SourceError &&
              result.reason.retryAfterMs,
          )
        )
          break titleSearch;
      }
    }
  }
  return {
    jobs: [...jobs.values()],
    checkedAt: new Date().toISOString(),
    cached: false,
    method: "consulta à página pública",
  };
}
