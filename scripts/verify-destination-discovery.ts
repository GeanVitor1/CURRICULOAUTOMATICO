import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { load } from "cheerio";
import { readPublicPage } from "../server/public-web";
import { enrichOriginFromPage } from "../server/destination-page";
import { resolveApplicationDestinations } from "../server/destination-resolver";
import { searchEquivalentUrls } from "../server/equivalent-search";
import { connectors } from "../server/connectors";
import type { Job, Source } from "../shared/types";

const originUrl =
  "https://www.infojobs.com.br/vaga-de-desenvolvedora-junior-net,-react-ia-em-__12110291.aspx";
const page = await readPublicPage(originUrl),
  $ = load(page.html);
const company = $('#detailContainer a[href*="empresa-"]')
  .toArray()
  .map((node) => $(node).text().replace(/\s+/g, " ").trim())
  .find((value) => /[a-z]/i.test(value));
if (!company) throw new Error("Empresa não identificada no anúncio público.");
const original = enrichOriginFromPage(
  {
    id: randomUUID(),
    title: $(".js_vacancyHeaderTitle").text().trim(),
    company,
    source: "InfoJobs",
    url: originUrl,
    description: "",
    location: "Não informado",
    modality: "Não informado",
    contract: "Não informado",
    level: "Não informado",
    salaryMin: null,
    salaryMax: null,
    currency: "",
    skills: [],
    requiredSkills: [],
    requiredYears: null,
    publishedAt: null,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    origins: [{ source: "portal", url: originUrl, id: "infojobs:12110291" }],
    match: {
      score: 0,
      strengths: [],
      gaps: [],
      blockers: [],
      matchedSkills: [],
      missingSkills: [],
      radar: false,
      explanation: "",
    },
    demo: false,
  } satisfies Job,
  page,
);
if (!original) throw new Error("Não foi possível ler a publicação fornecida.");
// This URL was found in a supervised web search, not synthesized from a company name.
const citedUrls = [
  "https://kingoflanguages.pandape.infojobs.com.br/Detail/3817540",
];
const resolved = await resolveApplicationDestinations(original, {
  search: process.argv.includes("--links-only")
    ? async () => ({ urls: [], available: false })
    : process.argv.includes("--ai")
      ? (job) => searchEquivalentUrls(job)
      : async () => ({ urls: citedUrls, available: true }),
});
const feeds = [];
for (const [type, company, board] of [
  ["greenhouse", "Stripe", "stripe"],
  ["lever", "Palantir", "palantir"],
  ["ashby", "Notion", "notion"],
  ["smartrecruiters", "Bosch Group", "BoschGroup"],
]) {
  if (process.argv.includes("--links-only")) break;
  const source = {
    id: randomUUID(),
    type,
    company,
    board,
    enabled: true,
    discovery: true,
    application: false,
    status: "",
  } as Source;
  try {
    const jobs = await connectors[type].discover(source);
    feeds.push({
      type,
      board,
      count: jobs.length,
      sampleUrls: jobs.slice(0, 2).map((job) => job.url),
    });
  } catch (error) {
    feeds.push({
      type,
      board,
      count: 0,
      error: error instanceof Error ? error.message : "Falha na fonte",
    });
  }
}
const report = {
  at: new Date().toISOString(),
  environment: "Consultas públicas reais; nenhum currículo enviado",
  search: process.argv.includes("--links-only")
    ? "Somente links publicados; sem indexador nem IA"
    : process.argv.includes("--ai")
      ? "indexador configurado no servidor"
      : "busca web supervisionada, com URL citada fornecida ao resolver",
  original: {
    url: original.url,
    title: original.title,
    company: original.company,
    descriptionHash: createHash("sha256")
      .update(original.description)
      .digest("hex"),
  },
  destinations: resolved.destinations,
  resolution: resolved.resolution,
  feeds,
  submissions: 0,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  process.argv.includes("--links-only")
    ? "artifacts/destination-link-chain.json"
    : "artifacts/destination-real-discovery.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    destinations: report.destinations?.map((d) => ({
      url: d.url,
      confidence: d.confidence,
      state: d.state,
      formFound: d.formFound,
    })),
    state: report.resolution?.state,
    feeds: feeds.map(({ sampleUrls: _sample, ...feed }) => feed),
    submissions: 0,
  }),
);
