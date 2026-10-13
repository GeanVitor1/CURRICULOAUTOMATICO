import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

export function createServerlessHandler(build: () => Promise<FastifyInstance>) {
  let ready: Promise<FastifyInstance> | undefined;
  return async (request: IncomingMessage, response: ServerResponse) => {
    let app: FastifyInstance;
    try {
      ready ??= build().then(async (app) => {
        await app.ready();
        return app;
      });
      app = await ready;
    } catch {
      ready = undefined;
      console.error(JSON.stringify({ event: "api_initialization_failed" }));
      response.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          error:
            "O serviço está temporariamente indisponível. Tente novamente em instantes.",
        }),
      );
      return;
    }
    // Keep the invocation alive until Fastify finishes writing cookies/body.
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        response.off("finish", done);
        response.off("close", done);
        response.off("error", fail);
      };
      response.once("finish", done);
      response.once("close", done);
      response.once("error", fail);
      try {
        app.server.emit("request", request, response);
      } catch (error) {
        fail(error as Error);
      }
    });
  };
}
