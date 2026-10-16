import { Queue } from "bullmq";
import Redis from "ioredis";

import { store, mutateWorkspace } from "./db";
import { executeRoutine, notify } from "./operations";
import { nextExecution } from "./engine";
export const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: (times) =>
        times <= 3 ? Math.min(times * 500, 2000) : null,
    })
  : null;
export const queue = connection
  ? new Queue("orbita-routines", { connection: connection as any })
  : null;
export async function configureSchedule(
  id: string,
  enabled: boolean,
  time: string,
) {
  if (!queue) return;
  await queue.removeJobScheduler(`routine-${id}`);
  if (enabled) {
    const [hour, minute] = time.split(":");
    await queue.upsertJobScheduler(
      `routine-${id}`,
      {
        pattern: `${Number(minute)} ${Number(hour)} * * *`,
        tz: "America/Sao_Paulo",
      },
      {
        name: "routine",
        data: { workspaceId: id },
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
}
export async function enqueueDueRoutines() {
  // Read only scheduling data, rather than every user's resume and job history.
  const rows = await store.routines();
  for (const row of rows) {
    const r = row.routine;
    if (r.enabled && r.nextRun && Date.parse(r.nextRun) <= Date.now()) {
      try {
        await executeRoutine(row.id);
      } catch (error) {
        // Configuration/claim failures happen before a discovery run exists.
        // Persist them and advance the schedule so they do not silently retry each minute.
        await mutateWorkspace(row.id, (w) => {
          if (
            w.runs.some(
              (run) =>
                run.status === "running" &&
                Date.now() - Date.parse(run.at) < 300000,
            )
          )
            return;
          const message =
            error instanceof Error
              ? error.message
              : "A rotina não pôde iniciar.";
          notify(w, "A busca automática precisa de atenção", message);
          w.routine.lastRun = new Date().toISOString();
          w.routine.nextRun = w.routine.enabled
            ? nextExecution(w.routine.time)
            : null;
        });
      }
    }
  }
}
export async function startLocalScheduler() {
  if (queue) return null;
  let processing = false;
  const tick = async () => {
    if (processing) return;
    processing = true;
    try {
      await enqueueDueRoutines();
    } catch {
      console.error(JSON.stringify({ event: "routine_scheduler_failed" }));
    } finally {
      processing = false;
    }
  };
  // Start overdue routines immediately after a restart. Transient database errors
  // are logged and retried on the next tick instead of terminating the process.
  const timer = setInterval(() => void tick(), 60000);
  timer.unref();
  void tick();
  return timer;
}
