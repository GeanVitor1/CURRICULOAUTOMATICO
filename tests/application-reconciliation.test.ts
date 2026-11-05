import { it, expect } from "vitest";
import { createWorkspace } from "../server/workspace";
import { reconcileEmployerNonReceipt, candidateEmailHash, type NonReceiptEvidence } from "../server/application-reconciliation";
import { dailySubmissionAttempts } from "../server/submission-attempts";
import { submissionState } from "../server/submission-state";

function fixture() {
  const w = createWorkspace("QA", "qa@example.test");
  w.routine.enabled = true; w.routine.mode = "automatic";
  w.jobs = [{ id: "job", url: "https://jobs.quickin.io/company/jobs/one" } as any];
  w.submissionExclusions = ["keep-existing-fingerprint"];
  w.applications = [{ id: "app", jobId: "job", status: "Resultado desconhecido", receipt: null,
    resumeId: "resume", createdAt: "2026-10-23T13:51:00Z", updatedAt: "2026-10-23T13:53:00Z", mode: "automatic", note: "",
    attempts: [{ id: "attempt", startedAt: "2026-10-23T13:52:21.765Z", finishedAt: "2026-10-23T13:52:39.795Z", outcome: "unknown", origin: "user_triggered_automation", executor: "ats_browser", correlationId: "correlation" }],
    history: [{ at: "2026-10-23T13:52:21.765Z", actor: "Sistema", message: "Envio iniciado." }] }];
  const e: NonReceiptEvidence = { applicationId: "app", attemptId: "attempt", startedAt: w.applications[0].attempts![0].startedAt,
    publicationUrl: w.jobs[0].url, candidateEmailSha256: candidateEmailHash(w.profile.email),
    threadId: "1a16937d1e63856d", messageId: "1a16a33ce23f137c", replyAt: "2026-10-23T19:18:57Z", evidenceSha256: "a".repeat(64) };
  return { w, e };
}
it("reconciles without altering the original attempt, refunding a transmission or authorizing another", () => {
  const { w, e } = fixture(); const before = structuredClone(w.applications[0]);
  expect(reconcileEmployerNonReceipt(w, e).changed).toBe(true);
  const a = w.applications[0];
  expect(a.status).toBe("Falha no envio"); expect(a.receipt).toBeNull(); expect(a.submittedAt).toBeUndefined();
  expect(a.attempts).toEqual(before.attempts); expect(a.history.slice(0, -1)).toEqual(before.history);
  expect(a.resumeState).toBeUndefined(); expect(a.reconciliations![0].retryAuthorized).toBe(false);
  expect(w.submissionExclusions).toEqual(["keep-existing-fingerprint"]);
  expect(submissionState(w,"owner").next).toBeNull();
  expect(dailySubmissionAttempts(w,new Date("2026-10-23T17:00:00Z"))).toBe(1);
  expect(reconcileEmployerNonReceipt(w,e).changed).toBe(false); expect(a.reconciliations).toHaveLength(1);
});
it.each(["attemptId", "startedAt", "publicationUrl", "candidateEmailSha256", "replyAt", "evidenceSha256"])("rejects a mismatched %s without mutation", key => {
  const {w,e}=fixture(), before=JSON.stringify(w);
  expect(()=>reconcileEmployerNonReceipt(w,{...e,[key]:"mismatch"})).toThrow(); expect(JSON.stringify(w)).toBe(before);
});
it.each(["laterAttempt","receipt","sent"])("rejects stale evidence after %s", change => {
  const {w,e}=fixture(),a=w.applications[0];
  if(change==="laterAttempt")a.attempts!.push({...a.attempts![0],id:"later"});
  if(change==="receipt")a.receipt="real-receipt";
  if(change==="sent")a.submittedAt="2026-10-24T12:00:00Z";
  expect(()=>reconcileEmployerNonReceipt(w,e)).toThrow();
});
