import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import type { FastifyInstance } from "fastify";
import { createWorkspace } from "../server/workspace";
import { defaultFilters, type Job, type Workspace } from "../shared/types";
import { extractSkills, locationMatches } from "../server/engine";

let app: FastifyInstance,
  database: typeof import("../server/db"),
  operations: typeof import("../server/operations"),
  dir = "",
  cookie = "",
  userId = "";
const password = "QA-regression-password-123";
const headers = () => ({
  cookie,
  "x-orbita-request": "1",
  origin: "http://127.0.0.1:5173",
});
const request = (method: string, url: string, payload?: any) =>
  app.inject({ method: method as any, url, headers: headers(), payload });
const jobBody = {
  title: "Desenvolvedor .NET",
  company: "Empresa QA",
  url: "",
  description: "Desenvolvimento de APIs com C# e .NET, Git e TypeScript.",
  location: "Brasil",
  modality: "Remoto",
  level: "Júnior",
  contract: "CLT",
  salaryMin: null,
  salaryMax: null,
  currency: "BRL",
  skills: ["C#", ".NET"],
  requiredSkills: [],
  requiredYears: null,
};
const upload = async (name = "novo.docx") => {
  const bytes = zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Objetivo: Desenvolvedor .NET. Ensino médio completo. Competências C# e .NET. Primeiro emprego.</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  return app.inject({
    method: "POST",
    url: "/api/resumes",
    headers: {
      ...headers(),
      "content-type": "multipart/form-data; boundary=qa",
    },
    payload: Buffer.concat([
      Buffer.from(
        `--qa\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
      ),
      Buffer.from(bytes),
      Buffer.from("\r\n--qa--\r\n"),
    ]),
  });
};
const answers = (resumeId: string) => ({
  resumeId,
  titles: ["Desenvolvedor .NET"],
  modalities: ["Remoto"],
  city: "",
  sameCityOnly: true,
  salaryMin: 0,
  salaryMax: 0,
  includeUnknownSalary: true,
  ageDays: 365,
  contracts: [],
  sites: ["gupy"],
  dailyLimit: 1,
});
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "empregatos-regression-"));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  for (const key of [
    "DATABASE_URL",
    "REDIS_URL",
    "GEMINI_API_KEY",
    "OPENCODE_ZEN_API_KEY",
    "OPENCODE_API_KEY",
  ])
    process.env[key] = "";
  database = await import("../server/db");
  operations = await import("../server/operations");
  app = await (await import("../server/app")).buildApp();
  app.get("/api/qa-internal-error", async () => {
    throw new Error("PRIVATE_SQL_AND_PATH_SHOULD_NOT_LEAK");
  });
  const registered = await request("POST", "/api/auth/register", {
    name: "Pessoa QA",
    email: "regression@example.test",
    password,
  });
  expect(registered.statusCode).toBe(200);
  cookie = String(registered.headers["set-cookie"]).split(";")[0];
  userId = registered.json().id;
}, 30000);
beforeEach(async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Rede externa bloqueada no teste"),
  );
  await database.mutateWorkspace(userId + ":live", (w) =>
    Object.assign(w, createWorkspace("Pessoa QA", "regression@example.test"), {
      interview: undefined,
      interviewDraft: undefined,
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (dir.startsWith(join(tmpdir(), "empregatos-regression-")))
    await rm(dir, { recursive: true, force: true });
});
describe("Regressões da auditoria", () => {
  it("ativar um perfil salvo não muda uma rotina ativa para envio sem uma nova ativação", async () => {
    const saved = await request("POST", "/api/search-profiles", {
      name: "Busca com envio",
      filters: defaultFilters,
      mode: "automatic",
    });
    expect(saved.statusCode).toBe(200);
    await database.mutateWorkspace(userId + ":live", (w) => {
      w.routine.enabled = true;
      w.routine.mode = "approval";
      w.routine.nextRun = new Date().toISOString();
    });
    expect(
      (
        await request(
          "POST",
          `/api/search-profiles/${saved.json().id}/activate`,
        )
      ).statusCode,
    ).toBe(200);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.routine.mode).toBe("automatic");
    expect(w.routine.enabled).toBe(false);
    expect(w.routine.nextRun).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("reanálise de currículo ativo exige nova aprovação e pausa a rotina", async () => {
    const resumeId = (await upload()).json().id;
    await request("PUT", "/api/interview", {
      step: 5,
      complete: true,
      start: "save",
      answers: answers(resumeId),
    });
    await database.mutateWorkspace(userId + ":live", (w) => {
      w.routine.enabled = true;
      w.routine.mode = "automatic";
    });
    expect(
      (await request("POST", `/api/resumes/${resumeId}/analyze`)).statusCode,
    ).toBe(200);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.resumes[0].approved).toBe(false);
    expect(w.profile.confirmed).toBe(false);
    expect(w.routine.enabled).toBe(false);
    expect(w.routine.nextRun).toBeNull();
  });
  it("envio automático respeita o cargo atual mesmo quando competências dão uma nota alta", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "true");
    vi.stubEnv("APPLICATION_WEBHOOK_URL", "https://adapter.example.test/apply");
    vi.stubEnv("APPLICATION_WEBHOOK_TOKEN", "fixture");
    const resumeId = (await upload()).json().id;
    const jobId = (
      await request("POST", "/api/jobs", {
        ...jobBody,
        url: "https://example.test/job/criteria",
      })
    ).json().id;
    const applicationId = await database.mutateWorkspace(
      userId + ":live",
      (w) => {
        w.profile.confirmed = true;
        w.resumes[0].approved = true;
        const application = operations.prepare(w, jobId);
        application.status = "Aguardando aprovação";
        w.routine.enabled = true;
        w.routine.mode = "automatic";
        w.routine.minScore = 0;
        w.filters.titles = ["Enfermeiro"];
        w.sources = [
          {
            id: "authorized",
            type: "authorized",
            board: "adapter",
            company: jobBody.company,
            enabled: true,
            discovery: false,
            application: true,
            status: "",
          },
        ];
        return application.id;
      },
    );
    await expect(
      operations.automaticSend(userId + ":live", applicationId),
    ).rejects.toThrow("critérios");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(
      (await database.readWorkspace(userId + ":live"))!.applications[0].status,
    ).toBe("Aguardando aprovação");
  });
  it("preserva vagas diferentes sem URL e retorna o ID persistido para uma duplicata", async () => {
    const first = await request("POST", "/api/jobs", jobBody);
    const second = await request("POST", "/api/jobs", {
      ...jobBody,
      title: "Operador de caixa",
      company: "Outra empresa",
    });
    const duplicate = await request("POST", "/api/jobs", jobBody);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.jobs).toHaveLength(2);
    expect(second.json().id).not.toBe(first.json().id);
    expect(duplicate.json().id).toBe(first.json().id);
    expect(w.jobs.find((job: Job) => job.id === first.json().id).title).toBe(
      jobBody.title,
    );
  });
  it("rejeita salários invertidos sem modificar os filtros salvos", async () => {
    const response = await request("PUT", "/api/filters", {
      ...defaultFilters,
      salaryMin: 9000,
      salaryMax: 1000,
    });
    expect(response.statusCode).toBe(400);
    expect(
      (await request("GET", "/api/workspace")).json().filters.salaryMin,
    ).toBe(0);
    expect(
      (
        await request("PUT", "/api/filters", {
          ...defaultFilters,
          salaryMin: 9000,
          salaryMax: 0,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("não funde anúncios com cargo, empresa e cidade iguais mas IDs e URLs diferentes", async () => {
    const first = await request("POST", "/api/jobs", {
      ...jobBody,
      url: "https://empresa.gupy.io/jobs/100",
    });
    const second = await request("POST", "/api/jobs", {
      ...jobBody,
      url: "https://empresa.gupy.io/jobs/101",
    });
    expect(second.json().id).not.toBe(first.json().id);
    expect((await request("GET", "/api/workspace")).json().jobs).toHaveLength(
      2,
    );
  });
  it("remove telefones sem pontuação antes da análise externa", async () => {
    const { minimizeResume } = await import("../server/resume-privacy");
    const sanitized = minimizeResume(
      "Currículo profissional.\nMeu contato é 1134567890 ou 5511999998888.\nCompetências: C# e .NET.",
    );
    expect(sanitized).not.toContain("1134567890");
    expect(sanitized).not.toContain("5511999998888");
    expect(sanitized).toContain("C# e .NET");
  });
  it("inclui candidatura na listagem e oferece vagas fora do resumo para registro manual", async () => {
    const first = (await request("POST", "/api/jobs", jobBody)).json();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    expect(
      (
        await request("POST", "/api/applications/manual", {
          jobId: first.id,
          date: today,
          note: "",
          confirmation: true,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/jobs")).json().items[0].application.status,
    ).toBe("Enviada");
    for (let index = 0; index < 10; index++)
      await request("POST", "/api/jobs", {
        ...jobBody,
        title: `Vaga ${index}`,
        company: `Empresa ${index}`,
      });
    await request("PUT", "/api/filters", {
      ...defaultFilters,
      titles: ["Cargo sem resultados"],
    });
    expect((await request("GET", "/api/jobs")).json().total).toBe(0);
    const manual = (await request("GET", "/api/jobs?purpose=manual")).json();
    expect(manual.total).toBe(10);
    expect(manual.items.some((job: Job) => job.id === first.id)).toBe(false);
  });
  it("pausa a rotina ao trocar currículo e substitui informações profissionais antigas", async () => {
    const original = (await upload()).json().id;
    await database.mutateWorkspace(userId + ":live", (w) => {
      w.routine.enabled = true;
      w.routine.mode = "automatic";
      w.routine.nextRun = new Date().toISOString();
      w.interview = { step: 5, completed: true, answers: answers(original) };
      w.profile.years = 12;
      w.profile.level = "Sênior";
      w.profile.experience = "Experiência antiga";
    });
    const replaced = await upload("substituto.docx");
    expect(replaced.statusCode).toBe(200);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.routine.enabled).toBe(false);
    expect(w.routine.nextRun).toBeNull();
    await database.mutateWorkspace(userId + ":live", (current) => {
      current.resumes[0].suggestion = {
        years: 0,
        level: "Júnior",
        experience: "",
      };
    });
    expect(
      (
        await request("PUT", "/api/interview", {
          step: 5,
          complete: true,
          answers: answers(replaced.json().id),
          start: "save",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/workspace")).json().profile,
    ).toMatchObject({
      confirmed: true,
      years: 0,
      level: "Júnior",
      experience: "",
    });
  });
  it("rascunho de novas preferências não muda os sites e critérios confirmados", async () => {
    const resume = (await upload()).json().id;
    await request("PUT", "/api/interview", {
      step: 5,
      complete: true,
      start: "save",
      answers: answers(resume),
    });
    await request("PUT", "/api/interview", {
      step: 2,
      complete: false,
      answers: { ...answers(resume), sites: ["linkedin"], salaryMin: 7000 },
    });
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.interview.completed).toBe(true);
    expect(w.interview.answers.sites).toEqual(["gupy"]);
    expect(w.interviewDraft.answers.sites).toEqual(["linkedin"]);
    expect(w.filters.salaryMin).toBe(0);
  });
  it("na capacidade máxima atualiza vagas existentes e preserva candidaturas e salvos", async () => {
    const fixture = (await request("POST", "/api/jobs", jobBody)).json() as Job;
    const w = createWorkspace("QA", "qa@example.test");
    w.jobs = Array.from({ length: 2000 }, (_, index) => ({
      ...structuredClone(fixture),
      id: `job-${index}`,
      title: `Vaga ${index}`,
      company: `Empresa ${index}`,
      url: `https://example.test/${index}`,
      discarded: true,
    }));
    w.jobs[1999].saved = true;
    const protectedJob = w.jobs[1998];
    w.applications = [
      {
        id: randomUUID(),
        jobId: protectedJob.id,
        status: "Enviada",
        mode: "manual",
        receipt: null,
        note: "",
        resumeId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [],
      },
    ];
    const existing = w.jobs[0];
    const newJob = {
      ...structuredClone(fixture),
      id: randomUUID(),
      title: "Nova",
      url: "https://example.test/new",
    };
    expect(
      operations.mergeJobs(w, [
        newJob,
        {
          ...structuredClone(existing),
          description: "Texto atualizado com novos requisitos",
        },
      ]),
    ).toBe(1);
    expect(w.jobs).toHaveLength(2000);
    expect(existing.description).toContain("atualizado");
    expect(w.jobs.some((job) => job.id === protectedJob.id)).toBe(true);
    expect(w.jobs.some((job) => job.saved)).toBe(true);
    w.jobs.forEach((job) => {
      job.discarded = false;
      job.availability = "active";
    });
    const updated = "Atualização mesmo sem espaço disponível";
    operations.mergeJobs(w, [
      {
        ...newJob,
        id: randomUUID(),
        title: "Mais uma",
        url: "https://example.test/another",
      },
      { ...structuredClone(existing), description: updated },
    ]);
    expect(existing.description).toBe(updated);
    expect(w.notices[0].title).toBe("Limite de vagas atingido");
  });
  it("o limite diário mantém candidaturas na fila para o próximo dia", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "true");
    vi.stubEnv("APPLICATION_WEBHOOK_URL", "https://adapter.example.test/apply");
    vi.stubEnv("APPLICATION_WEBHOOK_TOKEN", "fixture");
    await database.mutateWorkspace(userId + ":live", (w) => {
      w.routine.enabled = true;
      w.routine.mode = "automatic";
      w.routine.dailyLimit = 1;
      const at = new Date().toISOString();
      w.applications = ["Enviada", "Aguardando aprovação"].map(
        (status, index) => ({
          id: randomUUID(),
          jobId: `job-${index}`,
          status: status as any,
          mode: "automatic",
          receipt: null,
          note: "",
          resumeId: null,
          createdAt: at,
          updatedAt: at,
          submittedAt: index === 0 ? at : undefined,
          history: [],
        }),
      );
    });
    await operations.processAutomaticApplications(userId + ":live");
    expect(
      (await database.readWorkspace(userId + ":live"))!.applications[1].status,
    ).toBe("Aguardando aprovação");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("rotina agendada usa a mesma fila persistida sem duplicar buscas", async () => {
    await database.mutateWorkspace(userId + ":live", (w) => {
      w.routine.enabled = true;
      w.sources = [
        {
          id: "source",
          type: "greenhouse",
          board: "audit",
          company: "QA",
          enabled: true,
          discovery: true,
          application: false,
          status: "",
        },
      ];
    });
    await operations.executeRoutine(userId + ":live");
    await operations.executeRoutine(userId + ":live");
    const w = (await database.readWorkspace(userId + ":live"))!;
    expect(w.runs).toHaveLength(1);
    expect(w.runs[0].status).toBe("queued");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("erros internos retornam 500 sem expor mensagens privadas", async () => {
    const response = await request("GET", "/api/qa-internal-error");
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("PRIVATE_SQL");
  });
  it("não transforma competências técnicas negadas em qualificações, inclusive após quebra de linha", async () => {
    expect(
      extractSkills(
        "Não tenho experiência com Angular.\nCompetências: C# e .NET.",
      ),
    ).toEqual(["C#", ".NET"]);
    expect(
      extractSkills(
        "Não possuo experiência em\nAngular\nCompetências: C# e .NET.",
      ),
    ).not.toContain("Angular");
    const { verifyEvidence } = await import("../server/intelligence");
    expect(
      verifyEvidence(
        {
          fields: [],
          skills: [{ name: "Angular", evidence: "Angular" }],
          years: null,
          yearsEvidence: "",
        },
        "Não tenho experiência com Angular.",
      ).skills,
    ).toEqual([]);
  });
  it("preserva a extensão de currículos com nomes longos para o envio nativo", async () => {
    const response = await upload("x".repeat(230) + ".docx");
    expect(response.statusCode).toBe(200);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.resumes[0].name.length).toBeLessThanOrEqual(200);
    expect(w.resumes[0].name.endsWith(".docx")).toBe(true);
    expect(
      (await request("GET", `/api/resumes/${response.json().id}/download`))
        .statusCode,
    ).toBe(200);
  });
  it("cidade não aceita outra cidade por substring nem ignora estado conflitante", () => {
    expect(locationMatches("Natal, PB", ["Natal, RN"])).toBe(false);
    expect(locationMatches("Rio de Janeiro, RJ", ["Rio"])).toBe(false);
    expect(locationMatches("Natal, Rio Grande do Norte", ["Natal, RN"])).toBe(
      true,
    );
    expect(
      locationMatches("Belo Horizonte, Brazil", ["Belo Horizonte, MG"]),
    ).toBe(true);
  });
  it("falha na criação do workspace não deixa uma conta órfã nem expõe detalhes internos", async () => {
    const module = await import("../server/workspace");
    vi.spyOn(module, "createWorkspace").mockImplementationOnce(() => {
      throw new Error("PRIVATE_INITIALIZATION_FAILED");
    });
    const response = await request("POST", "/api/auth/register", {
      name: "Conta interrompida",
      email: "rollback@example.test",
      password,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("PRIVATE");
    const { users } = await import("../server/schema");
    const { eq } = await import("drizzle-orm");
    expect(
      await database.db
        .select()
        .from(users)
        .where(eq(users.email, "rollback@example.test")),
    ).toHaveLength(0);
    expect(
      (
        await request("POST", "/api/auth/register", {
          name: "Conta recuperada",
          email: "rollback@example.test",
          password,
        })
      ).statusCode,
    ).toBe(200);
  });
});
