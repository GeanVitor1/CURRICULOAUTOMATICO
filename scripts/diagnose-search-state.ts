import dotenv from "dotenv";
import postgres from "postgres";
import {
  analyze,
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "../server/engine";
import type { Workspace } from "../shared/types";

dotenv.config({ path: ".env.production.local", quiet: true });
dotenv.config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for read-only diagnostics");
const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  onnotice: () => {},
});
try {
  const rows = await client.begin(
    "read only",
    async (sql) => sql`
    select data from workspaces where demo = false and
      data->'filters'->'titles' @> '["Analista de sistemas", "Desenvolvedor full stack", "Desenvolvedor de software"]'::jsonb
  `,
  );
  console.log(JSON.stringify({ matchingWorkspaces: rows.length }));
  for (const row of rows) {
    const w = row.data as Workspace;
    const reasons = new Map<string, number>();
    for (const job of w.jobs) {
      if (
        matchesObjectiveFilters(job, w.profile, w.filters) &&
        matchesSelectedSites(job, w)
      )
        continue;
      for (const reason of analyze(job, w.profile, w.filters).blockers)
        reasons.set(reason, (reasons.get(reason) || 0) + 1);
    }
    console.log(
      JSON.stringify({
        filters: {
          ageDays: w.filters.ageDays,
          contracts: w.filters.contracts,
          salaryOnly: w.filters.salaryOnly,
          salaryMin: w.filters.salaryMin,
          salaryMax: w.filters.salaryMax,
          modalities: w.filters.modalities,
          cityFilterCount: w.filters.locations.length,
        },
        stored: w.jobs.length,
        visible: w.jobs.filter(
          (job) =>
            matchesObjectiveFilters(job, w.profile, w.filters) &&
            matchesSelectedSites(job, w),
        ).length,
        run: w.runs[0] && {
          at: w.runs[0].at,
          status: w.runs[0].status,
          discovered: w.runs[0].discovered,
          processed: w.runs[0].processed,
          errors: w.runs[0].errors,
        },
        sources: w.sources
          .filter((source) => source.enabled)
          .map((source) => ({
            board: source.board,
            status: source.status,
            error: source.lastError,
          })),
        rejectionReasons: Object.fromEntries(reasons),
      }),
    );
  }
} finally {
  await client.end();
}
