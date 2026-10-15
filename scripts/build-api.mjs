import { build } from "esbuild";
await build({
  entryPoints: ["server/portal-cloud-runner.ts"],
  outfile: "dist-server/portal-cloud-runner.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["playwright", "bufferutil", "utf-8-validate"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
await build({
  entryPoints: [
    "server/index.ts",
    "server/worker.ts",
    "server/vercel.ts",
    "server/vercel-worker.ts",
    "server/vercel-cron.ts",
    "server/vercel-submission-worker.ts",
    "server/app.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  external: ["./app.js"],
  outdir: "dist-server",
  logLevel: "info",
});
