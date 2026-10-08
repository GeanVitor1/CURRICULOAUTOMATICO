import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Source } from "../shared/types";
let dir: string,
  dbModule: typeof import("../server/db"),
  catalog: typeof import("../server/source-catalog");
const source = (
  board: string,
  company = "Organização teste",
  type: Source["type"] = "greenhouse",
): Source => ({
  id: board,
  board,
  company,
  type,
  discovery: true,
  application: false,
  enabled: true,
  status: "",
});
const providerBody = {
  jobs: [
    {
      id: 1,
      title: "Auxiliar administrativo",
      absolute_url: "https://example.test/jobs/1",
      content: "Atendimento presencial.",
      location: { name: "Recife" },
    },
  ],
};
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbita-catalog-tests-"));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  dbModule = await import("../server/db");
  catalog = await import("../server/source-catalog");
}, 30000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await dbModule?.closeDb();
  if (dir.startsWith(join(tmpdir(), "orbita-catalog-tests-")))
    await rm(dir, { recursive: true, force: true });
});
describe("Catálogo compartilhado persistente", () => {
  it("consulta uma vez por board e devolve cópias sem misturar preferências", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(providerBody)));
    const first = await catalog.discoverCachedSource(source("shared-board"));
    first.jobs[0].saved = true;
    first.jobs[0].match.score = 100;
    const second = await catalog.discoverCachedSource(
      source("shared-board", "Outro rótulo"),
    );
    expect(second.cached).toBe(true);
    expect(second.jobs[0].saved).toBe(false);
    expect(second.jobs[0].match.score).toBe(0);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(
      (await catalog.inspectSourceCatalog()).find(
        (s) => s.board === "shared-board",
      ),
    ).toMatchObject({ status: "verificada", count: 1 });
  });
  it("coalesce chamadas simultâneas da mesma organização", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify(providerBody)),
      );
    const [a, b] = await Promise.all([
      catalog.discoverCachedSource(source("concurrent-board")),
      catalog.discoverCachedSource(source("concurrent-board")),
    ]);
    expect(a.jobs[0].url).toBe(b.jobs[0].url);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("falha 429 fica persistida e não produz nova consulta nem jobs falsos", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(
      catalog.discoverCachedSource(source("rate-limited")),
    ).rejects.toThrow("429");
    await expect(
      catalog.discoverCachedSource(source("rate-limited")),
    ).rejects.toThrow("429");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(
      (await catalog.inspectSourceCatalog()).find(
        (s) => s.board === "rate-limited",
      ),
    ).toMatchObject({ status: "indisponível", count: 0 });
  });
  it("chave Jobicy é global, evitando sincronizações diferentes por usuário", () => {
    expect(catalog.catalogKey(source("qualquer", "A", "jobicy"))).toBe(
      catalog.catalogKey(source("outro", "B", "jobicy")),
    );
  });
  it("fila persiste queued, evita duplicatas e registra conclusão no mesmo histórico", async () => {
    const { createWorkspace } = await import("../server/workspace");
    const { users, workspaces, discoveryTasks } =
      await import("../server/schema");
    const { enqueueDiscovery, processNextDiscoveryTask } =
      await import("../server/discovery-queue");
    const { eq } = await import("drizzle-orm");
    await dbModule.db
      .insert(users)
      .values({
        id: "queue-user",
        email: "queue@example.test",
        name: "Teste fila",
        password: "disabled",
      });
    const workspace = createWorkspace(
      "Teste fila",
      "queue@example.test",
      false,
    );
    workspace.sources = [source("queued-board")];
    await dbModule.db
      .insert(workspaces)
      .values({ id: "queue-user:live", userId: "queue-user", data: workspace });
    const first = await enqueueDiscovery("queue-user:live");
    expect(first.status).toBe("queued");
    expect((await enqueueDiscovery("queue-user:live")).id).toBe(first.id);
    expect(
      (await dbModule.readWorkspace("queue-user:live"))!.runs[0].status,
    ).toBe("queued");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(providerBody)));
    expect(await processNextDiscoveryTask()).toBe(true);
    const updated = (await dbModule.readWorkspace("queue-user:live"))!;
    expect(updated.runs[0]).toMatchObject({
      id: first.id,
      status: "completed",
      discovered: 1,
    });
    expect(updated.runs).toHaveLength(1);
    expect(updated.jobs).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(1);
    const [task] = await dbModule.db
      .select()
      .from(discoveryTasks)
      .where(eq(discoveryTasks.id, first.id));
    expect(task).toMatchObject({
      status: "completed",
      attempts: 1,
      leaseToken: null,
    });
    expect(await processNextDiscoveryTask()).toBe(false);
  });
  it("vaga fechada não permite preparo e comparação insuficiente não inicia envio", async () => {
    const { createWorkspace } = await import("../server/workspace");
    const { prepare, automaticSend } = await import("../server/operations");
    const { users, workspaces } = await import("../server/schema");
    const { defaultRoutine } = await import("../shared/types");
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(providerBody)));
    const { jobs } = await catalog.discoverCachedSource(source("application-safety"));
    const workspace = createWorkspace("Teste de segurança", "safety@example.test", false);
    workspace.profile.confirmed = true;
    workspace.jobs = jobs;
    workspace.jobs[0].availability = "closed";
    expect(() => prepare(workspace, jobs[0].id)).toThrow("indisponível");
    workspace.jobs[0].availability = "active";
    workspace.sources = [{ ...source("authorized", jobs[0].company, "authorized"), discovery: false, application: true }];
    workspace.routine = { ...defaultRoutine, enabled: true, mode: "automatic", minScore: 0 };
    workspace.resumes = [{ id: "approved", name: "Fixture", text: "Currículo de teste", uploadedAt: new Date().toISOString(), approved: true, skills: [], analysis: "" }];
    const application = prepare(workspace, jobs[0].id);
    application.status = "Aguardando aprovação";
    await dbModule.db.insert(users).values({ id: "safety-user", name: "Teste", email: "safety@example.test", password: "disabled" });
    await dbModule.db.insert(workspaces).values({ id: "safety-user:live", userId: "safety-user", data: workspace });
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "true");
    vi.stubEnv("APPLICATION_WEBHOOK_URL", "https://adapter.example.test/applications");
    vi.stubEnv("APPLICATION_WEBHOOK_TOKEN", "test-only");
    const sender = vi.fn();
    try {
      await expect(automaticSend("safety-user:live", application.id, sender as any)).rejects.toThrow("critérios");
      expect(sender).not.toHaveBeenCalled();
      expect((await dbModule.readWorkspace("safety-user:live"))!.applications[0].status).toBe("Aguardando aprovação");
      await dbModule.mutateWorkspace("safety-user:live", w => { w.jobs[0].availability = "closed"; });
      await expect(automaticSend("safety-user:live", application.id, sender as any)).rejects.toThrow("indisponível");
      expect(sender).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
