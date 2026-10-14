import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { sql, eq } from "drizzle-orm";
import {
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "../server/engine";

if (!process.argv.includes("--apply"))
  throw new Error("Use --apply to start the reported account's cloud search");
const deployment = process.argv[process.argv.indexOf("--deployment") + 1];
if (!/^dpl_[a-zA-Z0-9]+$/.test(deployment || ""))
  throw new Error("Provide the verified production deployment ID");
dotenv.config({ path: ".env.production.local", quiet: true });
const cloud = dotenv.parse(await readFile(".env.antigravity.local"));
process.env.VERCEL_OIDC_TOKEN = cloud.VERCEL_OIDC_TOKEN;
process.env.VERCEL = "1";
process.env.VERCEL_ENV = "production";
process.env.VERCEL_DEPLOYMENT_ID = deployment;
process.env.VERCEL_REGION = "iad1";
process.env.NODE_ENV = "production";
delete process.env.REDIS_URL;
delete process.env.API_UPSTREAM_ORIGIN;
const { db, closeDb } = await import("../server/db");
const { workspaces, discoveryTasks } = await import("../server/schema");
const { enqueueDiscovery } = await import("../server/discovery-queue");
try {
  const rows = await db
    .select({ id: workspaces.id, data: workspaces.data })
    .from(workspaces)
    .where(
      sql`${workspaces.demo} = false and ${workspaces.data}->'filters'->'titles' @> '["Analista de sistemas", "Desenvolvedor full stack", "Desenvolvedor de software"]'::jsonb`,
    );
  if (rows.length !== 1 || rows[0].data.routine.mode !== "approval")
    throw new Error("Reported assisted workspace must be unique");
  const queued = await enqueueDiscovery(rows[0].id);
  console.log(
    JSON.stringify({
      queued: true,
      task: queued.id,
      execution: "Vercel production worker",
      automaticSending: false,
    }),
  );
  const deadline = Date.now() + 285000;
  let previous = "";
  while (Date.now() < deadline) {
    const [task] = await db
      .select()
      .from(discoveryTasks)
      .where(eq(discoveryTasks.id, queued.id));
    if (!task) throw new Error("Cloud task missing");
    if (task.status !== previous) {
      console.log(JSON.stringify({ status: task.status }));
      previous = task.status;
    }
    if (["completed", "failed"].includes(task.status)) {
      const [row] = await db
        .select({ data: workspaces.data })
        .from(workspaces)
        .where(eq(workspaces.id, rows[0].id));
      const w = row.data;
      const run = w.runs.find((r) => r.id === queued.id);
      console.log(
        JSON.stringify({
          cloudTask: task.status,
          run: run?.status,
          collected: w.jobs.length,
          visible: w.jobs.filter(
            (j) =>
              matchesObjectiveFilters(j, w.profile, w.filters) &&
              matchesSelectedSites(j, w),
          ).length,
          prepared: run?.processed,
          readyApplications: w.applications.filter(
            (a) => a.status === "Requer ação manual",
          ).length,
          sources: w.sources
            .filter((s) => s.enabled)
            .map((s) => ({
              source: s.company,
              status: s.status,
              error: s.lastError,
            })),
          errors: run?.errors,
          nextDailySearch: w.routine.nextRun,
        }),
      );
      if (task.status !== "completed") process.exitCode = 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (Date.now() >= deadline)
    throw new Error("Cloud search did not finish within its configured budget");
} finally {
  await closeDb();
}
