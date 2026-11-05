import { readFileSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const minimums = JSON.parse(readFileSync(new URL("../shared/node-runtime-policy.json", import.meta.url)));
function secure(version) {
  const p = version.trim().replace(/^v/,"").split(".").map(Number), m = minimums[p[0]];
  return !!m && p.length === 3 && p.every(Number.isInteger) && (p[1]>m[1] || p[1]===m[1]&&p[2]>=m[2]);
}
let executable = process.execPath;
if (!secure(process.versions.node)) {
  const candidates = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA,"EmpreGatos","runtime","node-v24.22.2-win-x64","node.exe"),
    process.env.HOME && join(process.env.HOME,".local","share","empregatos","runtime","node-v24.22.2-linux-x64","bin","node"),
    process.env.HOME && join(process.env.HOME,".local","share","empregatos","runtime","node-v22.23.4-linux-x64","bin","node"),
  ].filter(Boolean);
  const candidate = candidates.find(c => existsSync(c) && secure(spawnSync(c,["--version"],{encoding:"utf8",windowsHide:true}).stdout || ""));
  if (!candidate)
    throw Error("Node sem as correções de segurança. Atualize para 22.23.4+ ou 24.22.1+.");
  executable = candidate;
}
const [program,...args] = process.argv.slice(2);
const binaries = {
  tsx: () => require.resolve("tsx/cli"),
  vite: () => join(dirname(require.resolve("vite/package.json")),"bin/vite.js"),
  vitest: () => join(dirname(require.resolve("vitest/package.json")),"vitest.mjs"),
  tsc: () => require.resolve("typescript/bin/tsc"),
  playwright: () => join(dirname(require.resolve("@playwright/test/package.json")),"cli.js"),
};
if (!program) throw Error("Informe o comando do projeto.");
const child = spawn(executable,[binaries[program]?.() || program,...args],{
  stdio:"inherit",windowsHide:true,
  env:{...process.env,PATH:dirname(executable)+delimiter+process.env.PATH},
});
child.on("error",()=>{console.error("O comando do projeto não iniciou.");process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code ?? 1;});
process.on("SIGINT",()=>child.kill("SIGINT"));process.on("SIGTERM",()=>child.kill("SIGTERM"));
