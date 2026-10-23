import { QueueClient } from "@vercel/queue";
import { z } from "zod";
import { validateHostedRuntime } from "./auth-config";
import { automaticSend, recoverInterruptedSends } from "./operations";
import { store, mutateWorkspace } from "./db";
import { dispatchNextApplication } from "./submission-dispatch";
import { DailyLimitError, RequestError } from "./errors";
import { continueAutomaticCycle } from "./automatic-cycle";
import { preparationFingerprint } from "./submission-preparation";
const payload = z.object({
  workspaceId: z.string().min(1).max(200),
  applicationId: z.string().uuid(),
});
const client = new QueueClient();
export default client.handleNodeCallback(
  async (message, metadata) => {
    validateHostedRuntime();
    const parsed = payload.safeParse(message);
    if (!parsed.success) {
      console.error(JSON.stringify({ event: "invalid_submission_message" }));
      return;
    }
    const { workspaceId, applicationId } = parsed.data;
    console.info(JSON.stringify({event:"submission_queue_received",workspaceId,applicationId,
      messageId:metadata.messageId,deliveryCount:metadata.deliveryCount,topic:metadata.topicName,
      consumer:metadata.consumerGroup,revision:process.env.EMPREGATOS_REVISION}));
    await recoverInterruptedSends(workspaceId);
    const before = await store.submissionState(workspaceId);
    if (
      !before ||
      ((!before.routine.enabled || before.routine.mode !== "automatic") &&
        !before.next?.single) ||
      !before.next
    )
      {
        // A retry may arrive after the result committed but before continuation
        // published. Always rebuild the next step from the persisted state.
        await continueAutomaticCycle(workspaceId);
        return;
      }
    if (before.next.id !== applicationId || before.sending) {
      await dispatchNextApplication(workspaceId);
      await continueAutomaticCycle(workspaceId);
      return;
    }
    try {
      await automaticSend(workspaceId, applicationId);
      // Explicit deployment-only fault injection for the isolated integration
      // account. Never changes eligibility, receipts, reservations or retries.
      if (process.env.QUEUE_INTEGRATION_WORKSPACE === workspaceId &&
          process.env.QUEUE_INTEGRATION_APPLICATION === applicationId && metadata.deliveryCount === 1) {
        const [testOwner] = await store.select("users",{where:(await import("./storage-types")).eq("id",before.userId),columns:["email"]});
        if(testOwner?.email === "queues-qa@example.test") {
          console.info(JSON.stringify({event:"queue_integration_postcommit_fault",workspaceId,applicationId,messageId:metadata.messageId}));
          throw new Error("ControlledQueuePostcommitFailure");
        }
      }
    } catch (error) {
      if (error instanceof DailyLimitError) {
        await continueAutomaticCycle(workspaceId,{allowResearch:false});
        return;
      }
      if (!(error instanceof RequestError)) throw error;
      await mutateWorkspace(workspaceId, (w) => {
        const a = w.applications.find((a) => a.id === applicationId);
        if (a?.status !== "Aguardando aprovação") return;
        a.status = "Requer ação manual";
        a.automaticBlockedFingerprint=preparationFingerprint(w,a);
        a.updatedAt = new Date().toISOString();
        a.history.push({
          at: a.updatedAt,
          actor: "Sistema",
          message: error.message,
        });
      });
    }
    await dispatchNextApplication(workspaceId);
    await continueAutomaticCycle(workspaceId);
  },
  { visibilityTimeoutSeconds: 240, retry: (error,metadata) => {
    const e=error as {name?:string;code?:string|number;message?:string};
    console.error(JSON.stringify({event:"submission_queue_retry",messageId:metadata.messageId,
      deliveryCount:metadata.deliveryCount,type:e.name,code:e.code,
      detail:e.message?.replace(/https?:\/\/\S+/g,"[url]").replace(/[\w.+-]+@[\w.-]+/g,"[email]").slice(0,400)}));
    return {afterSeconds:60};
  } },
);
