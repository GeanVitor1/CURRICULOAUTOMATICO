import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createWorkspace } from "../server/workspace";
let directory = "",
  database: typeof import("../server/db"),
  schema: typeof import("../server/schema"),
  scheduler: typeof import("../server/queue");
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-scheduler-"));
  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = directory;
  delete process.env.REDIS_URL;
  delete process.env.DATABASE_URL;
  database = await import("../server/db");
  schema = await import("../server/schema");
  scheduler = await import("../server/queue");
}, 30000);
afterAll(async () => {
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-scheduler-")))
    await rm(directory, { recursive: true, force: true });
});
async function account(enabled: boolean, due: boolean, withSource = true) {
  const userId = randomUUID(),
    id = `${userId}:live`,
    w = createWorkspace("Scheduler", `${userId}@example.test`);
  w.routine.enabled = enabled;
  w.routine.nextRun = new Date(
    Date.now() + (due ? -60000 : 86400000),
  ).toISOString();
  if (withSource)
    w.sources.push({
      id: "public",
      type: "greenhouse",
      board: "fixture",
      company: "Fixture",
      enabled: true,
      discovery: true,
      application: false,
      status: "",
    });
  await database.db
    .insert(schema.users)
    .values({ id: userId, name: "Scheduler", email: `${userId}@example.test` });
  await database.db.insert(schema.workspaces).values({ id, userId, data: w });
  return id;
}
describe("Agendamento permanente", () => {
  it("coloca apenas rotinas ativas vencidas na fila e não duplica ao reiniciar", async () => {
    const due = await account(true, true),
      future = await account(true, false),
      paused = await account(false, true);
    await scheduler.enqueueDueRoutines();
    await scheduler.enqueueDueRoutines();
    const tasks = await database.db.select().from(schema.discoveryTasks);
    expect(tasks.filter((t) => t.workspaceId === due)).toHaveLength(1);
    expect(tasks.some((t) => [future, paused].includes(t.workspaceId))).toBe(
      false,
    );
  });
  it("falha de configuração fica registrada e não impede outras rotinas", async () => {
    const invalid = await account(true, true, false),
      valid = await account(true, true);
    await scheduler.enqueueDueRoutines();
    const state = (await database.readWorkspace(invalid))!;
    expect(state.notices[0].title).toContain("atenção");
    expect(Date.parse(state.routine.nextRun!)).toBeGreaterThan(Date.now());
    expect(
      (
        await database.db
          .select()
          .from(schema.discoveryTasks)
          .where(eq(schema.discoveryTasks.workspaceId, valid))
      ).length,
    ).toBe(1);
  });
});
