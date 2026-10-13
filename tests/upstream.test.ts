import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { proxyApi, upstreamOrigin } from "../server/upstream";
import { proxyAuthorized } from "../server/auth-config";

const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.unstubAllEnvs();
});
describe("API permanente atrás da Vercel", () => {
  it("preserva corpo binário, query, cookies, identidade e retorno OAuth", async () => {
    vi.stubEnv("NODE_ENV", "test");
    let received: any;
    const backend = await listen(
      createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        received = {
          url: req.url,
          method: req.method,
          cookie: req.headers.cookie,
          secret: req.headers["x-empregatos-proxy-secret"],
          spoofed: req.headers["x-forwarded-for"],
          ip: req.headers["x-empregatos-client-ip"],
          body: Buffer.concat(chunks),
        };
        res.writeHead(302, {
          "Set-Cookie": [
            "session=one; HttpOnly; Secure",
            "challenge=two; HttpOnly; Secure",
          ],
          Location: "https://accounts.google.com/example",
        });
        res.end();
      }),
    );
    const proxy = await listen(
      createServer(
        (req, res) =>
          void proxyApi(req, res, upstreamOrigin(backend), "private-proxy-key"),
      ),
    );
    const bytes = Buffer.from([0, 1, 2, 255, 128]);
    const result = await fetch(`${proxy}/api/example?nonce=one`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: "private=session",
        "x-forwarded-for": "attacker",
        "x-empregatos-proxy-secret": "attacker",
        "x-empregatos-client-ip": "1.2.3.4",
      },
      body: bytes,
    });
    expect(result.status).toBe(302);
    expect(result.headers.getSetCookie()).toHaveLength(2);
    expect(result.headers.get("location")).toBe(
      "https://accounts.google.com/example",
    );
    expect(received).toMatchObject({
      url: "/api/example?nonce=one",
      method: "POST",
      cookie: "private=session",
      secret: "private-proxy-key",
      spoofed: undefined,
      ip: "127.0.0.1",
    });
    expect(received.body).toEqual(bytes);
  });
  it("recusa destino inseguro ou com credenciais e segredo ausente", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const value of [
      "http://backend.example",
      "https://user:secret@backend.example",
      "https://backend.example/path",
      "https://localhost",
      "https://backend.example?token=secret",
    ])
      expect(() => upstreamOrigin(value)).toThrow();
    expect(proxyAuthorized("wrong", "correct")).toBe(false);
    expect(proxyAuthorized("correct", "correct")).toBe(true);
    const proxy = await listen(
      createServer(
        (req, res) =>
          void proxyApi(
            req,
            res,
            upstreamOrigin("https://backend.example"),
            "",
          ),
      ),
    );
    expect((await fetch(`${proxy}/api/health`)).status).toBe(503);
  });
  it("retorna falha genérica quando o backend está indisponível", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const temporary = createServer();
    const origin = await listen(temporary);
    await new Promise<void>((resolve) => temporary.close(() => resolve()));
    servers.splice(servers.indexOf(temporary), 1);
    const proxy = await listen(
      createServer(
        (req, res) =>
          void proxyApi(req, res, upstreamOrigin(origin), "private-secret"),
      ),
    );
    const result = await fetch(`${proxy}/api/health`);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private-secret");
  });
});
