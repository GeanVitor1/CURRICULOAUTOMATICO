import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createWorkspace } from "../server/workspace";
import { discoverOfficialCareers } from "../server/official-discovery";
import { resolveApplicationDestinations } from "../server/destination-resolver";
import { detectAts } from "../server/ats-registry";
import { readPublicPage } from "../server/public-web";
import { load } from "cheerio";

// Read-only publisher inspection. Never loads private env, files, cookies or a candidate.
const url = process.argv[2];
assert(
  url && detectAts(url),
  "Informe uma URL individual publicada em ATS suportado.",
);
const workspace = createWorkspace("QA fictício", "qa@example.test");
workspace.filters.titles = ["Desenvolvedor de software"];
const result = await discoverOfficialCareers(workspace, undefined, {
  // URL independently observed by the operator; this is not a test of the AI search provider.
  search: async () => ({ urls: [url], available: true }),
});
assert.equal(
  result.jobs.length,
  1,
  "A página deve comprovar uma vaga individual ativa.",
);
const resolved = await resolveApplicationDestinations(result.jobs[0], {
  search: async () => ({ urls: [], available: true }),
});
const destination = resolved.destinations?.find((item) => item.formFound);
let requiredQuestions: string[] = [];
if (destination) {
  const page = await readPublicPage(destination.url);
  const $ = load(page.html);
  requiredQuestions = $(".application-question")
    .toArray()
    .flatMap((node) =>
      $(node).find("[required], [aria-required=true]").length
        ? [
            $(node)
              .find(".application-label")
              .first()
              .text()
              .replace(/[\s✱*:]+$/, "")
              .trim(),
          ]
        : [],
    );
}
const evidence = {
  at: new Date().toISOString(),
  verification:
    "read-only publisher pages; search URL supplied from Chrome observation",
  job: {
    title: resolved.title,
    company: resolved.company,
    url: resolved.url,
    location: resolved.location,
    publishedAt: resolved.publishedAt,
  },
  destinations: resolved.destinations,
  requiredQuestions,
  realEmployerSubmissions: 0,
  candidateFilesRead: 0,
};
await writeFile(
  "artifacts/official-careers-readiness-2026-10-20.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));
