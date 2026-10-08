import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:3001/api";
let cookie = "";
const password = "Synthetic-Gemini-QA-123";
async function request(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-Orbita-Request": "1",
      Origin: "http://127.0.0.1:5173",
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(path + ": " + data.error);
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return data;
}
try {
  await request("/auth/register", "POST", {
    name: "Teste sintético Gemini",
    email: "gemini-" + randomUUID() + "@example.test",
    password,
  });
  const config = await request("/intelligence", "PUT", {
    provider: "gemini",
    model: "gemini-2.5-flash",
    enabled: true,
    consent: true,
  });
  const connection = await request("/intelligence/test", "POST", {
    provider: "gemini",
    model: "gemini-2.5-flash",
  });
  console.log(
    JSON.stringify({ keyConfigured: config.keyConfigured, test: connection }),
  );
  const built = await request("/resumes/build", "POST", {
    name: "Pessoa sintética",
    headline: "Auxiliar administrativo",
    education: "Ensino médio completo",
    experience:
      "Experiência: atendimento ao público e rotinas administrativas. Organização de documentos e planilhas Excel.",
    skills: ["Atendimento ao público", "Excel", "Rotinas administrativas"],
  });
  await request("/resumes/" + built.resumeId + "/analyze", "POST");
  let w = await request("/workspace");
  const resume = w.resumes[0];
  console.log(
    JSON.stringify({
      analysis: resume.analysis,
      targetsMethod: resume.targetsMethod,
      titles: resume.targets.map((t) => t.title),
      targetsMessage: resume.targetsMessage,
    }),
  );
  if (
    !resume.analysis.startsWith("Análise Gemini") ||
    resume.targetsMethod !== "gemini"
  )
    throw new Error("Gemini não concluiu a análise real pela API.");
  await request("/resumes/" + built.resumeId, "PATCH", { approved: true });
  await request("/profile", "PUT", { ...w.profile, confirmed: true });
  const job = await request("/jobs", "POST", {
    title: "Auxiliar administrativo",
    company: "Empresa fictícia QA",
    url: "https://example.test/qa-job",
    description:
      "Vaga fictícia para verificar a preparação. Atendimento ao público, organização de documentos e planilhas Excel.",
    location: "Não especificado",
    modality: "Presencial",
    level: "Não especificado",
    contract: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: ["Excel", "Atendimento ao público"],
    requiredSkills: [],
    requiredYears: null,
  });
  const application = await request("/applications", "POST", {
    jobId: job.id,
    resumeId: built.resumeId,
  });
  const draft = await request(
    "/applications/" + application.id + "/draft",
    "POST",
  );
  console.log(
    JSON.stringify({
      applicationStatus: application.status,
      draftCreated: !!draft.draft,
      draft: draft.draft,
    }),
  );
} catch (error) {
  console.log(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
} finally {
  if (cookie) await request("/account", "DELETE", { password });
}
