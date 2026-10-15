import { QueueClient } from "@vercel/queue";
import { z } from "zod";
import { validateHostedRuntime } from "./auth-config";
import { automaticSend, recoverInterruptedSends } from "./operations";
import { readWorkspace, mutateWorkspace } from "./db";
import { dispatchNextApplication } from "./submission-dispatch";
import { DailyLimitError, RequestError } from "./errors";
const payload = z.object({
  workspaceId: z.string().min(1).max(200),
  applicationId: z.string().uuid(),
});
const client = new QueueClient();
export default client.handleNodeCallback(
  async (message) => {
    validateHostedRuntime();
    const parsed = payload.safeParse(message);
    if (!parsed.success) {
      console.error(JSON.stringify({ event: "invalid_submission_message" }));
      return;
    }
    await recoverInterruptedSends();
    const { workspaceId, applicationId } = parsed.data;
    const before = await readWorkspace(workspaceId);
    const application = before?.applications.find(
      (a) => a.id === applicationId,
    );
    if (
      !before?.routine.enabled ||
      before.routine.mode !== "automatic" ||
      !application
    )
      return;
    if (application.status !== "Aguardando aprovação") {
      await dispatchNextApplication(workspaceId);
      return;
    }
    try {
      await automaticSend(workspaceId, applicationId);
    } catch (error) {
      if (error instanceof DailyLimitError) return;
      if (!(error instanceof RequestError)) throw error;
      await mutateWorkspace(workspaceId, (w) => {
        const a = w.applications.find((a) => a.id === applicationId);
        if (a?.status !== "Aguardando aprovação") return;
        a.status = "Requer ação manual";
        a.updatedAt = new Date().toISOString();
        a.history.push({
          at: a.updatedAt,
          actor: "Sistema",
          message: error.message,
        });
      });
    }
    await dispatchNextApplication(workspaceId);
  },
  { visibilityTimeoutSeconds: 240, retry: () => ({ afterSeconds: 60 }) },
);
