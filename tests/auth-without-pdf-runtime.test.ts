import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

const pdfLoader = vi.hoisted(() =>
  vi.fn(() => {
    throw new ReferenceError("PDF native runtime unavailable");
  }),
);
vi.mock("pdf-parse", pdfLoader);
const staticLoader = vi.hoisted(() =>
  vi.fn(() => {
    throw Object.assign(new Error("Static frontend dependency unavailable"), {
      code: "ERR_REQUIRE_ESM",
    });
  }),
);
vi.mock("@fastify/static", staticLoader);
let directory = "";
let app: FastifyInstance | undefined;
let database: typeof import("../server/db") | undefined;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-auth-without-pdf-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("API_PROXY_SECRET", "");
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:5173");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-private-secret");
  vi.stubEnv(
    "GOOGLE_REDIRECT_URI",
    "http://127.0.0.1:5173/api/auth/google/callback",
  );
  database = await import("../server/db");
  app = await (await import("../server/app")).buildApp({ serveStatic: false });
}, 30000);

afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  vi.unstubAllEnvs();
  if (directory.startsWith(join(tmpdir(), "empregatos-auth-without-pdf-")))
    await rm(directory, { recursive: true, force: true });
});

it("mantém saúde e início do login Google disponíveis sem carregar dependências de frontend ou PDF", async () => {
  expect((await app!.inject("/api/health")).statusCode).toBe(200);
  expect((await app!.inject("/api/auth/providers")).json().google).toBe(true);
  const start = await app!.inject({
    url: "/api/auth/google/start",
    headers: { host: "127.0.0.1:5173" },
  });
  expect(start.statusCode).toBe(302);
  expect(new URL(start.headers.location!).origin).toBe(
    "https://accounts.google.com",
  );
  expect(pdfLoader).not.toHaveBeenCalled();
  expect(staticLoader).not.toHaveBeenCalled();
});
