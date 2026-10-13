import { build } from "esbuild";
await build({
  entryPoints: [
    "server/index.ts",
    "server/worker.ts",
    "server/vercel.ts",
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
