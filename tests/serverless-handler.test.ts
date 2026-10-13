import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createServer } from "node:http";
import { once } from "node:events";
import { createServerlessHandler } from "../server/serverless-handler";

let app: FastifyInstance | undefined;
let server: ReturnType<typeof createServer> | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  await app?.close();
  server = undefined;
  app = undefined;
  vi.restoreAllMocks();
});
async function start(build: () => Promise<FastifyInstance>) {
  const handler = createServerlessHandler(build);
  server = createServer((request, response) => void handler(request, response));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server unavailable");
  return `http://127.0.0.1:${address.port}`;
}
describe("API da Vercel", () => {
  it("mantém caminhos, query, JSON e cookies em requisições simultâneas com uma inicialização", async () => {
    const build = vi.fn(async () => {
      app = Fastify();
      app.post("/api/auth/example", async (request, reply) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        reply.header("Set-Cookie", [
          "orbita_session=fixture; HttpOnly; Secure; SameSite=Lax",
          "orbita_google_state=fixture; HttpOnly; Secure; SameSite=Lax",
        ]);
        return { body: request.body, query: request.query };
      });
      return app;
    });
    const origin = await start(build);
    const responses = await Promise.all(
      [1, 2].map((n) =>
        fetch(`${origin}/api/auth/example?attempt=${n}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ n }),
        }),
      ),
    );
    expect(build).toHaveBeenCalledOnce();
    for (let i = 0; i < responses.length; i++) {
      expect(responses[i].status).toBe(200);
      expect(responses[i].headers.getSetCookie()).toHaveLength(2);
      expect(await responses[i].json()).toEqual({
        body: { n: i + 1 },
        query: { attempt: String(i + 1) },
      });
    }
  });
  it("retorna indisponibilidade sem revelar credenciais e tenta inicializar no próximo acesso", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const build = vi
      .fn()
      .mockRejectedValueOnce(new Error("postgres://private-password@host"))
      .mockImplementationOnce(async () => {
        app = Fastify();
        app.get("/api/health", async () => ({ status: "ok" }));
        return app;
      });
    const origin = await start(build);
    const failed = await fetch(`${origin}/api/health`);
    expect(failed.status).toBe(503);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    expect(await failed.text()).not.toContain("private-password");
    expect((await fetch(`${origin}/api/health`)).status).toBe(200);
    expect(build).toHaveBeenCalledTimes(2);
  });
  it("registra o código de configuração sem expor a mensagem ou os segredos", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const build = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("private-connection-string"), {
          code: "DATABASE_URL_MISSING",
        }),
      );
    const origin = await start(build);
    const failed = await fetch(`${origin}/api/health`);
    expect(failed.status).toBe(503);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "api_initialization_failed",
        reason: "DATABASE_URL_MISSING",
      }),
    );
    expect(await failed.text()).not.toMatch(
      /private-connection-string|DATABASE_URL_MISSING/,
    );
  });
});
