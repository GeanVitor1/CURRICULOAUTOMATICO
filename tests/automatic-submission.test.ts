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
import { zipSync, strToU8 } from "fflate";
import type { FastifyInstance } from "fastify";
import type { Job, Resume } from "../shared/types";
import { createWorkspace } from "../server/workspace";
import { eq } from "drizzle-orm";

let app: FastifyInstance,
  directory = "",
  cookie = "",
  workspaceId = "",
  resume: Resume;
let database: typeof import("../server/db"),
  operations: typeof import("../server/operations"),
  native: typeof import("../server/portal-sessions");
const bytes = Buffer.from(
  zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Objetivo: Desenvolvedor .NET. Competências C# .NET Git. Primeiro emprego. Ensino médio completo.</w:t></w:r></w:p></w:body></w:document>',
    ),
  }),
);
function job(id: string, portal = "gupy"): Job {
  const url =
    portal === "gupy"
      ? `https://empresa.gupy.io/jobs/${id}`
      : `https://www.infojobs.com.br/vaga-de-desenvolvedor__${id}.aspx`;
  return {
    id,
    title: "Desenvolvedor .NET",
    company: "Empresa",
    source: portal,
    url,
    description: "Desenvolvimento de APIs com C# .NET e Git.",
    location: "Brasil",
    modality: "Remoto",
    level: "Júnior",
    contract: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: ["C#", ".NET", "Git"],
    requiredSkills: [],
    requiredYears: null,
    publishedAt: null,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    origins: [{ source: "portal", url, id: `${portal}:${id}` }],
    match: {} as Job["match"],
    demo: false,
  };
}
const prepare = async (jobs: Job[], waiting = true) =>
  database.mutateWorkspace(workspaceId, (w) => {
    w.jobs.push(...jobs);
    const prepared = jobs.map((job) => operations.prepare(w, job.id));
    if (waiting) prepared.forEach((a) => (a.status = "Aguardando aprovação"));
    w.applications = [
      ...prepared,
      ...w.applications.filter((a) => !prepared.includes(a)),
    ];
    return prepared.map((a) => a.id);
  });
const sender = () =>
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          status: "sent",
          receipt: "controlled-test-receipt",
        }),
      ),
  );
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-send-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  database = await import("../server/db");
  operations = await import("../server/operations");
  native = await import("../server/portal-sessions");
  app = await (await import("../server/app")).buildApp();
  const headers = { "x-orbita-request": "1", origin: "http://127.0.0.1:5173" };
  const account = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers,
    payload: {
      name: "Pessoa candidata",
      email: "sending@example.test",
      password: "Sending-password-123",
    },
  });
  expect(account.statusCode).toBe(200);
  cookie = String(account.headers["set-cookie"]).split(";")[0];
  workspaceId = `${account.json().id}:live`;
  const uploaded = await app.inject({
    method: "POST",
    url: "/api/resumes",
    headers: {
      ...headers,
      cookie,
      "content-type": "multipart/form-data; boundary=resume",
    },
    payload: Buffer.concat([
      Buffer.from(
        '--resume\r\nContent-Disposition: form-data; name="file"; filename="curriculo.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n',
      ),
      bytes,
      Buffer.from("\r\n--resume--\r\n"),
    ]),
  });
  expect(uploaded.statusCode).toBe(200);
  resume = structuredClone(
    (await database.readWorkspace(workspaceId))!.resumes[0],
  );
}, 30000);
beforeEach(async () => {
  const { applicationUsage } = await import("../server/schema");
  await database.db
    .delete(applicationUsage)
    .where(eq(applicationUsage.userId, workspaceId.split(":")[0]));
  vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "true");
  vi.stubEnv(
    "APPLICATION_WEBHOOK_URL",
    "https://sender.example.test/applications",
  );
  vi.stubEnv("APPLICATION_WEBHOOK_TOKEN", "private-test-token");
  vi.stubEnv("APPLICATION_WEBHOOK_PORTALS", "gupy");
  vi.stubEnv("PORTAL_BROWSER_AUTHORIZED", "");
  vi.spyOn(native, "connectedPortals").mockResolvedValue([]);
  await database.mutateWorkspace(workspaceId, (w) => {
    Object.assign(
      w,
      createWorkspace("Pessoa candidata", "sending@example.test"),
    );
    w.resumes = [
      { ...structuredClone(resume), approved: true, targetsConfirmed: false },
    ];
    w.profile.confirmed = true;
    w.profile.headline = "Desenvolvedor .NET";
    w.profile.skills = ["C#", ".NET", "Git"];
    w.filters.titles = ["Desenvolvedor .NET"];
    w.routine.enabled = true;
    w.routine.mode = "automatic";
    w.routine.minScore = 0;
    w.routine.dailyLimit = 1;
    w.sources = ["gupy", "infojobs"].map((board) => ({
      id: board,
      type: "portal",
      board,
      company: board,
      enabled: true,
      discovery: true,
      application: true,
      status: "",
    }));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-send-")))
    await rm(directory, { recursive: true, force: true });
});
describe("Encaminhamento real de candidaturas, sem serviços externos no teste", () => {
  it("prioriza API configurada sobre navegador e envia arquivo original e chave idempotente", async () => {
    vi.mocked(native.connectedPortals).mockResolvedValue(["gupy"]);
    const browser = vi.spyOn(native, "sendNativeApplication");
    const send = sender();
    const [id] = await prepare([job("101")]);
    const result = await operations.automaticSend(workspaceId, id);
    expect(result.status).toBe("Enviada");
    expect(browser).not.toHaveBeenCalled();
    const request = send.mock.calls[0];
    const body = JSON.parse(String(request[1]?.body));
    expect(Buffer.from(body.resume.file.data, "base64")).toEqual(bytes);
    expect(body.resume.file.mimeType).toContain("wordprocessingml");
    expect(
      (request[1]?.headers as Record<string, string>)["Idempotency-Key"],
    ).toBe(id);
    expect(body).not.toHaveProperty("delivery");
  });
  it("também transmite o PDF/DOCX original a uma fonte autorizada por empresa", async () => {
    const send = sender();
    await database.mutateWorkspace(workspaceId, (w) => {
      w.sources = [
        {
          id: "company",
          type: "authorized",
          company: "Empresa",
          board: "sender",
          enabled: true,
          discovery: false,
          application: true,
          status: "",
        },
      ];
    });
    const [id] = await prepare([
      { ...job("102"), url: "https://empresa.example.test/jobs/102" },
    ]);
    expect((await operations.automaticSend(workspaceId, id)).status).toBe(
      "Enviada",
    );
    const body = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(body.portal).toBeNull();
    expect(Buffer.from(body.resume.file.data, "base64")).toEqual(bytes);
  });
  it("uma vaga sem envio disponível na frente da fila não impede uma candidatura elegível", async () => {
    const send = sender();
    const [manual, automatic] = await prepare([
      job("103", "infojobs"),
      job("104"),
    ]);
    await operations.processAutomaticApplications(workspaceId);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.applications.find((a) => a.id === manual)?.status).toBe(
      "Requer ação manual",
    );
    expect(w.applications.find((a) => a.id === automatic)?.status).toBe(
      "Enviada",
    );
    expect(send).toHaveBeenCalledOnce();
  });
  it("preparações sem integração não consomem a cota diária da busca automática", async () => {
    const portal = await import("../server/portal-discovery");
    await prepare([job("105", "infojobs")]);
    vi.spyOn(portal, "discoverPortal").mockImplementation(async (source) => ({
      jobs: source.board === "gupy" ? [job("106")] : [],
      checkedAt: new Date().toISOString(),
      cached: false,
      method: "controlled-test",
    }));
    await operations.discover(workspaceId);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.applications.find((a) => a.jobId === "106")?.status).toBe(
      "Aguardando aprovação",
    );
  });
  it("arquivo ausente é recusado antes de registrar ou transmitir uma tentativa", async () => {
    const send = sender();
    await database.mutateWorkspace(
      workspaceId,
      (w) => (w.resumes[0].id = "missing-original"),
    );
    const [id] = await prepare([job("107")]);
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow(
      "arquivo original",
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      (await database.readWorkspace(workspaceId))!.applications[0].status,
    ).toBe("Aguardando aprovação");
  });
  it("ativação automática recupera preparações locais e preserva tentativas que exigem intervenção", async () => {
    const [fresh, attempted] = await prepare([job("108"), job("109")], false);
    await database.mutateWorkspace(workspaceId, (w) =>
      w.applications[1].history.push({
        at: new Date().toISOString(),
        actor: "Sistema",
        message: "Envio iniciado. Pergunta adicional do portal.",
      }),
    );
    const result = await app.inject({
      method: "PUT",
      url: "/api/routine",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "x-orbita-request": "1",
      },
      payload: {
        enabled: true,
        mode: "automatic",
        time: "08:00",
        minScore: 0,
        dailyLimit: 1,
      },
    });
    expect(result.statusCode).toBe(200);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.applications.find((a) => a.id === fresh)?.status).toBe(
      "Aguardando aprovação",
    );
    expect(w.applications.find((a) => a.id === attempted)?.status).toBe(
      "Requer ação manual",
    );
  });
  it("resultado desconhecido ocupa a cota e nunca é reenviado automaticamente", async () => {
    const send = sender();
    const [unknown, pending] = await prepare([job("110"), job("111")]);
    await database.mutateWorkspace(workspaceId, (w) => {
      const a = w.applications.find((a) => a.id === unknown)!;
      a.status = "Resultado desconhecido";
      a.history.push({
        at: new Date().toISOString(),
        actor: "Sistema",
        message: "Envio iniciado. Sem resposta.",
      });
    });
    await operations.processAutomaticApplications(workspaceId);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await database.readWorkspace(workspaceId))!.applications.find(
        (a) => a.id === pending,
      )?.status,
    ).toBe("Aguardando aprovação");
  });
  it("expõe bloqueio por site e não promete envio quando nenhum provedor está configurado", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    const sites = (
      await app.inject({ url: "/api/automation/sites", headers: { cookie } })
    ).json();
    expect(
      sites.every(
        (site: any) =>
          !site.automatic && site.applicationBlocker === "integration_missing",
      ),
    ).toBe(true);
    expect(
      (await app.inject({ url: "/api/workspace", headers: { cookie } })).json()
        .infrastructure.automatic,
    ).toBe(false);
  });
});
