import "dotenv/config";
import { Worker } from "bullmq";
import { connection, queue, configureSchedule } from "./queue";
import { executeRoutine } from "./operations";
import { store, closeDb } from "./db";

import { startDiscoveryWorker } from "./discovery-queue";
import { closePortalBrowsers } from "./portal-sessions";
if (
  !connection ||
  (!process.env.DATABASE_URL && process.env.DATABASE_PROVIDER !== "firestore")
)
  throw new Error("Workers separados exigem um banco persistente e REDIS_URL.");
const worker = new Worker(
  "orbita-routines",
  (job) => executeRoutine(job.data.workspaceId),
  { connection: connection as any, concurrency: 1 },
);
worker.on("failed", (job, err) =>
  console.error(
    JSON.stringify({
      event: "routine_failed",
      jobId: job?.id,
      error: err.message,
    }),
  ),
);
// Stable IDs reconcile schedules across restart without duplication.
for (const row of await store.routines())
  await configureSchedule(row.id, row.routine.enabled, row.routine.time);
console.log("Worker EmpreGatos ativo.");
const stopDiscovery = startDiscoveryWorker();
const stop = async () => {
  await worker.close();
  await stopDiscovery();
  await closePortalBrowsers();
  await queue?.close();
  await connection?.quit();
  await closeDb();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
