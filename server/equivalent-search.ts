import { generateGemini, geminiConfigured } from "./gemini";
import { antigravityAvailable, searchAntigravity } from "./antigravity";
import { readPublicPage } from "./public-web";
import type { Job } from "../shared/types";
import { JOB_SEARCH_POLICY } from './job-search-policy';
import { antigravityJobsSchema } from './antigravity-protocol';

/** Uses only actual search citations. A model's suggested URL is not evidence. */
export async function searchEquivalentUrls(
  job: Job,
  userId?: string,
): Promise<{ urls: string[]; available: boolean }> {
  const prompt = `Encontre publicações da MESMA oportunidade, usando busca pública. Empresa: ${JSON.stringify(job.company)}. Cargo: ${JSON.stringify(job.title)}. Local: ${JSON.stringify(job.location)}. Requisição: ${JSON.stringify(job.requisitionId || "desconhecida")}. Priorize site oficial e anúncios individuais Greenhouse, Lever, Ashby, Gupy, SmartRecruiters ou Workday. Não faça login nem envie candidaturas. Nunca invente links ou equivalências. A comparação será feita no servidor. Retorne até 5 anúncios em JSON {"jobs":[{"title":"cargo","company":"empresa","url":"URL citada","citationUrl":"fonte Google quando disponível","location":"local","description":"resumo fiel"}]}.`;
  return searchCitedUrls(prompt, userId);
}

/** Search URLs are hints, including the model's returned links when its search
 * actually ran. Every caller must fetch and verify publisher facts; this never
 * turns model descriptions, dates or recipients into evidence. */
export async function searchCitedUrls(prompt: string, userId?: string) {
  const agy = antigravityAvailable(userId);
  if (!agy && !geminiConfigured()) return { urls: [], available: false };
  let urls: string[];
  if (agy) {
    const result = await searchAntigravity(userId!, prompt);
    // Job links first: native search output can also contain home pages and
    // related sources, which used to consume the entire five-URL budget.
    urls = [...result.googleCitationUrls,
      ...(result.searchPerformed ? result.jobs.map(job => job.url) : []), ...result.verifiedUrls];
  } else {
    const result = await generateGemini(prompt, {
      search: true,
      model: process.env.GEMINI_SEARCH_MODEL || "gemini-2.5-flash",
      instructions:
        JOB_SEARCH_POLICY,
    });
    const citations = (result.grounding?.groundingChunks || []).flatMap((chunk: any) =>
      typeof chunk.web?.uri === "string" ? [chunk.web.uri] : [],
    );
    let hints: string[] = [];
    if (result.grounding?.webSearchQueries?.length) {
      try {
        const text = result.text.trim();
        const payload = JSON.parse(text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text);
        hints = antigravityJobsSchema.parse(payload).jobs.map(job => job.url);
      } catch { /* Only validated structured hints supplement actual search evidence. */ }
    }
    urls = [...hints, ...citations];
  }
  const resolved: string[] = [];
  for (const value of [...new Set(urls)].slice(0, 6)) {
    try {
      const url = new URL(value);
      if (url.hostname === "vertexaisearch.cloud.google.com")
        resolved.push((await readPublicPage(value)).url);
      else if (url.protocol === "https:") resolved.push(url.href);
    } catch {
      /* Rejected sources never enter the candidate list. */
    }
  }
  return { urls: [...new Set(resolved)].slice(0, 5), available: true };
}
