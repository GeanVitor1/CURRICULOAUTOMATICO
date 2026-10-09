import { mkdir, writeFile } from "node:fs/promises";
import { discoverPublicPortal } from "../server/public-portal-discovery";
import { connectors } from "../server/connectors";
import { createWorkspace } from "../server/workspace";
import { matchesObjectiveFilters } from "../server/engine";
const w = createWorkspace("Verificação local", "");
w.filters.titles = ["Auxiliar administrativo"];
w.filters.ageDays = 365;
w.filters.dateKnownOnly = false;
const results: unknown[] = [];
for (const provider of ["gupy", "greenhouse", "lever", "ashby"] as const) {
  try {
    const result =
      provider === "gupy"
        ? await discoverPublicPortal(provider, w)
        : {
            jobs: await connectors[provider]!.discover({
              id: "live-check",
              type: provider,
              company:
                provider === "greenhouse"
                  ? "Stripe"
                  : provider === "lever"
                    ? "Palantir"
                    : "Notion",
              board:
                provider === "greenhouse"
                  ? "stripe"
                  : provider === "lever"
                    ? "palantir"
                    : "notion",
              enabled: true,
              discovery: true,
              application: false,
              status: "",
            }),
          };
    results.push({
      provider,
      status: "ok",
      count: result.jobs.length,
      matching:
        provider === "gupy"
          ? result.jobs.filter((j) =>
              matchesObjectiveFilters(j, w.profile, w.filters),
            ).length
          : undefined,
      sample: result.jobs
        .slice(0, 3)
        .map(({ title, company, url, modality, location, publishedAt }) => ({
          title,
          company,
          url,
          modality,
          location,
          publishedAt,
        })),
    });
  } catch (error) {
    results.push({
      provider,
      status: "unavailable",
      error: (error as Error).message,
    });
  }
}
await mkdir("artifacts", { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  applicationsSent: 0,
  results,
};
await writeFile(
  "artifacts/redesign-live-search.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
