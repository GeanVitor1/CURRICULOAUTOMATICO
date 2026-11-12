/** Mede as recomendações de vagas de TI sem IA: npx tsx scripts/evaluate-it-matching.ts */
import { randomUUID } from "node:crypto";
import { analyze, classify, extractSkills, matchesObjectiveFilters, parseResume } from "../server/engine";
import { defaultFilters, defaultProfile, type Job, type Profile } from "../shared/types";
import { benchJobs, benchProfiles } from "../tests/fixtures/it-matching-cases";

function toJob(b: (typeof benchJobs)[number]): Job {
  const text = b.title + "\n" + b.description;
  return {
    id: b.id, title: b.title, company: "Empresa", url: `https://example.org/${b.id}`, source: "Benchmark",
    description: b.description, location: /ilh[eé]us/i.test(text) ? "Ilhéus, BA" : /s[aã]o paulo/i.test(text) ? "São Paulo, SP" : "Brasil",
    ...classify(text), level: classify(b.title).level,
    salaryMin: null, salaryMax: null, currency: "", requiredSkills: [], skills: extractSkills(text),
    publishedAt: new Date().toISOString(), discoveredAt: new Date().toISOString(),
    saved: false, discarded: false, demo: false, availability: "unknown", geographicEligibility: "Brasil",
    origins: [{ source: "portal", url: `https://example.org/${b.id}`, id: randomUUID() }],
    match: {} as Job["match"],
  } as Job;
}

export function evaluate(debug = false) {
  const jobs = benchJobs.map(toJob);
  let tp = 0, fp = 0, fn = 0;
  const errors: string[] = [];
  for (const p of benchProfiles) {
    const profile = { ...defaultProfile, location: "Ilhéus, BA", ...parseResume(p.resume), ...(p.level ? { level: p.level } : {}), confirmed: true } as Profile;
    const filters = { ...defaultFilters, titles: p.titles, modalities: [], locations: [], contracts: [] };
    for (const job of jobs) {
      const objective = matchesObjectiveFilters(job, profile, filters);
      const blockers = analyze(job, profile, filters).blockers;
      const recommended = objective && blockers.length === 0;
      const wanted = p.expected.includes(job.id);
      const why = debug ? `  [filtros=${objective} bloqueios=${blockers.join(" / ")}]` : "";
      if (recommended && wanted) tp++;
      else if (recommended) { fp++; errors.push(`RECOMENDOU ERRADO  ${p.id} -> ${job.title}${why}`); }
      else if (wanted) { fn++; errors.push(`PERDEU VAGA BOA    ${p.id} -> ${job.title}${why}`); }
    }
  }
  const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);
  return { tp, fp, fn, precision, recall, errors };
}

if (process.argv[1]?.includes("evaluate-it-matching")) {
  const r = evaluate(process.argv.includes("--debug"));
  console.log(r.errors.join("\n") || "Sem erros");
  console.log(`\nAcertos: ${r.tp} | Recomendações erradas: ${r.fp} | Vagas boas perdidas: ${r.fn}`);
  console.log(`Precisão: ${(r.precision * 100).toFixed(0)}% | Cobertura: ${(r.recall * 100).toFixed(0)}%`);
}
