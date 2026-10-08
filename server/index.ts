import { buildApp } from "./app";
import { startLocalScheduler, connection, queue } from "./queue";
import { closeDb } from "./db";
import { startDiscoveryWorker } from "./discovery-queue";
const app = await buildApp();
const timer = await startLocalScheduler();
const stopDiscovery = process.env.REDIS_URL ? null : startDiscoveryWorker();
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
});
const stop = async () => {
  if (timer) clearInterval(timer);
  await stopDiscovery?.();
  await app.close();
  await queue?.close();
  await connection?.quit();
  await closeDb();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
