import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let directory = "", app: FastifyInstance;
let database: typeof import("../server/db"), schema: typeof import("../server/schema");
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-session-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  database = await import("../server/db");
  schema = await import("../server/schema");
  app = await (await import("../server/app")).buildApp({ serveStatic: false });
}, 120000);
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-session-")))
    await rm(directory, { recursive: true, force: true });
});

async function session(daysLeft: number) {
  const userId = randomUUID(), token = randomUUID();
  const hash = createHash("sha256").update(token).digest("hex");
  await database.db.insert(schema.users).values({ id: userId, email: `${userId}@example.test`, name: "Sessão QA" });
  await database.db.insert(schema.sessions).values({ token: hash, userId, expiresAt: new Date(Date.now() + daysLeft * 86400000) });
  return { hash, cookie: `orbita_session=${token}` };
}
const expiry = async (hash: string) =>
  (await database.db.select().from(schema.sessions).where(eq(schema.sessions.token, hash)))[0].expiresAt.getTime();

it("renova a sessão por 30 dias quando a pessoa volta ao site", async () => {
  const { hash, cookie } = await session(2);
  const response = await app.inject({ url: "/api/auth/me", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  const days = (await expiry(hash) - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(29.9);
  expect(String(response.headers["set-cookie"])).toMatch(/orbita_session=.*Max-Age=2592000/i);
});
it("não regrava a sessão a cada requisição no mesmo dia", async () => {
  const { hash, cookie } = await session(29.99);
  const before = await expiry(hash);
  const response = await app.inject({ url: "/api/auth/me", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  expect(await expiry(hash)).toBe(before);
  expect(response.headers["set-cookie"]).toBeUndefined();
});
it("sessão vencida continua exigindo novo login", async () => {
  const { cookie } = await session(-1);
  expect((await app.inject({ url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(401);
});
