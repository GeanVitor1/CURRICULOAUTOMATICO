/**
 * Experimento: a IA (Gemini) lê cada vaga e cada currículo UMA vez; a comparação continua determinística.
 * Resultados ficam em cache (scripts/.ai-cache.json) para não gastar de novo.
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/evaluate-it-matching-ai.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { generateGemini } from "../server/gemini";
import { readJobsBatch } from "../server/job-reading";
import { extractSkills, normalize } from "../server/engine";
import { benchProfiles } from "../tests/fixtures/it-matching-cases";
import { realLabels } from "../tests/fixtures/real-it-labels";

const categories = ["backend", "frontend", "fullstack", "mobile", "data-engineering", "data-analytics-bi", "qa", "devops-cloud", "support-infra", "not-it"] as const;
const jobSchema = z.object({
  category: z.enum(categories),
  internship: z.boolean(),
  seniority: z.enum(["estagio", "junior", "pleno", "senior", "nao-informado"]),
  primaryStack: z.array(z.string()).max(8),
  mandatory: z.array(z.string()).max(12),
});
const resumeSchema = z.object({
  categories: z.array(z.enum(categories)).max(4),
  seniority: z.enum(["estagio", "junior", "pleno", "senior", "nao-informado"]),
  skills: z.array(z.string()).max(40),
});
const jobInstructions = `Você classifica vagas para uma plataforma de candidaturas em TI. Responda só com JSON.
category: área principal da vaga; use "not-it" se não for um cargo de tecnologia (ex.: engenharia mecânica, compras, administrativo, manutenção de veículos).
internship: true só se for estágio/trainee.
primaryStack: as linguagens, frameworks ou plataformas centrais do trabalho (no máximo 8), não ferramentas genéricas como Git, Jira, Scrum, Docker.
mandatory: tecnologias que o texto exige explicitamente (não inclua diferenciais/desejáveis).
Use nomes canônicos: C#, .NET, Java, Spring, Python, PHP, Laravel, Node.js, React, Angular, Vue.js, Flutter, Kotlin, Swift, SQL Server, PostgreSQL, Power BI, Spark, AWS, Azure, GCP, Kubernetes, Terraform, Cypress, Selenium.`;
const resumeInstructions = `Você lê currículos de profissionais de TI. Responda só com JSON. categories: até 4 áreas em que a pessoa atua de fato.
skills: tecnologias que a pessoa comprovadamente usou (nomes canônicos como na lista: C#, .NET, Java, Spring, Python, PHP, Laravel, Node.js, React, Angular, Power BI, Spark, AWS...). Não invente nada que não esteja no texto.`;

type Cache = Record<string, { value: unknown; tokens: number; ms: number }>;
const cachePath = "scripts/.ai-cache.json";
const cache: Cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
async function ask<T>(key: string, prompt: string, instructions: string, schema: z.ZodType<T>): Promise<T | null> {
  if (cache[key]) return schema.parse(cache[key].value);
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    try {
      const r = await generateGemini(prompt, { instructions, schema: z.toJSONSchema(schema), temperature: attempt ? 0.3 : 0 });
      const value = schema.parse(JSON.parse(r.text));
      cache[key] = { value, tokens: r.tokens, ms: Date.now() - started };
      writeFileSync(cachePath, JSON.stringify(cache));
      return value;
    } catch (e) {
      if (/cota diária/i.test((e as Error).message)) {
        console.error(`\nCota diária do Gemini esgotada após ${Object.keys(cache).length} itens em cache. Rode de novo amanhã: o cache continua de onde parou.`);
        process.exit(2);
      }
      console.warn(`falha ${key} (${attempt + 1}/3): ${(e as Error).message.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    }
  }
  return null;
}
// Canonicaliza nomes livres pelo mesmo vocabulário do sistema, com o texto bruto como reserva.
const canon = (list: string[]) => new Set([...extractSkills(list.join("\n")).map(normalize), ...list.map(normalize)]);
const equivalent: Record<string, string[]> = { ".net": ["c#", "asp.net core"], "c#": [".net"], "asp.net core": [".net", "c#"], spring: ["java"], "next.js": ["react"], "react native": ["react"] };
const has = (own: Set<string>, skill: string) => own.has(skill) || (equivalent[skill] || []).some((e) => own.has(e));
const devCategories = ["backend", "frontend", "fullstack", "mobile"];

const raw = JSON.parse(readFileSync("tests/fixtures/real-it-jobs.json", "utf8")) as { title: string; description: string }[];
const jobs: (z.infer<typeof jobSchema> | null)[] = raw.map((_, i) => (cache[`job:${i}`]?.value as z.infer<typeof jobSchema>) || null);
// Lote de 10 vagas por chamada (mesmo código usado em produção).
const pending = raw.map((_, i) => i).filter((i) => realLabels[i] !== "skip" && !jobs[i]);
for (let i = 0; i < pending.length; i += 10) {
  const chunk = pending.slice(i, i + 10);
  const started = Date.now();
  try {
    const { readings, tokens } = await readJobsBatch(chunk.map((n) => ({ id: String(n), title: raw[n].title, description: raw[n].description || "" })));
    const ms = Date.now() - started;
    for (const r of readings) {
      const { id, ...value } = r;
      jobs[Number(id)] = value;
      cache[`job:${id}`] = { value, tokens: Math.round(tokens / readings.length), ms: Math.round(ms / readings.length) };
    }
    cache[`batch:${chunk.join(",")}`] = { value: null, tokens: 0, ms };
    writeFileSync(cachePath, JSON.stringify(cache));
    process.stdout.write(`[${readings.length}/${chunk.length}]`);
  } catch (e) {
    if (/cota diária/i.test((e as Error).message)) { console.error("\nCota diária esgotada; rode de novo depois (o cache continua)."); process.exit(2); }
    console.warn(`lote falhou: ${(e as Error).message.slice(0, 120)}`);
  }
}
for (const i of raw.map((_, n) => n)) if (realLabels[i] !== "skip" && !jobs[i]) jobs[i] = null;
const resumes = new Map<string, z.infer<typeof resumeSchema> | null>();
for (const p of benchProfiles) resumes.set(p.id, await ask(`resume:${p.id}`, p.resume, resumeInstructions, resumeSchema));
console.log();

let tp = 0, fp = 0, fn = 0, failed = 0;
const errors: string[] = [];
for (const p of benchProfiles) {
  const r = resumes.get(p.id)!;
  const own = canon(r.skills);
  const intern = p.level === "Estágio";
  jobs.forEach((j, i) => {
    const label = realLabels[i];
    if (label === "skip" || !label) return;
    if (!j) { failed++; return; }
    const stack = [...canon(j.primaryStack)];
    const mandatory = [...canon(j.mandatory)];
    const categoryOk = j.category !== "not-it" && (r.categories.includes(j.category) || (j.category === "fullstack" && r.categories.some((c) => devCategories.includes(c))) || (intern && devCategories.includes(j.category)));
    const stackOk = !stack.length || stack.some((s) => has(own, s));
    const mandatoryOk = mandatory.length < 3 ? mandatory.every((s) => has(own, s)) : mandatory.filter((s) => has(own, s)).length / mandatory.length >= 0.5;
    const levelOk = intern ? j.internship : !j.internship;
    const recommended = categoryOk && stackOk && mandatoryOk && levelOk;
    const wanted = label.includes(p.id);
    const why = `[${j.category}; stack=${j.primaryStack.join(",")}; obrig=${j.mandatory.join(",")}]`;
    if (recommended && wanted) tp++;
    else if (recommended) { fp++; errors.push(`RECOMENDOU ERRADO  ${p.id} -> #${i} ${raw[i].title} ${why}`); }
    else if (wanted) { fn++; errors.push(`PERDEU VAGA BOA    ${p.id} -> #${i} ${raw[i].title} ${why}`); }
  });
}
const entries = Object.entries(cache).filter(([k]) => !k.startsWith("batch:")).map(([, v]) => v);
const batches = Object.keys(cache).filter((k) => k.startsWith("batch:")).length;
const tokens = entries.reduce((s, e) => s + e.tokens, 0);
console.log(errors.join("\n"));
console.log(`\n[IA] Acertos: ${tp} | Recomendações erradas: ${fp} | Vagas boas perdidas: ${fn} | Falhas de IA: ${failed}`);
console.log(`[IA] Precisão: ${((tp / Math.max(1, tp + fp)) * 100).toFixed(0)}% | Cobertura: ${((tp / Math.max(1, tp + fn)) * 100).toFixed(0)}%`);
console.log(`[IA] Chamadas em lote: ${batches} | Itens lidos: ${entries.length} | Tokens: ${tokens} (média ${Math.round(tokens / Math.max(1, entries.length))}/chamada) | Tempo médio: ${Math.round(entries.reduce((s, e) => s + e.ms, 0) / Math.max(1, entries.length))} ms`);
