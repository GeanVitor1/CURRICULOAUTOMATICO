import { randomUUID } from "node:crypto";
import type { Application, AutomationEvent, ExecutionOrigin, Job } from "../shared/types";
import { confirmedApplication } from "../shared/confirmed-applications";

/** Only codes and internal IDs enter runtime logs. No CV, contact, answer or token. */
export function traceJob(job: Job, stage: AutomationEvent["stage"], code: string) {
  job.automation ||= { correlationId: randomUUID(), origin: "legacy_unclassified", events: [] };
  const event = { at: new Date().toISOString(), stage, code };
  if (job.automation.events.at(-1)?.stage === stage && job.automation.events.at(-1)?.code === code) return;
  job.automation.events.push(event);
  job.automation.events = job.automation.events.slice(-40);
  console.info(JSON.stringify({ event: "automation_transition", jobId: job.id,
    correlationId: job.automation.correlationId, runId: job.automation.runId,
    origin: job.automation.origin, ...event }));
}

export function discoveredJob(job: Job, runId: string, origin: ExecutionOrigin) {
  job.automation ||= { correlationId: randomUUID(), origin, events: [] };
  job.automation.runId = runId;
  job.automation.origin = origin;
  traceJob(job, "discovery", "publication_observed");
}

export function bindExecution(application: Application, job: Job, individual = false) {
  if (!job.automation) traceJob(job, "preparation", "legacy_publication");
  application.execution = {
    correlationId: job.automation!.correlationId,
    runId: job.automation!.runId,
    origin: individual ? "individual_user_submission" : job.automation!.origin,
  };
  return application.execution;
}

/** Legacy mode strings never retrospectively establish autonomous provenance. */
export function confirmedAutomaticApplication(application: Application) {
  const attempt = application.attempts?.at(-1);
  return !!(confirmedApplication(application) && attempt?.outcome === "confirmed" &&
    attempt.receipt === application.receipt && attempt.runId &&
    ["scheduled_automation", "user_triggered_automation"].includes(attempt.origin) &&
    application.execution?.correlationId === attempt.correlationId);
}
