import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.VERIFY_API_ORIGIN || "http://127.0.0.1:3001";
const browserOrigin = "http://127.0.0.1:5173";
const accounts: { cookie: string; password: string }[] = [];
const report: Record<string, any> = {
  checkedAt: new Date().toISOString(),
  transport: "HTTP runtime API",
  externalApplications: 0,
};
async function request(
  path: string,
  account?: (typeof accounts)[number],
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-orbita-request": "1",
      Origin: browserOrigin,
      ...(account ? { Cookie: account.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: HTTP ${response.status} ${json.error || ""}`,
    );
  return { response, json };
}
async function register() {
  const password = `Validation-${randomUUID()}`;
  const result = await request("/api/auth/register", undefined, "POST", {
    name: "Verificação técnica temporária",
    email: `${randomUUID()}@example.test`,
    password,
  });
  const account = {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    password,
  };
  accounts.push(account);
  return account;
}
try {
  const unauthorized = await fetch(origin + "/api/source-registry");
  if (unauthorized.status !== 401)
    throw new Error("O catálogo deveria exigir autenticação.");
  report.unauthenticatedRegistryStatus = unauthorized.status;
  const account = await register();
  const workspace = (await request("/api/workspace", account)).json;
  if (workspace.jobs.length)
    throw new Error("Uma conta nova deveria iniciar sem oportunidades.");
  const registry = (await request("/api/source-registry", account)).json;
  if (!registry.some((source: any) => source.sector === "Educação"))
    throw new Error("Catálogo sem educação.");
  for (const board of ["lalamove", "cloudflare"]) {
    const source = registry.find((source: any) => source.board === board);
    if (!source)
      throw new Error(`Organização verificada não encontrada: ${board}`);
    await request("/api/sources", account, "POST", {
      type: source.type,
      company: source.company,
      board: source.board,
      sector: source.sector,
      enabled: true,
      ...(source.country ? { country: source.country } : {}),
    });
  }
  const queued = await request("/api/discover", account, "POST", {});
  report.enqueue = {
    httpStatus: queued.response.status,
    id: queued.json.id,
    status: queued.json.status,
  };
  const repeated = (await request("/api/discover", account, "POST", {})).json;
  if (repeated.id !== queued.json.id)
    throw new Error("Buscas concorrentes não foram deduplicadas.");
  let completed: any;
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = (await request("/api/workspace?summary=true", account)).json;
    completed = state.runs.find((run: any) => run.id === queued.json.id);
    if (completed && !["queued", "running"].includes(completed.status)) break;
    await pause(1500);
  }
  if (!completed || !["completed", "partial"].includes(completed.status))
    throw new Error(`Busca não concluiu: ${completed?.status || "ausente"}`);
  report.run = completed;
  report.sources = (
    await request("/api/workspace?summary=true", account)
  ).json.sources.map((source: any) => ({
    company: source.company,
    status: source.status,
    lastError: source.lastError,
  }));
  const neutral = {
    ...workspace.filters,
    skills: [],
    levels: [],
    contracts: [],
    locations: [],
    requiredSkills: [],
    excludedTerms: [],
    salaryMin: 0,
    salaryOnly: false,
    maxYears: 70,
    minScore: 0,
    ageDays: 365,
    language: "",
  };
  await request("/api/profile", account, "PUT", {
    ...workspace.profile,
    headline: "Auxiliar administrativo",
    education: "Ensino médio completo",
    experience: "Atendimento informal a clientes",
    skills: ["Atendimento ao cliente"],
    confirmed: true,
  });
  await request("/api/filters", account, "PUT", {
    ...neutral,
    titles: ["Auxiliar administrativo"],
    modalities: ["Presencial"],
  });
  const admin = (
    await request(
      "/api/jobs?search=auxiliar%20administrativo&pageSize=10",
      account,
    )
  ).json;
  report.administrative = {
    query: "Auxiliar administrativo",
    modality: "Presencial",
    total: admin.total,
    examples: admin.items.map((job: any) => ({
      title: job.title,
      company: job.company,
      url: job.url,
      origins: job.origins,
    })),
  };
  await request("/api/profile", account, "PUT", {
    ...workspace.profile,
    headline: "Desenvolvedor .NET",
    skills: ["C#", ".NET"],
    confirmed: true,
  });
  await request("/api/filters", account, "PUT", {
    ...neutral,
    titles: ["Desenvolvedor .NET"],
    modalities: [],
  });
  const developer = (
    await request("/api/jobs?search=.NET&pageSize=10", account)
  ).json;
  if (
    developer.items.some(
      (job: any) => job.demo || !job.url || !job.origins.length || !job.company,
    )
  )
    throw new Error("Vaga retornada sem origem real verificável.");
  report.developer = {
    query: "Desenvolvedor .NET",
    total: developer.total,
    examples: developer.items.map((job: any) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      level: job.level,
      url: job.url,
      origins: job.origins,
    })),
  };
  await request("/api/filters", account, "PUT", {
    ...neutral,
    titles: ["Desenvolvedor .NET"],
    modalities: [],
    levels: ["Júnior"],
  });
  report.juniorDeveloperCount = (
    await request("/api/jobs?search=.NET&pageSize=10", account)
  ).json.total;
  const second = await register();
  const isolated = (await request("/api/workspace", second)).json;
  if (isolated.jobs.length || isolated.sources.length || isolated.runs.length)
    throw new Error("Workspace de outra conta contaminado.");
  report.secondAccountIsolated = true;
  const page = await request("/api/jobs?page=2&pageSize=1", account);
  report.pagination = {
    page: page.json.page,
    pageSize: page.json.pageSize,
    items: page.json.items.length,
  };
} catch (error) {
  report.error = error instanceof Error ? error.message : "Verificação falhou";
  process.exitCode = 1;
} finally {
  for (const account of accounts) {
    try {
      await request("/api/account", account, "DELETE", {
        password: account.password,
      });
    } catch {
      report.cleanupFailure = true;
    }
  }
  report.temporaryAccountsDeleted = !report.cleanupFailure;
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/workflow-live.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
