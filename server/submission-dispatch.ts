import { send } from "@vercel/queue";
import { store } from "./db";
import { vercelQueueEnabled } from "./automation-runtime";
import { accountPlan } from "./billing";

export const SUBMISSION_TOPIC = "empregatos-submissions";
export async function dispatchNextApplication(workspaceId: string) {
  if (!vercelQueueEnabled()) return false;
  const w = await store.submissionState(workspaceId);
  if (
    !w ||
    w.demo ||
    !w.routine.enabled ||
    w.routine.mode !== "automatic" ||
    w.sending
  )
    return false;
  const application = w.next;
  if (!application) return false;
  const userId = w.userId;
  const plan = userId ? await accountPlan(userId) : null;
  if (
    (w.day ===
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      ? w.attempts
      : 0) >=
    Math.min(w.routine.dailyLimit, plan?.dailyLimit ?? w.routine.dailyLimit)
  )
    return false;
  const day = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  await send(
    SUBMISSION_TOPIC,
    { workspaceId, applicationId: application.id },
    {
      idempotencyKey: `${application.id}:${application.historyLength}:${day}`,
      retentionSeconds: 604800,
    },
  );
  return true;
}
