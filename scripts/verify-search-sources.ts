import "dotenv/config";
import { discoverPortal } from "../server/portal-discovery";
import { createWorkspace } from "../server/workspace";
import { analyze, matchesObjectiveFilters } from "../server/engine";
import { withDiscoveryBudget } from "../server/discovery-budget";

const w = createWorkspace("Pessoa fictícia", "search@example.test");
w.filters.titles = [
  "Analista de sistemas",
  "Desenvolvedor full stack",
  "Desenvolvedor de software",
];
w.filters.modalities = ["Remoto"];
w.filters.remoteAnywhere = true;
w.filters.contracts = ["CLT"];
w.filters.ageDays = 365;
const selected = process.argv.slice(2);
for (const portal of selected.length
  ? selected
  : ["gupy", "linkedin", "glassdoor", "infojobs"]) {
  try {
    const result = await withDiscoveryBudget(120000, () =>
      discoverPortal(
        {
          id: portal,
          board: portal,
          type: "portal",
          company: portal,
          enabled: true,
          discovery: true,
          application: false,
          status: "",
        },
        w,
      ),
    );
    const matches = Object.fromEntries(
      [1, 7, 30, 365].map((ageDays) => [
        ageDays,
        result.jobs.filter((job) =>
          matchesObjectiveFilters(job, w.profile, {
            ...w.filters,
            ageDays,
            dateKnownOnly: ageDays < 365,
          }),
        ).length,
      ]),
    );
    const blockers = [
      ...new Set(
        result.jobs.flatMap(
          (job) =>
            analyze(job, w.profile, {
              ...w.filters,
              ageDays: 7,
              dateKnownOnly: true,
            }).blockers,
        ),
      ),
    ];
    console.log(
      JSON.stringify({
        portal,
        found: result.jobs.length,
        visibleByAgeDays: matches,
        publishedDatesKnown: result.jobs.filter((job) => job.publishedAt)
          .length,
        method: result.method,
        blockers,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        portal,
        error: error instanceof Error ? error.message : "Failed",
      }),
    );
  }
}
