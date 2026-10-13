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
  "ERR_REQUIRE_ASYNC_MODULE",
  "ERR_REQUIRE_ESM",
  "ERR_UNKNOWN_FILE_EXTENSION",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_UNSUPPORTED_DIR_IMPORT",
  "ERR_DLOPEN_FAILED",
]);

function initializationReason(error: unknown): string {
  let current = error;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === "object";
    depth++
  ) {
    const { code, cause, name } = current as {
      code?: unknown;
      cause?: unknown;
      name?: unknown;
    };
    if (
      typeof code === "string" &&
      (startupReasons.has(code) ||
        /^[0-9A-Z]{5}$/.test(code) ||
        /^FST_ERR_[A-Z_]{1,70}$/.test(code))
    )
      return code;
    if (name === "ReferenceError") return "REFERENCE_ERROR";
    if (name === "SyntaxError") return "SYNTAX_ERROR";
    if (name === "TypeError") return "TYPE_ERROR";
    current = cause;
  }
  return "UNEXPECTED_INITIALIZATION_FAILURE";
}

function startupLocations(error: unknown): string[] {
  const stack = (error as { stack?: unknown } | null)?.stack;
  if (typeof stack !== "string") return [];
  // Only fixed runtime file locations, never the error message or SQL values.
  return (
    stack
      .split("\n")
      .slice(1)
      .join("\n")
      .match(
        /(?:file:\/\/)?\/var\/task\/[A-Za-z0-9_./@-]+:\d+:\d+|node:[A-Za-z0-9_./@-]+:\d+:\d+/g,
      ) || []
  ).slice(0, 5);
}

function startupModules(error: unknown): string[] {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return [];
  return [
    ...new Set(
      message.match(
        /\/var\/task\/(?:node_modules|dist-server|api)\/[A-Za-z0-9_./@-]+\.(?:mjs|cjs|js|json)/g,
      ) || [],
    ),
  ].slice(0, 5);
}

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
      const reason = initializationReason(error);
      console.error(
        JSON.stringify({
          event: "api_initialization_failed",
          reason,
          ...(reason === "UNEXPECTED_INITIALIZATION_FAILURE" ||
          reason.startsWith("ERR_REQUIRE_")
            ? {
                locations: startupLocations(error),
                modules: startupModules(error),
              }
            : {}),
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
