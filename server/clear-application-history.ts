import type { Workspace } from "../shared/types";
import { opportunityKey } from "./job-identity";
import { RequestError } from "./errors";

/** Caller must lock the workspace and cancel discovery/resolution tasks atomically. */
export function clearApplicationHistory(w: Workspace) {
  if (w.applications.some((application) => application.status === "Enviando"))
    throw new RequestError(
      "Aguarde o envio em execução antes de limpar o histórico.",
    );
  const exclusions = new Set(w.submissionExclusions || []);
  for (const application of w.applications) {
    if (
      !application.receipt &&
      !application.submittedAt &&
      !application.history.some((event) =>
        event.message.startsWith("Envio iniciado."),
      )
    )
      continue;
    const job = w.jobs.find((job) => job.id === application.jobId);
    if (job) exclusions.add(opportunityKey(job));
  }
  const removed = { jobs: w.jobs.length, applications: w.applications.length };
  w.submissionExclusions = [...exclusions];
  w.jobs = [];
  w.applications = [];
  w.runs = [];
  w.notices = [];
  delete w.jobCounts;
  delete w.routine.progress;
  return removed;
}
