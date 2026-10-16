import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validateHostedRuntime } from "./auth-config";

export function cronAuthorized(
  header: unknown,
  secret = process.env.CRON_SECRET,
) {
  if (!secret || typeof header !== "string") return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  if (
    request.method !== "GET" ||
    !cronAuthorized(request.headers.authorization)
  ) {
    response.writeHead(401);
    response.end(JSON.stringify({ error: "Não autorizado." }));
    return;
  }
  try {
    validateHostedRuntime();
    const { enqueueDueRoutines } = await import("./queue");
    const { store } = await import("./db");
    const { dispatchDiscovery } = await import("./vercel-dispatch");
    const { eq, and, or, lt } = await import("./storage-types");
    await enqueueDueRoutines();
    // Recover committed tasks if publishing failed, including interrupted invocations.
    const pending = await store.select("discoveryTasks", {
      where: or(
        eq("status", "queued"),
        and(eq("status", "running"), lt("leaseUntil", new Date())),
      ),
      columns: ["id"],
    });
    for (const task of pending) await dispatchDiscovery(task.id);
    const { dispatchNextApplication } = await import("./submission-dispatch");
    const sending = await store.select("workspaces", {
      where: eq("demo", false),
      columns: ["id"],
    });
    for (const workspace of sending)
      await dispatchNextApplication(workspace.id);
    response.end(JSON.stringify({ ok: true }));
  } catch {
    console.error(
      JSON.stringify({ event: "daily_automation_dispatch_failed" }),
    );
    response.writeHead(503);
    response.end(JSON.stringify({ error: "A rotina não conseguiu iniciar." }));
  }
}
