import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { connectors } from "../server/connectors";
import { normalize } from "../server/engine";
import type { Job, Source } from "../shared/types";

// Boards are identified from published provider/organization pages, never synthesized.
const sources: Source[] = [
  {
    type: "greenhouse",
    company: "Cloudflare",
    board: "cloudflare",
    sector: "Tecnologia",
  },
  {
    type: "greenhouse",
    company: "Warby Parker",
    board: "warbyparker",
    sector: "Varejo e saúde",
  },
  {
    type: "lever",
    company: "Lalamove",
    board: "lalamove",
    sector: "Logística",
  },
  {
    type: "ashby",
    company: "Ashby",
    board: "Ashby",
    sector: "Serviços e tecnologia",
  },
  {
    type: "jobicy",
    company: "Jobicy",
    board: "public",
    sector: "Várias áreas · remoto",
  },
].map(
  (s, index) =>
    ({
      ...s,
      id: `verify-${index}`,
      enabled: true,
      discovery: true,
      application: false,
      status: "",
    }) as Source,
);
const reports: any[] = [],
  all: Job[] = [];
for (const source of sources) {
  try {
    const jobs = await connectors[source.type].discover(source);
    all.push(...jobs);
    reports.push({
      type: source.type,
      company: source.company,
      board: source.board,
      sector: source.sector,
      jobs: jobs.length,
      example: jobs[0]
        ? { title: jobs[0].title, url: jobs[0].url, origin: jobs[0].origins[0] }
        : null,
      automaticApplication: false,
      result: "success",
    });
  } catch (error) {
    reports.push({
      type: source.type,
      board: source.board,
      result: "failed",
      error: error instanceof Error ? error.message : "Falha na consulta",
    });
  }
}
const examples = (jobs: Job[]) =>
  jobs
    .slice(0, 5)
    .map((j) => ({
      title: j.title,
      company: j.company,
      location: j.location,
      modality: j.modality,
      level: j.level,
      url: j.url,
      origin: j.origins[0],
    }));
const administrative = all.filter(
  (j) =>
    /auxiliar administrativo/.test(normalize(j.title)) &&
    j.modality === "Presencial",
);
const developer = all.filter(
  (j) =>
    /desenvolvedor|developer|engineer/.test(normalize(j.title)) &&
    /\.net|c#/.test(normalize(j.title + " " + j.description)),
);
const report = {
  checkedAt: new Date().toISOString(),
  note: "Consultas oficiais read-only, sem candidatura. Resultados refletem apenas os boards consultados; não há garantia de cobertura local.",
  sources: reports,
  acceptance: {
    administrative: {
      query: "Auxiliar administrativo",
      modality: "Presencial",
      count: administrative.length,
      examples: examples(administrative),
      coverage: administrative.length
        ? "Vagas correspondentes na amostra de fontes."
        : "Sem correspondência exata nas fontes consultadas. É necessário ampliar fontes locais verificadas; zero vagas não é uma falha que justifique gerar dados.",
    },
    developer: {
      query: "Desenvolvedor .NET",
      count: developer.length,
      juniorCount: developer.filter((j) => j.level === "Júnior").length,
      examples: examples(developer),
    },
  },
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/connectors-live.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (!reports.some((s) => s.result === "success")) process.exitCode = 1;
