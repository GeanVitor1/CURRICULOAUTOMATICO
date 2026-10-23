import { createHash } from "node:crypto";
import type { Job } from "../shared/types";

export const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
export const companyIdentity = (value: string) =>
  normalized(value)
    .replace(/\b(ltda|limited|inc|llc|sa|s a|corporation)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function canonicalJobUrl(value: string) {
  const url = new URL(value);
  if (/(^|\.)linkedin\.com$/.test(url.hostname)) {
    const activity = url.pathname.match(/(?:activity:|activity-)(\d{10,})(?:[/-]|$)/)?.[1];
    if (activity) return `https://www.linkedin.com/feed/update/urn:li:activity:${activity}/`;
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|gh_src$|source$|src$|ref$|lever-source$)/i.test(key))
      url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  return url.href;
}
export const opportunityKey = (job: Pick<Job, "url">) =>
  createHash("sha256").update(canonicalJobUrl(job.url)).digest("hex");
export function evidenceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (!/^(jl|gh_jid|jobId|id|iv|postingId|reqId)$/i.test(key))
        url.searchParams.delete(key);
    return url.href;
  } catch {
    return value;
  }
}
const tokens = (text: string) =>
  new Set(
    normalized(text)
      .split(" ")
      .filter((word) => word.length > 2),
  );
function similarity(a: string, b: string) {
  const left = tokens(a),
    right = tokens(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.max(left.size, right.size);
}
const known = (value: string) =>
  !!value && !/^(nao |não |unknown|unspecified)/i.test(value);
export type IdentityMatch = {
  confidence: number;
  verified: boolean;
  evidence: string[];
  blockers: string[];
};
/** Evidence concerns the same vacancy, never the candidate's suitability. */
export function comparePublications(a: Job, b: Job): IdentityMatch {
  const evidence: string[] = [],
    blockers: string[] = [];
  if (
    !companyIdentity(a.company) ||
    companyIdentity(a.company) !== companyIdentity(b.company)
  )
    blockers.push("Empresas diferentes ou não identificadas.");
  if (a.availability === "closed" || b.availability === "closed")
    blockers.push("Publicação encerrada.");
  if (
    known(a.level) &&
    known(b.level) &&
    normalized(a.level) !== normalized(b.level)
  )
    blockers.push("Senioridades diferentes.");
  if (known(a.modality) && known(b.modality) && a.modality !== b.modality)
    blockers.push("Modalidades diferentes.");
  const place = (value: string) =>
    normalized(value).replace(/\b(br|brazil|todo brasil)\b/g, "brasil");
  if (
    known(a.location) &&
    known(b.location) &&
    similarity(place(a.location), place(b.location)) < 0.5
  )
    blockers.push("Localidades sem correspondência suficiente.");
  if (
    a.department &&
    b.department &&
    normalized(a.department) !== normalized(b.department)
  )
    blockers.push("Departamentos diferentes.");
  // A requisition ID is employer-scoped. IDs assigned by different ATS are not requisition IDs.
  const sameRequisition =
    !!a.requisitionId && a.requisitionId === b.requisitionId;
  if (a.requisitionId && b.requisitionId && !sameRequisition)
    blockers.push("Requisições oficiais diferentes.");
  const sameUrl = canonicalJobUrl(a.url) === canonicalJobUrl(b.url);
  const title = similarity(a.title, b.title),
    description = similarity(a.description, b.description);
  const sameProviderIds = a.origins.filter((o) =>
    b.origins.some((n) => n.source === o.source && n.id === o.id),
  );
  if (sameUrl || sameProviderIds.length)
    evidence.push("Identificador da publicação confirmado.");
  if (sameRequisition) evidence.push("Mesma requisição oficial da empresa.");
  if (!blockers.some((v) => v.startsWith("Empresas")))
    evidence.push("Empresa coincide.");
  evidence.push(
    `Similaridade de título: ${Math.round(title * 100)}%; descrição: ${Math.round(description * 100)}%.`,
  );
  // Two distinct IDs in one ATS/board must stay separate, even with identical boilerplate.
  const conflictingPublication = a.origins.some(
    (o) =>
      [
        "portal",
        "greenhouse",
        "lever",
        "ashby",
        "smartrecruiters",
        "pandape",
      ].includes(o.source) &&
      b.origins.some(
        (n) =>
          n.source === o.source &&
          n.id.split(":")[0] === o.id.split(":")[0] &&
          n.id !== o.id,
      ),
  );
  if (conflictingPublication && !sameRequisition)
    blockers.push("Publicações distintas no mesmo quadro de vagas.");
  const strongText =
    title >= 0.8 &&
    description >= 0.82 &&
    tokens(a.description).size >= 35 &&
    tokens(b.description).size >= 35 &&
    known(a.location) &&
    known(b.location);
  const verified =
    !blockers.length &&
    (sameUrl ||
      !!sameProviderIds.length ||
      (sameRequisition && title >= 0.5) ||
      strongText);
  return {
    verified,
    confidence: blockers.length
      ? 0
      : sameUrl || sameProviderIds.length
        ? 100
        : sameRequisition
          ? 98
          : Math.round((title * 0.3 + description * 0.7) * 100),
    evidence,
    blockers,
  };
}

const equivalents = [
  [
    "desenvolvedor react",
    "react developer",
    "frontend developer",
    "desenvolvedor front end",
    "software engineer frontend",
    "engenheiro de software front end",
  ],
  [
    "desenvolvedor backend",
    "backend developer",
    "desenvolvedor back end",
    "software engineer backend",
  ],
  [
    "auxiliar administrativo",
    "assistente administrativo",
    "administrative assistant",
  ],
];
export function expandSearchTitles(titles: string[], limit = 8) {
  const expanded = [...titles];
  for (const title of titles) {
    const value = normalized(title)
      .replace(/\b(junior|pleno|senior|jr|sr)\b/g, "")
      .trim();
    const group = equivalents.find((items) =>
      items.some((item) => normalized(item) === value),
    );
    if (group) expanded.push(...group);
  }
  // Synonyms expand discovery only. Seniority and objective filters still run unchanged.
  return [...new Set(expanded)].slice(0, limit);
}
