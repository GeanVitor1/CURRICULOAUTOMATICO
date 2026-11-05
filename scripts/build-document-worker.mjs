import { build } from "esbuild";
await build({entryPoints:["server/document-parser-worker.ts"],outfile:"dist-server/document-parser-worker.mjs",bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent"});
