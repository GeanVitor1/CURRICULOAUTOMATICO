import { store, mutateWorkspace } from "./db";
import { eq } from "./storage-types";
import type { Workspace } from "../shared/types";
type Event = NonNullable<Workspace["workerEvents"]>[number];
type Metadata = { messageId: string; deliveryCount: number };

/** Telemetry cannot cause a completed external submission to be repeated. */
async function record(workspaceId: string, event: Omit<Event, "at">) {
  try {
    await mutateWorkspace(workspaceId, w => {
      const events = w.workerEvents ||= [];
      events.push({ ...event, at: new Date().toISOString() });
      w.workerEvents = events.slice(-200);
    });
  } catch {
    console.error(JSON.stringify({ event: "worker_observation_failed", kind: event.kind,
      subjectId: event.subjectId, messageId: event.messageId }));
  }
}
export async function observeWorker<T>(kind: Event["kind"], subjectId: string, metadata: Metadata,
  run: () => Promise<T>, workspaceId?: string): Promise<T> {
  if (!workspaceId) {
    const [task] = await store.select(kind === "discovery" ? "discoveryTasks" : "resolutionTasks",
      { where: eq("id", subjectId), columns: ["workspaceId"] });
    workspaceId = task?.workspaceId;
  }
  const base = { kind, subjectId, messageId: metadata.messageId, deliveryCount: metadata.deliveryCount,
    ...(process.env.VERCEL_DEPLOYMENT_ID ? { deployment: process.env.VERCEL_DEPLOYMENT_ID } : {}),
    ...(process.env.EMPREGATOS_REVISION ? { revision: process.env.EMPREGATOS_REVISION } : {}) };
  if (workspaceId) await record(workspaceId, { ...base, state: "received" });
  try {
    const result = await run();
    if (workspaceId) await record(workspaceId, { ...base, state: "completed" });
    return result;
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (workspaceId) await record(workspaceId, { ...base, state: "failed",
      ...(typeof code === "number" ? { errorCode: String(code) } : {}) });
    throw error;
  }
}
