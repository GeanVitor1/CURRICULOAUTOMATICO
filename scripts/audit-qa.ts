import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import type { InjectOptions } from "fastify";

// Reproduções de auditoria: dados isolados, sem envio ou consultas externas.
const root = await mkdtemp(join(tmpdir(), "empregatos-qa-audit-"));
process.env.DATA_DIR = root;
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.REDIS_URL = "";
process.env.GEMINI_API_KEY = "";
process.env.OPENCODE_ZEN_API_KEY = "";
process.env.OPENCODE_API_KEY = "";
globalThis.fetch = async () => {
  throw new Error("Auditoria sem rede externa");
};
const database = await import("../server/db");
const app = await (await import("../server/app")).buildApp();
let cookie = "";
const request = (
  method: InjectOptions["method"],
  url: string,
  payload?: InjectOptions["payload"],
) =>
  app.inject({
    method,
    url,
    payload,
    headers: {
      cookie,
      "x-orbita-request": "1",
      origin: "http://127.0.0.1:5173",
    },
  });
const findings: { id: string; fixed: boolean; evidence: unknown }[] = [];
try {
  const registered = await request("POST", "/api/auth/register", {
    name: "Auditoria isolada",
    email: "audit@example.test",
    password: "Audit-isolated-password-123",
  });
  if (registered.statusCode !== 200)
    throw new Error("Cadastro de auditoria falhou");
  cookie = String(registered.headers["set-cookie"]).split(";")[0];
  const workspaceId = registered.json().id + ":live";
  const jobBody = {
    title: "Auxiliar administrativo",
    company: "Empresa A",
    url: "",
    description:
      "Atendimento ao público e organização de documentos administrativos.",
    location: "Brasil",
    modality: "Remoto",
    level: "Júnior",
    contract: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: ["Atendimento ao público"],
    requiredSkills: [],
    requiredYears: null,
  };
  const first = await request("POST", "/api/jobs", jobBody);
  const firstId = first.json().id;
  const second = await request("POST", "/api/jobs", {
    ...jobBody,
    title: "Operador de caixa",
    company: "Empresa B",
  });
  const afterMerge = (await request("GET", "/api/workspace")).json();
  findings.push({
    id: "QA-01",
    fixed:
      afterMerge.jobs.length === 2 &&
      afterMerge.jobs.some(
        (j: any) => j.id === firstId && j.company === "Empresa A",
      ),
    evidence: {
      firstId,
      returnedSecondId: second.json().id,
      storedJobs: afterMerge.jobs.map((j: any) => ({
        id: j.id,
        title: j.title,
        company: j.company,
      })),
    },
  });

  const filters = { ...afterMerge.filters, salaryMin: 9000, salaryMax: 1000 };
  const invalid = await request("PUT", "/api/filters", filters);
  findings.push({
    id: "QA-02",
    fixed: invalid.statusCode === 400,
    evidence: { status: invalid.statusCode, salaryMin: 9000, salaryMax: 1000 },
  });
  await request("PUT", "/api/filters", afterMerge.filters);

  const upload = async (name: string, text: string) => {
    const bytes = zipSync({
      "word/document.xml": strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    });
    return app.inject({
      method: "POST",
      url: "/api/resumes",
      headers: {
        cookie,
        "x-orbita-request": "1",
        origin: "http://127.0.0.1:5173",
        "content-type": "multipart/form-data; boundary=qa-audit",
      },
      payload: Buffer.concat([
        Buffer.from(
          `--qa-audit\r\nContent-Disposition: form-data; name="file"; filename="${name}.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
        ),
        Buffer.from(bytes),
        Buffer.from("\r\n--qa-audit--\r\n"),
      ]),
    });
  };
  const uploaded = await upload(
    "primeiro",
    "Auxiliar administrativo com experiência em atendimento ao público e organização de documentos.",
  );
  if (uploaded.statusCode !== 200) throw new Error(uploaded.body);
  const resumeId = uploaded.json().id;
  await database.mutateWorkspace(workspaceId, (w) => {
    w.profile.confirmed = true;
    w.profile.years = 12;
    w.profile.level = "Sênior";
    w.resumes[0].approved = true;
    w.routine.enabled = true;
    w.routine.mode = "automatic";
    w.routine.nextRun = new Date(Date.now() + 86400000).toISOString();
    w.interview = {
      step: 5,
      completed: true,
      answers: {
        resumeId,
        phone: "",
        titles: ["Auxiliar administrativo"],
        modalities: ["Remoto"],
        city: "",
        sameCityOnly: true,
        salaryMin: 0,
        salaryMax: 0,
        includeUnknownSalary: true,
        ageDays: 365,
        contracts: [],
        sites: ["gupy"],
        dailyLimit: 5,
      },
    };
    w.applications.push({
      id: crypto.randomUUID(),
      jobId: firstId,
      status: "Requer ação manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resumeId,
      receipt: null,
      note: "",
      mode: "assisted",
      history: [],
    });
  });
  const listing = (await request("GET", "/api/jobs")).json();
  const detail = (await request("GET", "/api/jobs/" + firstId)).json();
  // Remove site filtering to expose the manually imported fixture in the listing.
  await database.mutateWorkspace(workspaceId, (w) => {
    w.interview!.completed = false;
  });
  const visibleListing = (await request("GET", "/api/jobs")).json();
  findings.push({
    id: "QA-03",
    fixed:
      !!detail.application &&
      visibleListing.items.some(
        (j: any) =>
          j.id === firstId &&
          j.application?.status === detail.application.status,
      ),
    evidence: {
      listingStatus:
        visibleListing.items.find((j: any) => j.id === firstId)?.application
          ?.status || null,
      detailStatus: detail.application?.status,
      totalWithSelectedSites: listing.total,
    },
  });
  await database.mutateWorkspace(workspaceId, (w) => {
    w.interview!.completed = true;
  });
  const replaced = await upload(
    "substituto",
    "Candidato em busca do primeiro emprego. Ensino médio completo e atendimento ao público em atividades voluntárias.",
  );
  if (replaced.statusCode !== 200) throw new Error(replaced.body);
  const replacement = (await request("GET", "/api/workspace")).json();
  findings.push({
    id: "QA-04",
    fixed: !replacement.routine.enabled && replacement.routine.nextRun === null,
    evidence: {
      enabled: replacement.routine.enabled,
      mode: replacement.routine.mode,
      interviewResumeId: replacement.interview.answers.resumeId,
      newestResumeId: replacement.resumes[0].id,
      profileConfirmed: replacement.profile.confirmed,
    },
  });

  await database.mutateWorkspace(workspaceId, (w) => {
    w.resumes[0].suggestion = {
      ...w.resumes[0].suggestion,
      years: 0,
      level: "Júnior",
      experience: "",
      headline: "Primeiro emprego",
    };
    w.profile.experience = "Experiência antiga em outra área";
  });
  const answer = {
    ...replacement.interview.answers,
    resumeId: replaced.json().id,
  };
  const completed = await request("PUT", "/api/interview", {
    step: 5,
    complete: true,
    start: "save",
    answers: answer,
  });
  const finalWorkspace = (await request("GET", "/api/workspace")).json();
  findings.push({
    id: "QA-05",
    fixed:
      completed.statusCode === 200 &&
      finalWorkspace.profile.years === 0 &&
      finalWorkspace.profile.level === "Júnior" &&
      finalWorkspace.profile.experience === "",
    evidence: {
      status: completed.statusCode,
      resumeYears: finalWorkspace.resumes[0].suggestion.years,
      profileYears: finalWorkspace.profile.years,
      resumeLevel: finalWorkspace.resumes[0].suggestion.level,
      profileLevel: finalWorkspace.profile.level,
      profileExperience: finalWorkspace.profile.experience,
      confirmed: finalWorkspace.profile.confirmed,
    },
  });

  const w = await database.readWorkspace(workspaceId);
  const { mergeJobs } = await import("../server/operations");
  const fixture = w!.jobs[0];
  w!.jobs = Array.from({ length: 2000 }, (_, i) => ({
    ...structuredClone(fixture),
    id: crypto.randomUUID(),
    title: `Vaga ${i}`,
    company: `Empresa ${i}`,
    url: `https://example.test/jobs/${i}`,
    discarded: true,
  }));
  const existingAtCapacity = w!.jobs[0];
  const updatedDescription = "Descrição atualizada da vaga já armazenada.";
  const added = mergeJobs(w!, [
    {
      ...structuredClone(fixture),
      id: crypto.randomUUID(),
      title: "Nova vaga",
      company: "Empresa nova",
      url: "https://example.test/jobs/new",
      discarded: false,
    },
    { ...structuredClone(existingAtCapacity), description: updatedDescription },
  ]);
  findings.push({
    id: "QA-06",
    fixed:
      added === 1 &&
      w!.jobs.some((j) => j.title === "Nova vaga") &&
      existingAtCapacity.description === updatedDescription,
    evidence: {
      stored: w!.jobs.length,
      discarded: w!.jobs.filter((j) => j.discarded).length,
      added,
    },
  });
  Object.assign(findings[findings.length - 1].evidence as object, {
    existingJobUpdated: existingAtCapacity.description === updatedDescription,
  });
  const output = { externalRequests: 0, findings };
  await writeFile(
    resolve("artifacts/qa-fixed-backend.json"),
    JSON.stringify(output, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(output, null, 2));
  if (findings.some((finding) => !finding.fixed)) process.exitCode = 1;
} finally {
  await app.close();
  await database.closeDb();
  const target = resolve(root);
  if (
    target.startsWith(resolve(tmpdir()) + "\\empregatos-qa-audit-") ||
    target.startsWith(resolve(tmpdir()) + "/empregatos-qa-audit-")
  )
    await rm(target, { recursive: true, force: true });
}
