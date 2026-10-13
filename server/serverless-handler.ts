import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

const startupReasons = new Set([
  "DATABASE_URL_MISSING",
  "APP_ORIGIN_MISSING",
  "APP_ORIGIN_INVALID",
  "ENCRYPTION_KEY_INVALID",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT",
  "28P01",
  "3D000",
  "ENOENT",
  "ERR_MODULE_NOT_FOUND",
  "MODULE_NOT_FOUND",
  "ERR_INVALID_URL",
]);

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
    } catch (error) {
      ready = undefined;
      const code = (error as { code?: unknown } | null)?.code;
      const name = (error as { name?: unknown } | null)?.name;
      const nativeReason =
        name === "ReferenceError"
          ? "REFERENCE_ERROR"
          : name === "SyntaxError"
            ? "SYNTAX_ERROR"
            : name === "TypeError"
              ? "TYPE_ERROR"
              : "UNEXPECTED_INITIALIZATION_FAILURE";
      console.error(
        JSON.stringify({
          event: "api_initialization_failed",
          reason:
            typeof code === "string" && startupReasons.has(code)
              ? code
              : nativeReason,
        }),
      );
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
