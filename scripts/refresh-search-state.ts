import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { withDiscoveryBudget } from "../server/discovery-budget";
import {
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "../server/engine";

dotenv.config({ path: ".env.production.local", quiet: true });
dotenv.config({ quiet: true });
// Explicit opt-in: only the one workspace matching the reported search may be refreshed.
if (!process.argv.includes("--apply"))
  throw new Error("Use --apply to refresh the reported search");
if (!process.env.DATABASE_URL)
  throw new Error("The existing PostgreSQL connection is required");
const { db, readWorkspace, closeDb } = await import("../server/db");
const { workspaces } = await import("../server/schema");
try {
  const rows = await db
    .select({ id: workspaces.id, data: workspaces.data })
    .from(workspaces).where(sql`
    ${workspaces.demo} = false and ${workspaces.data}->'filters'->'titles'
      @> '["Analista de sistemas", "Desenvolvedor full stack", "Desenvolvedor de software"]'::jsonb
  `);
  if (rows.length !== 1 || rows[0].data.routine.mode !== "approval")
    throw new Error(
      "The reported preparation workspace must be unique; automatic sending is excluded",
    );
  const { discover } = await import("../server/operations");
  const run = await withDiscoveryBudget(240000, () => discover(rows[0].id));
  const w = (await readWorkspace(rows[0].id))!;
  console.log(
    JSON.stringify({
      status: run.status,
      stored: w.jobs.length,
      visible: w.jobs.filter(
        (job) =>
          matchesObjectiveFilters(job, w.profile, w.filters) &&
          matchesSelectedSites(job, w),
      ).length,
      prepared: run.processed,
      readyApplications: w.applications.filter(
        (application) =>
          application.mode === "assisted" &&
          application.status === "Requer ação manual",
      ).length,
      applicationsSentByThisRefresh: 0,
      sourceErrors: run.errors,
    }),
  );
} finally {
  await closeDb();
}
