import { createHash } from "node:crypto";
import type { Workspace } from "../shared/types";
import { RequestError } from "./errors";

export type NonReceiptEvidence = {
  applicationId: string;
  attemptId: string;
  startedAt: string;
  publicationUrl: string;
  candidateEmailSha256: string;
  threadId: string;
  messageId: string;
  replyAt: string;
  evidenceSha256: string;
};
export const candidateEmailHash = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** Operator-verified employer evidence. This does not authorize a retry or refund
 * a post-submit attempt; both the old quota record and deduplication stay intact. */
export function reconcileEmployerNonReceipt(w: Workspace, evidence: NonReceiptEvidence) {
  const a = w.applications.find(a => a.id === evidence.applicationId);
  const job = a && w.jobs.find(j => j.id === a.jobId);
  const attempt = a?.attempts?.find(t => t.id === evidence.attemptId);
  const prior = a?.reconciliations?.find(r => r.messageId === evidence.messageId);
  if (prior) {
    if (prior.attemptId !== evidence.attemptId || prior.evidenceSha256 !== evidence.evidenceSha256)
      throw new RequestError("Evidência já vinculada a outra reconciliação.");
    return { changed: false, reconciliation: prior };
  }
  if (!a || !job || !attempt || a.status !== "Resultado desconhecido" ||
      a.receipt || a.submittedAt || attempt.outcome !== "unknown" ||
      a.attempts?.at(-1)?.id !== attempt.id || attempt.startedAt !== evidence.startedAt ||
      job.url !== evidence.publicationUrl ||
      candidateEmailHash(w.profile.email) !== evidence.candidateEmailSha256 ||
      !attempt.finishedAt || !Number.isFinite(Date.parse(evidence.replyAt)) ||
      Date.parse(evidence.replyAt) <= Date.parse(attempt.finishedAt) ||
      !/^[a-f0-9]{64}$/.test(evidence.evidenceSha256) ||
      !/^[a-f0-9]{10,40}$/.test(evidence.threadId) || !/^[a-f0-9]{10,40}$/.test(evidence.messageId))
    throw new RequestError("A evidência não corresponde precisamente à tentativa incerta atual.");
  const at = new Date().toISOString();
  const reconciliation = {
    id: `employer:${evidence.messageId}:${attempt.id}`, at, attemptId: attempt.id,
    outcome: "not_received" as const, source: "official_employer_reply" as const,
    threadId: evidence.threadId, messageId: evidence.messageId,
    replyAt: evidence.replyAt, evidenceSha256: evidence.evidenceSha256,
    quotaDisposition: "retained_post_submit_attempt" as const, retryAuthorized: false as const,
  };
  (a.reconciliations ||= []).push(reconciliation);
  a.status = "Falha no envio";
  a.updatedAt = at;
  // A reconciliation must not silently become the pre-submit resume mechanism.
  delete a.resumeState;
  a.history.push({ at, actor: "Operador", message:
    `Resposta oficial do empregador confirmou não recebimento da tentativa ${attempt.id}. ` +
    `Evidência ${evidence.messageId}; tentativa e reserva originais preservadas. ` +
    "Nenhum recibo criado. Nova tentativa não autorizada; exige revalidação completa." });
  return { changed: true, reconciliation };
}
