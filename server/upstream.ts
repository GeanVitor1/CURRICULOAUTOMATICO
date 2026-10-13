import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";

export function upstreamOrigin(value: string) {
  const url = new URL(value);
  const local =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (!local && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("Invalid API upstream");
  return url;
}
export async function proxyApi(
  request: IncomingMessage,
  response: ServerResponse,
  target: URL,
  secret: string,
) {
  if (!request.url || !/^\/api(?:\/|\?|$)/.test(request.url) || !secret) {
    response.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(
      JSON.stringify({ error: "O serviço está temporariamente indisponível." }),
    );
    return;
  }
  const headers = { ...request.headers };
  for (const name of [
    "host",
    "connection",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
    "proxy-connection",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-for",
    "x-empregatos-client-ip",
    "x-empregatos-proxy-secret",
  ])
    delete headers[name];
  headers["x-empregatos-proxy-secret"] = secret;
  const platformIp =
    process.env.VERCEL === "1"
      ? request.headers["x-vercel-forwarded-for"]
      : request.socket.remoteAddress;
  const clientIp =
    typeof platformIp === "string" ? platformIp.split(",")[0].trim() : "";
  if (isIP(clientIp)) headers["x-empregatos-client-ip"] = clientIp;
  await new Promise<void>((resolve) => {
    const outgoing = (
      target.protocol === "https:" ? httpsRequest : httpRequest
    )(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: request.url,
        method: request.method,
        headers,
        timeout: 50000,
      },
      (incoming) => {
        // Pass through Set-Cookie arrays and OAuth Location exactly; never follow redirects.
        const responseHeaders = { ...incoming.headers };
        for (const name of [
          "connection",
          "transfer-encoding",
          "keep-alive",
          "upgrade",
        ])
          delete responseHeaders[name];
        response.writeHead(incoming.statusCode || 502, responseHeaders);
        incoming.pipe(response);
        incoming.on("end", resolve);
        incoming.on("error", () => {
          response.destroy();
          resolve();
        });
      },
    );
    outgoing.on("timeout", () =>
      outgoing.destroy(new Error("Upstream timeout")),
    );
    outgoing.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        response.end(
          JSON.stringify({
            error:
              "O serviço está temporariamente indisponível. Tente novamente em instantes.",
          }),
        );
      } else response.destroy();
      resolve();
    });
    request.on("aborted", () => outgoing.destroy());
    response.on("close", () => {
      outgoing.destroy();
      resolve();
    });
    request.pipe(outgoing);
  });
}
