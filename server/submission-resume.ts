import type { Application, Job } from "../shared/types";
export function resumableJobSubmission(application: Application, job: Job) {
  if (resumableSubmission(application,job.url)) return true;
  const state=application.resumeState;
  return !!state && state.kind==="ats" && state.targetUrl===state.destinationUrl &&
    !!job.destinations?.some(d=>d.url===state.targetUrl && d.state==="verified" && Date.parse(d.expiresAt)>Date.now()) &&
    resumableSubmission(application,state.destinationUrl);
}
export function resumableSubmission(
  application: Application,
  destinationUrl: string,
) {
  const state = application.resumeState;
  return (
    !!state &&
    !application.receipt &&
    !application.submittedAt &&
    ["Requer ação manual", "Aguardando aprovação"].includes(
      application.status,
    ) &&
    state.resumeId === application.resumeId &&
    state.destinationUrl === destinationUrl &&
    Number.isFinite(Date.parse(state.recordedAt))
  );
}
