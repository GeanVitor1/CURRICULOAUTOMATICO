import { QueueClient } from "@vercel/queue";
import { z } from "zod";
import { validateHostedRuntime } from "./auth-config";
import { withDiscoveryBudget } from "./discovery-budget";
import { recoverInterruptedSends } from "./operations";
import {
  DiscoveryTaskBusyError,
  processNextDiscoveryTask,
} from "./discovery-queue";

const payload = z.object({ taskId: z.string().uuid() });
const client = new QueueClient();

export default client.handleNodeCallback(
  async (message) => {
    validateHostedRuntime();
    const parsed = payload.safeParse(message);
    if (!parsed.success) {
      console.error(JSON.stringify({ event: "invalid_discovery_message" }));
      return;
    }
    // The database claim prevents a duplicate delivery from repeating an application.
    await recoverInterruptedSends();
    await withDiscoveryBudget(240000, () =>
      processNextDiscoveryTask(parsed.data.taskId),
    );
  },
  {
    visibilityTimeoutSeconds: 420,
    retry: (error) => ({
      afterSeconds: error instanceof DiscoveryTaskBusyError ? 420 : 60,
    }),
  },
);
