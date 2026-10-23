import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { PortalBrowserService } from "./portal-browser-service";
import type { CandidatePortal } from "./portal-browser-policy";
import { PortalLiveServer } from "./portal-live-server";
const root = "/vercel/sandbox/portal-runtime";
const portal = process.argv[2];
if (!["gupy", "infojobs", "glassdoor"].includes(portal))
  throw new Error("Portal unavailable");
let token: string;
try {
  token = await readFile(root + "/controller.key", "utf8");
} catch {
  token = randomBytes(32).toString("hex");
  await writeFile(root + "/controller.key", token, { mode: 0o600 });
}
const service = new PortalBrowserService(
  portal as CandidatePortal,
  root + "/private",
);
const live = new PortalLiveServer(service);
live.server.listen(3001, "0.0.0.0");
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const auth = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from("Bearer " + token);
  if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
    res.writeHead(403);
    res.end("{}");
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.end('{"ok":true,"version":10}');
    return;
  }
  if (req.method !== "POST" || req.url !== "/command") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  let body = Buffer.alloc(0);
  try {
    for await (const chunk of req) {
      body = Buffer.concat([body, chunk]);
      if (body.length > 10 * 1024 * 1024) throw new Error("Request too large");
    }
    const request = JSON.parse(body.toString());
    let data, error;
    try {
      data = await service.execute(request);
      if (["open", "import-browser-session"].includes(request.op) && request.viewerOrigin) {
        const frame = data as { viewerId: string; live?: unknown };
        frame.live = live.issue(frame.viewerId, request.viewerOrigin);
      }
      if (["confirm", "close", "disconnect"].includes(request.op))
        live.revoke();
    } catch (e) {
      error =
        e instanceof Error &&
        /^(A janela|Esta janela|O formulário|O login|O portal já|Operação|Candidatura inválida)/.test(
          e.message,
        )
          ? e.message
          : "Não foi possível concluir a ação no portal. Confira a conexão ou uma verificação solicitada pelo site.";
    }
    res.end(
      JSON.stringify({
        data,
        error,
        connection: await service.metadata(),
        canStop: !service.isBusy() && !error,
      }),
    );
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Solicitação inválida." }));
  }
});
server.listen(3000, "127.0.0.1");
