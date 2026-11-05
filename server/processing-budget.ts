import type { Workspace } from "../shared/types";
export type ResumeProcessingAction = "upload" | "build" | "analysis";
export const PROCESSING_WINDOW_MS = 60000, PROCESSING_LEASE_MS = 180000;
export class ProcessingBudgetError extends Error {
  readonly statusCode = 429;
  readonly code = "ACCOUNT_PROCESSING_LIMIT";
  constructor(readonly retryAfter: number) {
    super("Aguarde o processamento atual ou o limite por minuto da sua conta antes de tentar novamente.");
  }
}
/** Must run inside the workspace transaction. No per-process or per-IP state. */
export function claimResumeProcessing(w: Workspace, action: ResumeProcessingAction, token: string, at = Date.now()) {
  const budget = w.processingSecurity || { buckets: {} };
  if (budget.lease && budget.lease.until>at) throw new ProcessingBudgetError(Math.max(1,Math.ceil((budget.lease.until-at)/1000)));
  const recent = (budget.buckets[action] || []).filter(time=>time>at-PROCESSING_WINDOW_MS && time<=at);
  if (recent.length>=5) throw new ProcessingBudgetError(Math.max(1,Math.ceil((recent[0]+PROCESSING_WINDOW_MS-at)/1000)));
  budget.buckets[action]=[...recent,at];
  budget.lease={token,until:at+PROCESSING_LEASE_MS};
  w.processingSecurity=budget;
}
export function releaseResumeProcessing(w: Workspace, token: string) {
  if (w.processingSecurity?.lease?.token===token) delete w.processingSecurity.lease;
}
