// Confere um snapshot de conexões: sobe uma Sandbox a partir dele, instala o
// Node seguro como a produção faz, inicia o executor real e checa /health.
// Uso: node --env-file=.env.sandbox.local --import tsx scripts/verify-portal-snapshot.ts <snapshotId>
import { Sandbox } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";
import { ensureSandboxNode } from "../server/sandbox-node";
import { PORTAL_RUNTIME_VERSION } from "../shared/portal-runtime-version";

const snapshotId = process.argv[2];
if (!snapshotId?.startsWith("snap_")) throw new Error("Informe o snapshotId.");
const root = "/vercel/sandbox/portal-runtime";
const sandbox = await Sandbox.create({
  source: { type: "snapshot", snapshotId },
  resources: { vcpus: 1 },
  timeout: 10 * 60000,
});
try {
  const node = await ensureSandboxNode(sandbox);
  console.log("node:", (await (await sandbox.runCommand({ cmd: node, args: ["--version"] })).stdout()).trim());
  await sandbox.writeFiles([
    { path: root + "/runner.mjs", content: await readFile("dist-server/portal-cloud-runner.mjs") },
  ]);
  await sandbox.runCommand({ cmd: node, args: [root + "/runner.mjs", "gupy"], cwd: root, detached: true });
  const probe = `const fs=require('node:fs');(async()=>{for(let i=0;i<40;i++){try{const k=fs.readFileSync('${root}/controller.key','utf8');const r=await fetch('http://127.0.0.1:3000/health',{headers:{Authorization:'Bearer '+k},signal:AbortSignal.timeout(1000)});if(r.ok){const j=await r.json();console.log(JSON.stringify(j));process.exit(j.version===${PORTAL_RUNTIME_VERSION}?0:2)}}catch{}await new Promise(r=>setTimeout(r,500))}process.exit(1)})()`;
  const health = await sandbox.runCommand({ cmd: node, args: ["-e", probe] });
  console.log("health:", (await health.stdout()).trim() || "(sem resposta)", "exit", health.exitCode);
  if (health.exitCode !== 0) {
    const log = await sandbox.runCommand({ cmd: "bash", args: ["-lc", `ls ${root}; tail -c 1500 ${root}/*.log 2>/dev/null`] });
    console.log((await log.stdout()).slice(-1500));
    process.exitCode = 1;
  }
} finally {
  await sandbox.stop().catch(() => {});
}
