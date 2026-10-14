import { send } from "@vercel/queue";
import { vercelQueueEnabled } from "./automation-runtime";

export const DISCOVERY_TOPIC = "empregatos-discovery";

export async function dispatchDiscovery(taskId: string) {
  if (!vercelQueueEnabled()) return;
  try {
    await send(
      DISCOVERY_TOPIC,
      { taskId },
      {
        idempotencyKey: taskId,
        retentionSeconds: 604800,
      },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "discovery_publish_failed",
        taskId,
        type: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    throw Object.assign(
      new Error(
        "Suas preferências foram salvas, mas a busca não conseguiu iniciar. Tente buscar novamente em instantes.",
      ),
      { statusCode: 503 },
    );
  }
}
