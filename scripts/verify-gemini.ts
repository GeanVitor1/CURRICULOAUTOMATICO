import "dotenv/config";
import { geminiJson } from "../server/gemini";
import { resumeTargets } from "../server/resume-targets";
import { discoverPortal } from "../server/portal-discovery";
import { createWorkspace } from "../server/workspace";
import { z } from "zod";
const text =
  "Objetivo: Auxiliar administrativo\nExperiência: atendimento ao público e rotinas administrativas. Organização de documentos e planilhas Excel.\nFormação: Ensino médio completo.";
try {
  const extracted = await geminiJson(
    text,
    z.object({ skills: z.array(z.string()) }),
    undefined,
    "Extraia apenas competências presentes no texto.",
  );
  console.log(JSON.stringify({ analysis: "ok", skills: extracted.skills }));
  const targets = await resumeTargets(
    text,
    { headline: "Auxiliar administrativo" },
    "gemini",
  );
  console.log(
    JSON.stringify({
      targets: targets.method,
      titles: targets.targets.map((t) => t.title),
      message: targets.message,
    }),
  );
  if (process.argv.includes("--search")) {
    const workspace = createWorkspace("Teste sintético", "teste@example.test");
    workspace.filters.titles = ["Auxiliar administrativo"];
    workspace.filters.locations = ["São Paulo"];
    const result = await discoverPortal(
      {
        id: "synthetic",
        type: "portal",
        board: "infojobs",
        company: "InfoJobs",
        enabled: true,
        discovery: true,
        application: false,
        status: "",
      },
      workspace,
    );
    console.log(
      JSON.stringify({
        search: "ok",
        count: result.jobs.length,
        jobs: result.jobs.map((j) => ({ title: j.title, url: j.url })),
        suggestions: !!result.searchSuggestionsHtml,
      }),
    );
  }
} catch (error) {
  console.log(
    JSON.stringify({ error: error instanceof Error ? error.message : "Falha" }),
  );
  process.exitCode = 1;
}
