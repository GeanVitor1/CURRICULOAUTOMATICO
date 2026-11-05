import { createHash, timingSafeEqual } from "node:crypto";
import type { Store } from "./storage-types";
import { and, eq } from "./storage-types";
import { confirmedApplication } from "../shared/confirmed-applications";
import { confirmedAutomaticApplication } from "./automation-trace";
import { dailySubmissionAttempts } from "./submission-attempts";
import { matchesSelectedSites, matchesObjectiveFilters } from "./engine";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const dayOf = (s: string | Date) => new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
/** A revocable capability for one workspace and one read-only route. No IAM grant. */
export function diagnosticsWorkspace(key: unknown): string | null {
  const expected = process.env.AUTOMATION_OBSERVER_KEY_SHA256;
  const workspace = process.env.AUTOMATION_OBSERVER_WORKSPACE;
  if (!workspace || !expected || !/^[a-f0-9]{64}$/.test(expected) ||
      typeof key !== "string" || key.length < 32 || key.length > 256) return null;
  return timingSafeEqual(Buffer.from(hash(key), "hex"), Buffer.from(expected, "hex")) ? workspace : null;
}
export async function automationDiagnostics(store: Store, workspaceId: string, day: string) {
  const [row] = await store.select("workspaces", { where: eq("id", workspaceId) });
  if (!row || row.demo) throw new Error("Diagnostic workspace unavailable");
  const w = row.data;
  const [discovery, resolution, usage, submission] = await Promise.all([
    store.select("discoveryTasks", { where: eq("workspaceId", workspaceId) }),
    store.select("resolutionTasks", { where: eq("workspaceId", workspaceId) }),
    store.select("applicationUsage", { where: and(eq("userId", row.userId), eq("day", day)) }),
    store.submissionState(workspaceId),
  ]);
  const confirmed = w.applications.filter(confirmedApplication);
  const automaticToday = confirmed.filter(a => confirmedAutomaticApplication(a) && dayOf(a.submittedAt!) === day).length;
  const tasks = (rows: typeof discovery) => rows.filter(t => dayOf(t.createdAt) === day || ["queued", "running", "failed"].includes(t.status))
    .map(t => ({ id: t.id, status: t.status, attempts: t.attempts, createdAt: t.createdAt,
      updatedAt: t.updatedAt, leaseUntil: t.leaseUntil, errorPresent: !!t.lastError,
      staleLease: t.status === "running" && !!t.leaseUntil && t.leaseUntil.getTime() < Date.now() }));
  const historical = dailySubmissionAttempts(w, new Date(`${day}T12:00:00-03:00`));
  return {
    at: new Date().toISOString(), day, readOnly: true, workspaceId,
    workspaceRevision: row.updatedAt.toISOString(),
    deployment: process.env.VERCEL_DEPLOYMENT_ID, revision: process.env.EMPREGATOS_REVISION,
    runtime: {node:process.versions.node,undici:process.versions.undici},
    filtersSha256: hash(JSON.stringify(w.filters)),
    schedule: { enabled: w.routine.enabled, mode: w.routine.mode, lastRun: w.routine.lastRun, nextRun: w.routine.nextRun },
    counts: { jobs: w.jobs.length, confirmedRetained: confirmed.length, confirmedAutomaticToday: automaticToday,
      quotaReservations: usage.length, historicalAttempts: historical, effectiveUsage: Math.max(usage.length, historical),
      attemptsToday: w.applications.flatMap(a => a.attempts || []).filter(t => dayOf(t.startedAt) === day).length },
    panel: { confirmedIds: confirmed.map(a => a.id),
      collected: w.jobs.filter(j=>!j.discarded&&j.availability!=="closed"&&matchesSelectedSites(j,w)).length,
      filtered: w.jobs.filter(j=>!j.discarded&&j.availability!=="closed"&&matchesSelectedSites(j,w)&&matchesObjectiveFilters(j,w.profile,w.filters)).length,
      progress: w.routine.progress,
      progressConsistent: w.routine.progress?.day === day ? w.routine.progress.sent === automaticToday && w.routine.progress.usedToday === Math.max(usage.length, historical) : null },
    runs: w.runs.filter(r => dayOf(r.at) === day).map(({searchSuggestions, ...r}) => r),
    tasks: { discovery: tasks(discovery), resolution: tasks(resolution) },
    submission: submission && { sending: submission.sending, next: submission.next, attempts: submission.attempts, day: submission.day },
    quota: usage.map(u => ({ applicationId: u.applicationId, day: u.day })),
    applications: w.applications.map(a => ({ id: a.id, jobId: a.jobId, status: a.status, execution: a.execution,
      submittedAt: a.submittedAt, receiptSha256: a.receipt ? hash(a.receipt) : null,
      confirmed: confirmedApplication(a), reconciliations: a.reconciliations, retryOf:a.retryOf, retryEvaluation:a.retryEvaluation,
      attempts: a.attempts?.map(({ receipt, ...t }) => ({ ...t, receiptSha256: receipt ? hash(receipt) : null })) })),
    workerEvents: (w.workerEvents || []).filter(e => dayOf(e.at) === day),
    limitations: ["Task attempts are not queue delivery counts.", "Worker events begin with the instrumented deployment; earlier messages require platform logs."],
  };
}
