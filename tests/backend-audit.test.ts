import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createWorkspace } from "../server/workspace";
import type { Job } from "../shared/types";
import { send } from "@vercel/queue";
import {
  withDiscoveryBudget,
  discoverySignal,
} from "../server/discovery-budget";
import { cronAuthorized } from "../server/vercel-cron";

vi.mock("@vercel/queue", () => ({
  send: vi.fn().mockResolvedValue({ messageId: "test-message" }),
}));

let directory = "";
let app: FastifyInstance;
let database: typeof import("../server/db");
let schema: typeof import("../server/schema");
let operations: typeof import("../server/operations");
let tasks: typeof import("../server/discovery-queue");
let catalog: typeof import("../server/source-catalog");
let cookie = "";

const deferred = <T>() => {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-backend-audit-"));
  process.env.DATA_DIR = directory;
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
  schema = await import("../server/schema");
  operations = await import("../server/operations");
  tasks = await import("../server/discovery-queue");
  catalog = await import("../server/source-catalog");
  app = await (await import("../server/app")).buildApp();
  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { "x-orbita-request": "1", origin: "http://127.0.0.1:5173" },
    payload: {
      name: "Pessoa isolada",
      email: "isolated@example.test",
      password: "Backend-test-password-123",
    },
  });
  expect(registered.statusCode).toBe(200);
  cookie = String(registered.headers["set-cookie"]).split(";")[0];
}, 30000);

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  const temporaryDirectory = relative(tmpdir(), directory);
  if (
    directory &&
    temporaryDirectory.startsWith("empregatos-backend-audit-") &&
    !temporaryDirectory.includes(sep)
  )
    await rm(directory, { recursive: true, force: true });
});

async function queuedWorkspace() {
  const userId = randomUUID();
  const id = `${userId}:live`;
  await database.db.insert(schema.users).values({
    id: userId,
    name: "Worker isolado",
    email: `${userId}@example.test`,
    password: "disabled",
  });
  const workspace = createWorkspace("Worker isolado", `${userId}@example.test`);
  workspace.sources = [
    {
      id: "isolated-source",
      board: userId,
      company: "Empresa isolada",
      type: "greenhouse",
      enabled: true,
      discovery: true,
      application: false,
      status: "",
    },
  ];
  await database.db
    .insert(schema.workspaces)
    .values({ id, userId, data: workspace });
  return { id, task: await tasks.enqueueDiscovery(id) };
}

const result = (jobs: Job[] = []) => ({
  jobs,
  checkedAt: new Date().toISOString(),
  cached: false,
});
const staleJob = (): Job => ({
  id: randomUUID(),
  title: "Resultado obsoleto",
  company: "Empresa isolada",
  url: "https://example.test/stale",
  description: "Anúncio vindo do worker substituído.",
  location: "Recife",
  modality: "Presencial",
  level: "Não informado",
  contract: "CLT",
  salaryMin: null,
  salaryMax: null,
  currency: "BRL",
  requiredYears: null,
  skills: [],
  requiredSkills: [],
  origins: [
    { source: "greenhouse", id: "stale:1", url: "https://example.test/stale" },
  ],
  source: "greenhouse",
  publishedAt: null,
  demo: false,
  discoveredAt: new Date().toISOString(),
  availability: "unknown",
  saved: false,
  discarded: false,
  match: {
    score: 0,
    confidence: "insufficient",
    strengths: [],
    matchedSkills: [],
    missingSkills: [],
    gaps: [],
    blockers: [],
    explanation: "",
    radar: false,
  },
});

describe("Confiabilidade do backend durante concorrência e deploy", () => {
  it("a entrega processa somente a tarefa indicada e ignora uma entrega repetida", async () => {
    const first = await queuedWorkspace();
    const second = await queuedWorkspace();
    const discover = vi
      .spyOn(catalog, "discoverCachedSource")
      .mockResolvedValue(result());
    expect(await tasks.processNextDiscoveryTask(second.task.id)).toBe(true);
    expect((await database.readWorkspace(first.id))!.runs[0].status).toBe(
      "queued",
    );
    expect(await tasks.processNextDiscoveryTask(second.task.id)).toBe(false);
    expect(discover).toHaveBeenCalledTimes(1);
    await tasks.processNextDiscoveryTask(first.task.id);
  });

  it("uma entrega concorrente é adiada enquanto a primeira mantém a lease", async () => {
    const { task } = await queuedWorkspace();
    const entered = deferred<void>();
    const waiting = deferred<ReturnType<typeof result>>();
    vi.spyOn(catalog, "discoverCachedSource").mockImplementation(async () => {
      entered.resolve();
      return waiting.promise;
    });
    const processing = tasks.processNextDiscoveryTask(task.id);
    await entered.promise;
    await expect(
      tasks.processNextDiscoveryTask(task.id),
    ).rejects.toBeInstanceOf(tasks.DiscoveryTaskBusyError);
    waiting.resolve(result());
    await processing;
  });

  it("falha de publicação preserva a tarefa e uma nova tentativa publica o mesmo ID", async () => {
    const { id, task } = await queuedWorkspace();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("API_UPSTREAM_ORIGIN", "");
    vi.mocked(send).mockRejectedValueOnce(
      new Error("private provider failure"),
    );
    await expect(tasks.enqueueDiscovery(id)).rejects.toThrow(
      "Suas preferências foram salvas",
    );
    const retried = await tasks.enqueueDiscovery(id);
    expect(retried.id).toBe(task.id);
    expect(send).toHaveBeenLastCalledWith(
      "empregatos-discovery",
      { taskId: task.id },
      expect.objectContaining({ idempotencyKey: task.id }),
    );
    vi.unstubAllEnvs();
    vi.spyOn(catalog, "discoverCachedSource").mockResolvedValue(result());
    await tasks.processNextDiscoveryTask(task.id);
  });

  it("a rotina diária exige um segredo e a busca respeita seu orçamento de tempo", async () => {
    expect(cronAuthorized(undefined, "test-secret")).toBe(false);
    expect(cronAuthorized("Bearer test-secret", "")).toBe(false);
    expect(cronAuthorized("Bearer incorrect", "test-secret")).toBe(false);
    expect(cronAuthorized("Bearer test-secret", "test-secret")).toBe(true);
    await withDiscoveryBudget(5, async () => {
      const signal = discoverySignal(1000);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(signal.aborted).toBe(true);
      expect(() => discoverySignal(1000)).toThrow();
    });
    expect(discoverySignal(1000).aborted).toBe(false);
  });
  it("conclui as preferências na Vercel e entrega uma busca em vez de rejeitar a automação", async () => {
    const headers = {
      cookie,
      "x-orbita-request": "1",
      origin: "http://127.0.0.1:5173",
    };
    const me = (await app.inject({ url: "/api/auth/me", headers })).json();
    const workspaceId = `${me.id}:live`;
    await database.mutateWorkspace(workspaceId, (w) => {
      w.resumes = [
        {
          id: "interview-resume",
          name: "Fictício.txt",
          uploadedAt: new Date().toISOString(),
          text: "Objetivo: Desenvolvedor .NET. Projeto em C# e SQL Server.",
          skills: ["C#", "SQL Server"],
          approved: false,
          analysis: "",
        },
      ];
    });
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://automation.example.test");
    headers.origin = "https://automation.example.test";
    vi.stubEnv("API_UPSTREAM_ORIGIN", "");
    try {
      const response = await app.inject({
        method: "PUT",
        url: "/api/interview",
        headers,
        payload: {
          step: 5,
          complete: true,
          start: "prepare",
          answers: {
            resumeId: "interview-resume",
            titles: ["Desenvolvedor .NET"],
            modalities: ["Remoto"],
            city: "",
            sameCityOnly: false,
            salaryMin: 0,
            salaryMax: 0,
            includeUnknownSalary: true,
            ageDays: 365,
            contracts: [],
            sites: ["gupy"],
            dailyLimit: 5,
          },
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      const workspace = (await database.readWorkspace(workspaceId))!;
      expect(workspace.interview?.completed).toBe(true);
      expect(workspace.routine).toMatchObject({
        enabled: true,
        mode: "approval",
        time: "08:00",
      });
      expect(workspace.runs[0].status).toBe("queued");
      expect(send).toHaveBeenLastCalledWith(
        "empregatos-discovery",
        { taskId: workspace.runs[0].id },
        expect.anything(),
      );
    } finally {
      vi.unstubAllEnvs();
      await database.db
        .delete(schema.discoveryTasks)
        .where(eq(schema.discoveryTasks.workspaceId, workspaceId));
      await database.mutateWorkspace(workspaceId, (w) => {
        w.routine.enabled = false;
        w.routine.nextRun = null;
      });
    }
  });

  it("a preparação assistida deixa a candidatura pronta para concluir no site sem uma aprovação de envio automático", async () => {
    const me = (
      await app.inject({ url: "/api/auth/me", headers: { cookie } })
    ).json();
    const id = `${me.id}:live`;
    const make = () => ({
      ...staleJob(),
      id: randomUUID(),
      title: "Desenvolvedor .NET",
      description: "Desenvolvimento C# SQL Server. Remote.",
      modality: "Remoto",
      publishedAt: new Date().toISOString(),
    });
    await database.mutateWorkspace(id, (w) => {
      w.routine = {
        ...w.routine,
        enabled: true,
        mode: "approval",
        minScore: 0,
      };
      delete w.interview;
      w.profile = {
        ...w.profile,
        headline: "Desenvolvedor .NET",
        skills: ["C#", ".NET", "SQL Server"],
        confirmed: true,
      };
      w.resumes = [
        {
          id: "assisted-resume",
          name: "Fictício.pdf",
          text: "Desenvolvedor .NET com C# e SQL Server em projetos.",
          skills: ["C#", ".NET", "SQL Server"],
          uploadedAt: new Date().toISOString(),
          approved: true,
          analysis: "",
          targetsVersion: 3,
        },
      ];
      w.sources = [
        {
          id: "assisted-source",
          board: "assisted",
          company: "Empresa fictícia",
          type: "greenhouse",
          enabled: true,
          discovery: true,
          application: false,
          status: "",
        },
      ];
      const prior = make();
      w.jobs = [prior];
      const application = operations.prepare(w, prior.id);
      application.status = "Aguardando aprovação";
    });
    vi.spyOn(catalog, "discoverCachedSource").mockResolvedValue(
      result([
        {
          ...make(),
          url: "https://example.test/new",
          origins: [
            {
              source: "greenhouse",
              id: "assisted:new",
              url: "https://example.test/new",
            },
          ],
        },
      ]),
    );
    await operations.discover(id);
    const w = (await database.readWorkspace(id))!;
    expect(w.applications).toHaveLength(2);
    expect(
      w.applications.every(
        (application) =>
          application.status === "Requer ação manual" &&
          !application.submittedAt &&
          !!application.draft,
      ),
    ).toBe(true);
    await database.mutateWorkspace(id, (current) => {
      current.routine.enabled = false;
    });
  });

  it("worker com lease substituída não publica anúncios antigos nem dispara envio", async () => {
    const { id, task } = await queuedWorkspace();
    const entered = deferred<void>();
    const waiting = deferred<ReturnType<typeof result>>();
    vi.spyOn(catalog, "discoverCachedSource").mockImplementation(async () => {
      entered.resolve();
      return waiting.promise;
    });
    const automatic = vi
      .spyOn(operations, "processAutomaticApplications")
      .mockResolvedValue();
    const processing = tasks.processNextDiscoveryTask();
    await entered.promise;
    await database.db
      .update(schema.discoveryTasks)
      .set({ leaseToken: "replacement-owner" })
      .where(eq(schema.discoveryTasks.id, task.id));
    await database.mutateWorkspace(id, (w) => {
      w.runs[0].status = "completed";
      w.runs[0].message = "Resultado do novo worker";
    });
    waiting.resolve(result([staleJob()]));
    expect(await processing).toBe(true);
    const workspace = (await database.readWorkspace(id))!;
    expect(workspace.jobs).toHaveLength(0);
    expect(workspace.runs[0]).toMatchObject({
      status: "completed",
      message: "Resultado do novo worker",
    });
    expect(automatic).not.toHaveBeenCalled();
    await database.db
      .update(schema.discoveryTasks)
      .set({ status: "completed", leaseToken: null })
      .where(eq(schema.discoveryTasks.id, task.id));
  });

  it("erro tardio de um worker substituído preserva a tarefa e o histórico atuais", async () => {
    const { id, task } = await queuedWorkspace();
    const entered = deferred<void>();
    const waiting = deferred<never>();
    vi.spyOn(operations, "discover").mockImplementation(async () => {
      entered.resolve();
      return waiting.promise;
    });
    const processing = tasks.processNextDiscoveryTask();
    await entered.promise;
    await database.db
      .update(schema.discoveryTasks)
      .set({ status: "completed", leaseToken: null })
      .where(eq(schema.discoveryTasks.id, task.id));
    await database.mutateWorkspace(id, (w) => {
      w.runs[0].status = "completed";
      w.runs[0].message = "Busca concluída pelo novo worker";
    });
    waiting.reject(new Error("Falha atrasada do worker antigo"));
    expect(await processing).toBe(true);
    const workspace = (await database.readWorkspace(id))!;
    expect(workspace.runs[0].status).toBe("completed");
    expect(workspace.runs[0].errors).toEqual([]);
    expect(workspace.notices).toHaveLength(0);
  });

  it("recupera de fato uma tarefa expirada e conserva apenas o resultado do novo worker", async () => {
    const { id, task } = await queuedWorkspace();
    const entered = deferred<void>();
    const waiting = deferred<ReturnType<typeof result>>();
    let first = true;
    vi.spyOn(catalog, "discoverCachedSource").mockImplementation(async () => {
      if (!first) return result();
      first = false;
      entered.resolve();
      return waiting.promise;
    });
    const oldWorker = tasks.processNextDiscoveryTask();
    await entered.promise;
    await database.db
      .update(schema.discoveryTasks)
      .set({ leaseUntil: new Date(0) })
      .where(eq(schema.discoveryTasks.id, task.id));
    await database.mutateWorkspace(id, (w) => {
      w.runs[0].at = new Date(0).toISOString();
    });
    expect(await tasks.processNextDiscoveryTask()).toBe(true);
    waiting.resolve(result([staleJob()]));
    expect(await oldWorker).toBe(true);
    const workspace = (await database.readWorkspace(id))!;
    expect(workspace.jobs).toHaveLength(0);
    expect(workspace.runs[0].status).toBe("completed");
    const [persisted] = await database.db
      .select()
      .from(schema.discoveryTasks)
      .where(eq(schema.discoveryTasks.id, task.id));
    expect(persisted).toMatchObject({
      attempts: 2,
      status: "completed",
      leaseToken: null,
    });
  });

  it("rejeita senhas de exclusão excessivamente longas antes do cálculo", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/account",
      headers: {
        cookie,
        "x-orbita-request": "1",
        origin: "http://127.0.0.1:5173",
      },
      payload: { password: "x".repeat(10000) },
    });
    expect(response.statusCode).toBe(400);
    expect(
      (await app.inject({ url: "/api/auth/me", headers: { cookie } }))
        .statusCode,
    ).toBe(200);
  });

  it.skipIf(!existsSync(resolve("dist/index.html")))(
    "mais de 200 navegações e assets não consomem quota da API e preservam 10 logins por minuto",
    async () => {
      const assets = await readdir(resolve("dist/assets"));
      const asset = assets.find((name) => name.endsWith(".woff2")) || assets[0];
      expect(asset).toBeTruthy();
      const paths = ["/", "/jobs", `/assets/${asset}`];
      for (let index = 0; index < 220; index++) {
        for (const path of paths) {
          const response = await app.inject(path);
          expect(
            response.statusCode,
            `Requisição pública ${index + 1}: ${path}`,
          ).toBe(200);
        }
      }
      expect((await app.inject("/api/health")).statusCode).toBe(200);
      for (let attempt = 0; attempt < 11; attempt++) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-orbita-request": "1", origin: "http://127.0.0.1:5173" },
          payload: {
            email: "isolated@example.test",
            password: "Backend-test-password-123",
          },
        });
        expect(response.statusCode, `Login ${attempt + 1}`).toBe(
          attempt < 10 ? 200 : 429,
        );
      }
      expect((await app.inject("/")).statusCode).toBe(200);
    },
  );

  it.skipIf(!existsSync(resolve("dist/index.html")))(
    "o limite global da API continua em 200 solicitações por minuto",
    async () => {
      for (let index = 0; index < 201; index++) {
        const response = await app.inject({
          url: "/api/health",
          remoteAddress: "198.51.100.42",
        });
        expect(response.statusCode, `Solicitação API ${index + 1}`).toBe(
          index < 200 ? 200 : 429,
        );
      }
      expect(
        (await app.inject({ url: "/", remoteAddress: "198.51.100.42" }))
          .statusCode,
      ).toBe(200);
    },
  );

  it.skipIf(!existsSync(resolve("dist/index.html.br")))(
    "negocia Brotli, gzip e arquivos originais preservando Vary e cache",
    async () => {
      const assets = await readdir(resolve("dist/assets"));
      const asset = assets.find(
        (name) =>
          name.endsWith(".js") &&
          assets.includes(name + ".br") &&
          assets.includes(name + ".gz"),
      );
      expect(asset).toBeTruthy();
      for (const path of ["index.html", `assets/${asset}`]) {
        const original = await readFile(resolve("dist", path));
        for (const encoding of ["br", "gzip", "identity"] as const) {
          const response = await app.inject({
            url: `/${path}`,
            headers: { "accept-encoding": encoding },
          });
          expect(response.statusCode).toBe(200);
          expect(String(response.headers.vary).toLowerCase()).toContain(
            "accept-encoding",
          );
          expect(response.headers["cache-control"]).toBe(
            path.startsWith("assets/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          );
          if (encoding === "identity") {
            expect(response.headers["content-encoding"]).toBeUndefined();
            expect(response.rawPayload.equals(original)).toBe(true);
          } else {
            expect(response.headers["content-encoding"]).toBe(encoding);
            const expanded =
              encoding === "br"
                ? brotliDecompressSync(response.rawPayload)
                : gunzipSync(response.rawPayload);
            expect(expanded.equals(original)).toBe(true);
            expect(response.rawPayload.length).toBeLessThan(original.length);
          }
        }
      }
    },
  );

  it.skipIf(!existsSync(resolve("dist/index.html")))(
    "HTML e rotas SPA revalidam; assets com hash usam cache imutável",
    async () => {
      const assets = await readdir(resolve("dist/assets"));
      expect((await app.inject("/")).headers["cache-control"]).toBe("no-cache");
      expect((await app.inject("/jobs")).headers["cache-control"]).toBe(
        "no-cache",
      );
      const hashed = assets.find((asset) =>
        /^.+-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(asset),
      );
      expect(hashed).toBeTruthy();
      expect(
        (await app.inject(`/assets/${hashed}`)).headers["cache-control"],
      ).toBe("public, max-age=31536000, immutable");
      expect((await app.inject("/api/health")).headers["cache-control"]).toBe(
        "no-store",
      );
    },
  );
});
