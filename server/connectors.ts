import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { decode } from "./html";
import { discoverySignal, discoveryBudgetExpired } from "./discovery-budget";
import { classify, extractSkills } from "./engine";
import {mandatoryTechnicalSkills} from './mandatory-requirements';
import type { Job, Source } from "../shared/types";

export interface Connector {
  discovery: boolean;
  application: boolean;
  discover(source: Source): Promise<Job[]>;
}
export class SourceError extends Error {
  constructor(
    message: string,
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}
// Never include URLs in errors: Adzuna credentials travel in query parameters.
async function get(url: string, retries = 1): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "error",
        signal: discoverySignal(20000),
        headers: {
          Accept: "application/json",
          "User-Agent": "OrbitaCareers/1.0 (job-discovery)",
        },
      });
    } catch {
      if (attempt < retries && !discoveryBudgetExpired()) {
        await delay(400 * (attempt + 1));
        continue;
      }
      throw new SourceError(
        "Não foi possível conectar à fonte (rede ou timeout).",
      );
    }
    if (response.status === 429) {
      const value = response.headers.get("retry-after");
      const milliseconds =
        value && /^\d+$/.test(value)
          ? Number(value) * 1000
          : value
            ? Date.parse(value) - Date.now()
            : 3600000;
      throw new SourceError(
        "HTTP 429: limite da fonte atingido. Uma nova consulta será adiada.",
        Math.max(60000, Number.isFinite(milliseconds) ? milliseconds : 3600000),
      );
    }
    if (response.status >= 500 && attempt < retries) {
      await delay(400 * (attempt + 1));
      continue;
    }
    if (!response.ok)
      throw new SourceError(
        `A fonte retornou HTTP ${response.status}${response.status === 404 ? ": organização não encontrada" : ""}.`,
      );
    try {
      return await response.json();
    } catch {
      throw new SourceError("A fonte retornou JSON inválido.");
    }
  }
}
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const date = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
function validUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
const labels: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  jobicy: "Jobicy",
  adzuna: "Adzuna",
};
function make(
  source: Source,
  originId: unknown,
  title: unknown,
  link: unknown,
  description: string,
  location: string,
  publishedAt: string | null,
  employer?: string,
): Job {
  const id =
    typeof originId === "string" || typeof originId === "number"
      ? String(originId)
      : "";
  const url = validUrl(link);
  if (!id || !text(title) || !url)
    throw new SourceError(
      "Registro inválido: a fonte omitiu identificador, cargo ou URL oficial.",
    );
  return {
    id: randomUUID(),
    title: text(title),
    company: employer || source.company,
    source: labels[source.type] || source.type,
    url,
    description,
    location: location || "Não especificado",
    ...classify(text(title) + " " + location + " " + description),
    contract: /\bCLT\b/i.test(description)
      ? "CLT"
      : /\bPJ\b/.test(description)
        ? "PJ"
        : "Não especificado",
    salaryMin: null,
    salaryMax: null,
    currency: "",
    skills: extractSkills(description + " " + text(title)),
    requiredSkills: [],
    publishedAt,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    origins: [
      {
        source: source.type,
        id: ["greenhouse", "lever", "ashby"].includes(source.type)
          ? `${source.board}:${id}`
          : id,
        url,
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
    demo: false,
    geographicEligibility: location || "Não informada pela fonte",
    availability: "active",
  };
}
function list(value: unknown): any[] {
  if (!Array.isArray(value))
    throw new SourceError(
      "Resposta da fonte inválida: lista de vagas ausente.",
    );
  return value;
}
function board(source: Source) {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(source.board))
    throw new SourceError(
      "Informe o identificador verificado da página de carreiras da organização.",
    );
  return encodeURIComponent(source.board);
}
function compensation(
  job: Job,
  min: unknown,
  max: unknown,
  currency: unknown,
  period: unknown,
) {
  job.salaryMin = amount(min);
  job.salaryMax = amount(max);
  job.currency = text(currency);
  job.salaryPeriod = text(period) || "Não informado";
}
export const connectors: Record<string, Connector> = {
  smartrecruiters: {
    discovery: true,
    application: false,
    async discover(s) {
      const jobs: Job[] = [];
      const maxPostings = Math.max(
        1,
        Math.min(100, Number(process.env.SMARTRECRUITERS_MAX_POSTINGS) || 30),
      );
      for (let offset = 0; offset < maxPostings; offset += 100) {
        const data = await get(
          `https://api.smartrecruiters.com/v1/companies/${board(s)}/postings?limit=100&offset=${offset}`,
        );
        const entries = list(data.content);
        for (const summary of entries) {
          if (jobs.length >= maxPostings) return jobs;
          if (!/^[a-zA-Z0-9-]+$/.test(String(summary.id))) continue;
          const entry = await get(
            `https://api.smartrecruiters.com/v1/companies/${board(s)}/postings/${encodeURIComponent(summary.id)}`,
          );
          if (!entry.postingUrl || entry.active === false) continue;
          const location = [
            entry.location?.city,
            entry.location?.region,
            entry.location?.country,
          ]
            .filter(Boolean)
            .join(", ");
          const description = Object.values(entry.jobAd?.sections || {})
            .map((section: any) => decode(text(section.text)))
            .join("\n");
          const job = make(
            s,
            entry.id,
            entry.name,
            entry.postingUrl,
            description,
            location,
            date(entry.releasedDate),
            text(entry.company?.name) || s.company,
          );
          job.department = text(entry.department?.label);
          job.requisitionId = text(entry.refNumber) || undefined;
          if (validUrl(entry.applyUrl))
            job.applicationUrls = [
              {
                url: validUrl(entry.applyUrl),
                source: "SmartRecruiters Posting API",
              },
            ];
          if (entry.location?.remote) job.modality = "Remoto";
          jobs.push(job);
        }
        if (entries.length < 100 || offset + entries.length >= data.totalFound)
          break;
      }
      return jobs;
    },
  },
  jooble: {
    discovery: true,
    application: false,
    async discover(s) {
      if (!process.env.JOOBLE_API_KEY)
        throw new SourceError(
          "Configure uma chave Jooble autorizada para a região brasileira.",
        );
      const response = await fetch(
        `https://br.jooble.org/api/${encodeURIComponent(process.env.JOOBLE_API_KEY)}`,
        {
          method: "POST",
          redirect: "error",
          signal: discoverySignal(20000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keywords: s.board,
            location: "Brasil",
            page: "1",
          }),
        },
      );
      if (!response.ok)
        throw new SourceError(
          `A consulta Jooble retornou HTTP ${response.status}.`,
        );
      const data = (await response.json()) as any;
      return list(data.jobs).map((entry) => {
        const job = make(
          s,
          entry.id,
          entry.title,
          entry.link,
          decode(text(entry.snippet)),
          text(entry.location),
          null,
          text(entry.company),
        );
        job.availability = "unknown";
        return job;
      });
    },
  },
  greenhouse: {
    discovery: true,
    application: false,
    async discover(s) {
      const data = await get(
        `https://boards-api.greenhouse.io/v1/boards/${board(s)}/jobs?content=true`,
      );
      // updated_at is not the publication date. Unknown dates remain unknown.
      return list(data.jobs).map((j) => {
        const job = make(
          s,
          j.id,
          j.title,
          j.absolute_url,
          decode(text(j.content)),
          text(j.location?.name),
          date(j.first_published),
        );
        job.requisitionId = text(j.requisition_id) || undefined;
        job.requiredSkills=mandatoryTechnicalSkills(text(j.content));
        job.department = Array.isArray(j.departments)
          ? j.departments.map((v: any) => text(v.name)).join(" / ")
          : undefined;
        return job;
      });
    },
  },
  lever: {
    discovery: true,
    application: false,
    async discover(s) {
      const jobs: Job[] = [];
      for (let skip = 0; skip < 10000; skip += 100) {
        const data = list(
          await get(
            `https://api.lever.co/v0/postings/${board(s)}?mode=json&limit=100&skip=${skip}`,
          ),
        );
        for (const j of data) {
          const job = make(
            s,
            j.id,
            j.text,
            j.hostedUrl,
            [
              text(j.descriptionPlain) || decode(text(j.description)),
              ...list(j.lists || []).map((l) => decode(text(l.content))),
              text(j.additionalPlain),
            ].join("\n"),
            text(j.categories?.location),
            date(j.createdAt),
          );
          if (validUrl(j.applyUrl))
            job.applicationUrls = [
              { url: validUrl(j.applyUrl), source: "Lever Postings API" },
            ];
          job.requiredSkills=mandatoryTechnicalSkills([text(j.descriptionPlain),text(j.description),...list(j.lists||[]).map(l=>`<h3>${text(l.text)}</h3>${text(l.content)}`)].join('\n'));
          if (j.workplaceType)
            job.modality =
              (
                {
                  remote: "Remoto",
                  hybrid: "Híbrido",
                  "on-site": "Presencial",
                } as Record<string, string>
              )[j.workplaceType] || job.modality;
          compensation(
            job,
            j.salaryRange?.min,
            j.salaryRange?.max,
            j.salaryRange?.currency,
            j.salaryRange?.interval,
          );
          jobs.push(job);
        }
        if (data.length < 100) return jobs;
      }
      throw new SourceError(
        "A organização excedeu o limite operacional de páginas; refine a configuração.",
      );
    },
  },
  ashby: {
    discovery: true,
    application: false,
    async discover(s) {
      const data = await get(
        `https://api.ashbyhq.com/posting-api/job-board/${board(s)}?includeCompensation=true`,
      );
      return list(data.jobs)
        .filter((j) => j.isListed !== false)
        .map((j) => {
          const url = validUrl(j.jobUrl);
          const origin =
            text(j.id) ||
            (url
              ? new URL(url).pathname.split("/").filter(Boolean).at(-1)
              : "");
          const location = [
            text(j.location),
            ...(Array.isArray(j.secondaryLocations)
              ? j.secondaryLocations.map((l: any) => text(l.location))
              : []),
          ]
            .filter(Boolean)
            .join(" / ");
          const job = make(
            s,
            origin,
            j.title,
            url,
            text(j.descriptionPlain) || decode(text(j.descriptionHtml)),
            location,
            date(j.publishedAt),
          );
          if (validUrl(j.applyUrl))
            job.applicationUrls = [
              { url: validUrl(j.applyUrl), source: "Ashby Job Postings API" },
            ];
          job.requiredSkills=mandatoryTechnicalSkills(text(j.descriptionHtml)||text(j.descriptionPlain));
          job.modality =
            (
              {
                Remote: "Remoto",
                Hybrid: "Híbrido",
                OnSite: "Presencial",
              } as Record<string, string>
            )[j.workplaceType] ||
            (j.isRemote === true ? "Remoto" : job.modality);
          const salary = (
            Array.isArray(j.compensation?.summaryComponents)
              ? j.compensation.summaryComponents
              : []
          ).find((c: any) => c.compensationType === "Salary");
          if (salary)
            compensation(
              job,
              salary.minValue,
              salary.maxValue,
              salary.currencyCode,
              salary.interval,
            );
          if (j.employmentType === "Intern") job.contract = "Estágio";
          return job;
        });
    },
  },
  jobicy: {
    discovery: true,
    application: false,
    async discover(s) {
      const params = new URLSearchParams({ count: "100" });
      // Shared public feed, no paid commercial direct-link requests.
      const jobs: Job[] = [],
        cursors = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const data = await get(
          `https://jobicy.com/api/v2/remote-jobs?${params}`,
          0,
        );
        if (data.success === false)
          throw new SourceError("Jobicy informou uma falha na consulta.");
        for (const j of list(data.jobs)) {
          if (!text(j.companyName))
            throw new SourceError("Jobicy omitiu a empresa da vaga.");
          const job = make(
            s,
            j.id,
            decode(text(j.jobTitle)),
            j.url,
            decode(text(j.jobDescription)),
            text(j.jobGeo),
            date(j.pubDate),
            text(j.companyName),
          );
          job.modality = "Remoto";
          compensation(
            job,
            j.salaryMin,
            j.salaryMax,
            j.salaryCurrency,
            j.salaryPeriod,
          );
          job.geographicEligibility =
            text(j.jobGeo) ||
            "Não informada; confirme se aceita candidatos do Brasil";
          jobs.push(job);
        }
        const cursor = text(data.nextCursor);
        if (!cursor) return jobs;
        if (cursors.has(cursor))
          throw new SourceError("Jobicy retornou paginação circular.");
        cursors.add(cursor);
        params.set("cursor", cursor);
      }
      throw new SourceError("Jobicy excedeu o limite operacional de páginas.");
    },
  },
  adzuna: {
    discovery: true,
    application: false,
    async discover(s) {
      const appId = process.env.ADZUNA_APP_ID,
        appKey = process.env.ADZUNA_APP_KEY;
      const country = s.country || process.env.ADZUNA_COUNTRY || "";
      const configured = (process.env.ADZUNA_ALLOWED_COUNTRIES || "")
        .split(",")
        .map((c) => c.trim().toLowerCase());
      if (!appId || !appKey)
        throw new SourceError(
          "Adzuna requer ADZUNA_APP_ID e ADZUNA_APP_KEY no servidor.",
        );
      if (!/^[a-z]{2}$/.test(country) || !configured.includes(country))
        throw new SourceError(
          "Adzuna: confirme a cobertura e licença do país em ADZUNA_ALLOWED_COUNTRIES antes de ativar.",
        );
      const jobs: Job[] = [];
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: "50",
        what: s.board,
        "content-type": "application/json",
      });
      for (let page = 1; page <= 10; page++) {
        const data = await get(
          `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`,
        );
        const result = list(data.results);
        for (const j of result) {
          if (!text(j.company?.display_name))
            throw new SourceError("Adzuna omitiu a empresa da vaga.");
          const job = make(
            s,
            j.id,
            j.title,
            j.redirect_url,
            decode(text(j.description)),
            text(j.location?.display_name),
            date(j.created),
            text(j.company.display_name),
          );
          // Predicted salaries are estimates, not employer-published compensation.
          if (String(j.salary_is_predicted) === "0")
            compensation(
              job,
              j.salary_min,
              j.salary_max,
              text(j.salary_currency),
              "Não informado pela API",
            );
          jobs.push(job);
        }
        if (
          result.length < 50 ||
          (typeof data.count === "number" && page * 50 >= data.count)
        )
          return jobs;
      }
      // Explicit bounded window (500 results) respects optional licensed quotas.
      return jobs;
    },
  },
};
export const supportsAutomatic = () => {
  if (
    process.env.APPLICATION_WEBHOOK_AUTHORIZED !== "true" ||
    !process.env.APPLICATION_WEBHOOK_TOKEN?.trim()
  )
    return false;
  try {
    const url = new URL(process.env.APPLICATION_WEBHOOK_URL || "");
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
};
export function automaticPortals(): string[] {
  if (!supportsAutomatic()) return [];
  return (process.env.APPLICATION_WEBHOOK_PORTALS || "")
    .split(",")
    .map((portal) => portal.trim().toLowerCase())
    .filter((portal) =>
      ["linkedin", "gupy", "glassdoor", "infojobs"].includes(portal),
    );
}
