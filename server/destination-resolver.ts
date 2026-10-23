import type { ApplicationDestination, Job } from "../shared/types";
import {
  comparePublications,
  canonicalJobUrl,
  evidenceUrl,
  normalized,
} from "./job-identity";
import { decode } from "./html";
import { detectAts, destinationBrowserAllowed } from "./ats-registry";
import {
  applicationLinks,
  destinationFromPage,
  publicationFromStructured,
  structuredJobs,
  enrichOriginFromPage,
  employerCareerLinks,
} from "./destination-page";
import { readPublicPage, type PublicPage } from "./public-web";
import { verifyEmailDestination, emailDestinationReady } from "./email-destination";

export type ResolverDependencies = {
  readPage?: (url: string) => Promise<PublicPage>;
  search?: (job: Job) => Promise<{ urls: string[]; available: boolean }>;
  candidates?: Job[];
  maxPages?: number;
  timeoutMs?: number;
};
/** All I/O is bounded. A login wall is a reason to look elsewhere, never a global prerequisite. */
export async function resolveApplicationDestinations(
  job: Job,
  deps: ResolverDependencies = {},
): Promise<Job> {
  job = structuredClone(job);
  const result = structuredClone(job),
    at = Date.now(),
    deadline = at + Math.min(deps.timeoutMs || 45000, 90000);
  delete result.emailDestination;
  const read =
    deps.readPage ||
    ((url: string) =>
      readPublicPage(
        url,
        AbortSignal.timeout(
          Math.max(1, Math.min(10000, deadline - Date.now())),
        ),
      ));
  const consulted: NonNullable<Job["resolution"]>["consulted"] = [],
    matches: NonNullable<Job["resolution"]>["matches"] = [];
  const destinations: ApplicationDestination[] = [];
  const queue: { url: string; candidate?: Job; linked: boolean }[] = [
    { url: job.url, candidate: job, linked: false },
  ];
  for (const hint of job.applicationUrls || [])
    queue.push({ url: hint.url, candidate: job, linked: true });
  for (const candidate of (deps.candidates || []).slice(0, 100)) {
    const match = comparePublications(job, candidate);
    matches.push({
      url: candidate.url,
      confidence: match.confidence,
      verified: match.verified,
      reasons: [...match.evidence, ...match.blockers],
    });
    if (match.verified) {
      queue.push({ url: candidate.url, candidate, linked: false });
      for (const hint of candidate.applicationUrls || [])
        queue.push({ url: hint.url, candidate, linked: true });
    }
  }
  consulted.push({
    source: "catalog",
    outcome: "Publicações comparadas por empresa, identificadores e conteúdo.",
    count: deps.candidates?.length || 0,
  });
  let searchComplete = false,
    partial = false;
  // External search is mandatory when known records do not yield a viable destination.
  const seen = new Set<string>();
  const limit = Math.min(deps.maxPages || 8, 12);
  for (let index = 0; index < 64; index++) {
    if (!queue.length && !searchComplete) {
      searchComplete = true;
      if (Date.now() >= deadline) {
        partial = true;
        break;
      }
      try {
        const alreadyViable = emailDestinationReady(result) || destinations.some(
          (item) =>
            item.formFound &&
            item.state === "verified" &&
            destinationBrowserAllowed(item),
        );
        const search = alreadyViable
          ? { urls: [], available: true }
          : await deps.search?.(job);
        consulted.push({
          source: "public_search",
          outcome: alreadyViable
            ? "Destino oficial autorizado já identificado nos links publicados."
            : search?.available
              ? "Referências devolvidas pelo mecanismo de busca."
              : "Mecanismo de busca não configurado.",
          count: search?.urls.length || 0,
        });
        if (!search?.available) partial = true;
        for (const url of search?.urls || [])
          queue.push({ url, linked: false });
      } catch {
        partial = true;
        consulted.push({
          source: "public_search",
          outcome: "Consulta indisponível; reavaliar posteriormente.",
          count: 0,
        });
      }
    }
    const item = queue.shift();
    if (!item) break;
    if (seen.size >= limit || Date.now() >= deadline) {
      partial = true;
      break;
    }
    let identity: string;
    try {
      identity = canonicalJobUrl(item.url);
    } catch {
      continue;
    }
    if (seen.has(identity)) continue;
    seen.add(identity);
    try {
      const page = await read(item.url);
      if (page.status >= 400) {
        partial = true;
        consulted.push({
          source: item.url,
          outcome: `HTTP ${page.status}`,
          count: 0,
        });
        continue;
      }
      const structured = structuredJobs(page.html);
      if (canonicalJobUrl(page.url) === canonicalJobUrl(job.url) && /candidatura por e-?mail|envie (?:seu |o )?curr[ií]culo/i.test(decode(page.html))) {
        try {
          result.emailDestination = await verifyEmailDestination(job, undefined,
            url => canonicalJobUrl(url) === canonicalJobUrl(job.url) ? Promise.resolve(page) : read(url));
          consulted.push({source:page.url,outcome:"Destinatário de candidatura confirmado no anúncio e no site da empresa.",count:1});
        } catch {
          consulted.push({source:page.url,outcome:"O endereço publicado não pôde ser confirmado como canal de candidatura da empresa.",count:0});
        }
      }
      queue.unshift(
        ...employerCareerLinks(page, job).map((url) => ({ url, linked: true })),
      );
      if (canonicalJobUrl(page.url) === canonicalJobUrl(job.url)) {
        const enriched = enrichOriginFromPage(job, page);
        if (enriched) {
          job = enriched;
          Object.assign(result, {
            title: job.title,
            description: job.description,
            company: job.company,
            location: job.location,
            modality: job.modality,
            level: job.level,
            contract: job.contract,
          });
        }
      }
      const candidates = structured
        .map((data) => publicationFromStructured(job, data, page.url))
        .filter((v): v is Job => !!v);
      // A linked Lever /apply page preserves the posting identity but omits the
      // structured description. Carry only an already verified candidate across
      // this exact same-origin, same-board, same-posting transition.
      const pageAts = detectAts(page.url);
      const candidateAts = item.candidate && detectAts(item.candidate.url);
      const linkedLeverForm = !!(
        item.linked &&
        item.candidate &&
        pageAts?.platform === "lever" &&
        candidateAts?.platform === "lever" &&
        pageAts.board === candidateAts.board &&
        pageAts.postingId === candidateAts.postingId &&
        new URL(page.url).origin === new URL(item.candidate.url).origin &&
        new URL(page.url).pathname.replace(/\/$/, "") ===
          new URL(item.candidate.url).pathname.replace(/\/$/, "") + "/apply"
      );
      const pageText = ` ${normalized(decode(page.html))} `;
      // Trusted API candidate still needs visible title and company evidence.
      if (
        item.candidate &&
        pageAts &&
        (canonicalJobUrl(page.url) === canonicalJobUrl(item.candidate.url) ||
          linkedLeverForm) &&
        pageText.includes(` ${normalized(item.candidate.title)} `) &&
        pageText.includes(` ${normalized(item.candidate.company)} `)
      )
        candidates.push({ ...item.candidate, url: page.url });
      let accepted: Job | undefined;
      for (const candidate of candidates) {
        const match = comparePublications(job, candidate);
        matches.push({
          url: page.url,
          confidence: match.confidence,
          verified: match.verified,
          reasons: [...match.evidence, ...match.blockers],
        });
        const destination = destinationFromPage(
          job,
          candidate,
          page,
          item.linked,
        );
        if (destination) {
          accepted = candidate;
          if (
            !destinations.some(
              (d) =>
                canonicalJobUrl(d.url) === canonicalJobUrl(destination.url),
            )
          )
            destinations.push(destination);
        }
      }
      // Follow apply links only from a publication whose identity has been checked.
      if (accepted || canonicalJobUrl(page.url) === canonicalJobUrl(job.url))
        for (const url of applicationLinks(page, job.title))
          queue.push({ url, linked: true, candidate: accepted || job });
      else if (
        /\.pandape\.infojobs\.com\.br$/.test(new URL(page.url).hostname) ||
        item.linked
      )
        for (const url of applicationLinks(page, job.title))
          queue.push({ url, linked: true });
      consulted.push({
        source: page.url,
        outcome: accepted
          ? "Correspondência verificada."
          : "Página lida; identidade/formulário ainda não comprovados.",
        count: candidates.length,
      });
    } catch {
      partial = true;
      consulted.push({
        source: item.url,
        outcome: "Leitura recusada ou indisponível.",
        count: 0,
      });
    }
  }
  for (const destination of destinations)
    destination.method =
      destination.state === "verified" &&
      destination.formFound &&
      destinationBrowserAllowed(destination)
        ? "browser"
        : "assisted";
  result.destinations = destinations.sort(
    (a, b) =>
      Number(b.method === "browser") - Number(a.method === "browser") ||
      Number(b.state === "verified") - Number(a.state === "verified") ||
      b.confidence - a.confidence,
  );
  result.resolution = {
    state: emailDestinationReady(result) || destinations.some((d) => d.state === "verified")
      ? "verified"
      : partial
        ? "partial"
        : "no_destination",
    checkedAt: new Date(at).toISOString(),
    retryAt: new Date(at + (partial ? 3600000 : 86400000)).toISOString(),
    complete: !partial && searchComplete,
    consulted: consulted.map((item) => ({
      ...item,
      source: evidenceUrl(item.source),
    })),
    matches: matches
      .slice(0, 100)
      .map((item) => ({ ...item, url: evidenceUrl(item.url) })),
    message: emailDestinationReady(result) ? "E-mail de candidatura confirmado no anúncio e no site da empresa. Conecte o Gmail e revise a candidatura antes de enviar." : destinations.some((d) => d.state === "verified")
      ? "Destino independente identificado; envio depende do formulário e das permissões."
      : partial
        ? "Busca cruzada parcial. Há fontes pendentes; a oportunidade será reavaliada."
        : "Nenhum destino automatizável identificado nas fontes consultadas. Outros destinos podem existir.",
  };
  return result;
}
