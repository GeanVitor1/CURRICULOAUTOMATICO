import { send } from "@vercel/queue";
import { readWorkspace } from "./db";
import { vercelQueueEnabled } from "./automation-runtime";
import { dailySubmissionAttempts } from "./submission-routing";
import { accountPlan } from "./billing";

export const SUBMISSION_TOPIC = "empregatos-submissions";
export async function dispatchNextApplication(workspaceId: string) {
  if (!vercelQueueEnabled()) return false;
  const w = await readWorkspace(workspaceId);
  if (
    !w ||
    w.demo ||
    !w.routine.enabled ||
    w.routine.mode !== "automatic" ||
    w.applications.some((a) => a.status === "Enviando")
  )
    return false;
  const application = w.applications.find(
    (a) => a.status === "Aguardando aprovação",
  );
  if (!application) return false;
  const userId = workspaceId.endsWith(":live") ? workspaceId.slice(0, -5) : "";
  const plan = userId ? await accountPlan(userId) : null;
  if (
    dailySubmissionAttempts(w) >=
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
      idempotencyKey: `${application.id}:${application.history.length}:${day}`,
      retentionSeconds: 604800,
    },
  );
  return true;
}
