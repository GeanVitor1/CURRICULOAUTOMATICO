import { createHash } from "node:crypto";
import type { Application, Job, Workspace } from "../shared/types";
import { analyze, matchesObjectiveFilters, normalize } from "./engine";
import { emailDestinationReady } from "./email-destination";

export function missingDataFingerprint(job: Job) {
  const { match, application, saved, ...evidence } = job;
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}
export function missingDataEligible(w: Workspace, job: Job) {
  if (!emailDestinationReady(job) || job.skills.length || job.requiredSkills.length || job.requiredYears !== null) return false;
  const filters = { ...w.filters, contracts: !job.contract || /^(nao|unknown|unspecified)/.test(normalize(job.contract)) ? [] : w.filters.contracts, dateKnownOnly: job.publishedAt ? w.filters.dateKnownOnly : false };
  return matchesObjectiveFilters(job, w.profile, filters) && analyze(job, w.profile, filters).blockers.length === 0;
}
export function missingDataAuthorized(w: Workspace, job: Job, application: Application) {
  const consent = application.missingDataConsent;
  return !!consent && consent.resumeId === application.resumeId && Date.parse(consent.confirmedAt) <= Date.now() && Date.parse(consent.expiresAt) > Date.now() && consent.fingerprint === missingDataFingerprint(job) && missingDataEligible(w, job);
}
