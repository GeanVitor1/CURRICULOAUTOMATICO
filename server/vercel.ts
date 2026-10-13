import { createServerlessHandler } from "./serverless-handler";
import { proxyApi, upstreamOrigin } from "./upstream";
import type { IncomingMessage, ServerResponse } from "node:http";

// Vercel serves the Vite build through its CDN. No background scheduler starts here.
const localHandler = createServerlessHandler(async () => {
  // Load database/configuration inside the handler so startup failures are caught.
  const { buildApp } = await import("./app.js");
  return buildApp({ serveStatic: false });
});
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!process.env.API_UPSTREAM_ORIGIN) return localHandler(request, response);
  try {
    return await proxyApi(
      request,
      response,
      upstreamOrigin(process.env.API_UPSTREAM_ORIGIN),
      process.env.API_PROXY_SECRET || "",
    );
  } catch {
    response.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(
      JSON.stringify({ error: "O serviço está temporariamente indisponível." }),
    );
  }
}
