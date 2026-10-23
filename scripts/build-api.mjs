import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
const sources=[];
async function collect(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory())await collect(path);
    else if(/\.(?:ts|tsx|mjs|json|sql|css)$/.test(entry.name))sources.push(path);
  }
}
for(const directory of ["server","shared","src","scripts","api","migrations"])await collect(directory);
sources.push("package.json","package-lock.json","vercel.json","firestore.indexes.json");
const sourceHash=createHash("sha256");
for(const path of sources.map(path=>path.split(sep).join("/")).sort())sourceHash.update(path+"\0").update(await readFile(path)).update("\0");
const revision=sourceHash.digest("hex");
await mkdir(".data",{recursive:true});
await writeFile(".data/automation-source-revision.json",JSON.stringify({revision}));
await build({
  entryPoints: ["server/ats-browser-runner.ts"],
  outfile: "dist-server/ats-browser-runner.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["playwright"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
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
    "server/vercel-resolution-worker.ts",
    "server/app.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  external: ["./app.js"],
  outdir: "dist-server",
  define:{"process.env.EMPREGATOS_REVISION":JSON.stringify(revision)},
  logLevel: "info",
});
