import { QueueClient } from "@vercel/queue";
import { z } from "zod";
import { processResolutionTask, ResolutionBusyError } from "./resolution-queue";
import { withDiscoveryBudget } from "./discovery-budget";
const client = new QueueClient();
export default client.handleNodeCallback(
  async (message,metadata) => {
    const parsed = z.object({ taskId: z.string().uuid() }).safeParse(message);
    if (!parsed.success) return;
    console.info(JSON.stringify({event:'destination_queue_received',taskId:parsed.data.taskId,messageId:metadata.messageId,deliveryCount:metadata.deliveryCount,topic:metadata.topicName,consumer:metadata.consumerGroup}));
    await withDiscoveryBudget(240000, () =>
      processResolutionTask(parsed.data.taskId),
    );
  },
  {
    visibilityTimeoutSeconds: 420,
    retry: (error, metadata) =>
      metadata.deliveryCount >= 5
        ? { acknowledge: true }
        : { afterSeconds: error instanceof ResolutionBusyError ? 420 : 60 },
  },
);
