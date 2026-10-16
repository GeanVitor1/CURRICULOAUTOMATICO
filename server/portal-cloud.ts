import { Sandbox } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { store, mutateWorkspace } from "./db";

import { cloudPortalEnabled, portalSandboxName } from "./portal-cloud-policy";
import type { CandidatePortal } from "./portal-browser-policy";
import type { LoginAction } from "./portal-sessions";
import type { PortalApplication, PortalResult } from "./portal-application";
import type { Workspace } from "../shared/types";
import { RequestError } from "./errors";

type Metadata = NonNullable<
  Workspace["infrastructure"]["portalConnections"]
>[string];
const root = "/vercel/sandbox/portal-runtime";
const probe = `const fs=require('node:fs');(async()=>{try{const k=fs.readFileSync('${root}/controller.key','utf8');const r=await fetch('http://127.0.0.1:3000/health',{headers:{Authorization:'Bearer '+k},signal:AbortSignal.timeout(1000)});process.exit(r.ok?((await r.json()).version===7?0:2):1)}catch{process.exit(1)}})()`;
const clientSource = `import {readFile,writeFile,rm} from 'node:fs/promises';
import{createDecipheriv,createCipheriv,randomBytes}from'node:crypto';
const id=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid request');
const root='${root}';const path=root+'/requests/'+id;
const token=await readFile(root+'/controller.key','utf8');
const key=Buffer.from(process.env.PORTAL_REQUEST_KEY,'base64');delete process.env.PORTAL_REQUEST_KEY;
const encrypted=await readFile(path+'.request');const d=createDecipheriv('aes-256-gcm',key,encrypted.subarray(0,12));d.setAuthTag(encrypted.subarray(12,28));const body=Buffer.concat([d.update(encrypted.subarray(28)),d.final()]);
await rm(path+'.request',{force:true});
try{const r=await fetch('http://127.0.0.1:3000/command',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(125000)});if(!r.ok)throw Error('Command failed');const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(Buffer.from(await r.arrayBuffer())),c.final()]);await writeFile(path+'.response',Buffer.concat([iv,c.getAuthTag(),data]),{mode:0o600});}
finally{await rm(path+'.request',{force:true});}
`;

export async function cloudConnectionMetadata(
  userId: string,
  portal: CandidatePortal,
) {
  return (await store.portalMetadata(userId, portal)) as Metadata | null;
}
async function cacheMetadata(
  userId: string,
  portal: CandidatePortal,
  connection: Metadata | null,
) {
  await mutateWorkspace(`${userId}:live`, (w) => {
    w.infrastructure.portalConnections ||= {};
    if (connection) w.infrastructure.portalConnections[portal] = connection;
    else delete w.infrastructure.portalConnections[portal];
  });
}
async function runtime(
  userId: string,
  portal: CandidatePortal,
  upgrade = false,
) {
  const provision = async (sandbox: Sandbox) => {
    await sandbox.mkDir(root + "/requests").catch((error) => {
      if (!(error instanceof Error) || !/file exists/i.test(error.message))
        throw error;
    });
    await sandbox.writeFiles([
      {
        path: root + "/runner.mjs",
        content: await readFile(
          resolve(process.cwd(), "dist-server/portal-cloud-runner.mjs"),
        ),
        mode: 0o600,
      },
      {
        path: root + "/client.mjs",
        content: Buffer.from(clientSource),
        mode: 0o600,
      },
    ]);
  };
  const get = () =>
    Sandbox.getOrCreate({
      name: portalSandboxName(userId, portal),
      source: {
        type: "snapshot",
        snapshotId: process.env.PORTAL_CLOUD_SNAPSHOT_ID!,
      },
      resources: { vcpus: 1 },
      ports: [3001],
      timeout: 15 * 60000,
      keepLastSnapshots: { count: 1, expiration: 0 },
      onCreate: provision,
      onResume: provision,
    });
  let s = await get();
  let healthy = await s.runCommand({ cmd: "node", args: ["-e", probe] });
  if (healthy.exitCode === 2 && upgrade) {
    await s.stop();
    s = await get();
    healthy = await s.runCommand({ cmd: "node", args: ["-e", probe] });
  }
  if (healthy.exitCode !== 0 && healthy.exitCode !== 2) {
    await provision(s);
    await s.runCommand({
      cmd: "node",
      args: [root + "/runner.mjs", portal],
      cwd: root,
      detached: true,
    });
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 150));
      healthy = await s.runCommand({ cmd: "node", args: ["-e", probe] });
      if (healthy.exitCode === 0) break;
    }
  }
  if (healthy.exitCode !== 0 && healthy.exitCode !== 2) {
    await s.stop();
    throw new RequestError(
      "O navegador na nuvem não iniciou. Tente abrir a conexão novamente.",
    );
  }
  return s;
}

export async function cloudPortalCommand<T = unknown>(
  userId: string,
  portal: CandidatePortal,
  request: {
    op: string;
    action?: LoginAction;
    resumeId?: string | null;
    input?: PortalApplication;
    viewerId?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    viewerOrigin?: string;
  },
) {
  if (!cloudPortalEnabled(userId, portal))
    throw new RequestError(
      "A conexão de envio deste portal não está disponível para esta conta.",
    );
  if (request.op === "close") {
    try {
      const existing = await Sandbox.get({
        name: portalSandboxName(userId, portal),
      });
      if (existing.status !== "running") return { ok: true } as T;
    } catch (error) {
      if (error instanceof Error && /not.found|404/i.test(error.message))
        return { ok: true } as T;
      throw error;
    }
  }
  const s = await runtime(userId, portal, request.op === "open");
  if (request.op === "open" && request.viewerOrigin) {
    try {
      s.domain(3001);
    } catch {
      await s.update({ ports: [3001] });
    }
  }
  const id = randomUUID(),
    path = root + "/requests/" + id;
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(request)),
    cipher.final(),
  ]);
  let stop = false;
  try {
    await s.writeFiles([
      {
        path: path + ".request",
        content: Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
        mode: 0o600,
      },
    ]);
    const command = await s.runCommand({
      cmd: "node",
      args: [root + "/client.mjs", id],
      detached: true,
      env: { PORTAL_REQUEST_KEY: key.toString("base64") },
    });
    const result = await command.wait({
      signal: AbortSignal.timeout(request.op === "apply" ? 135000 : 44000),
    });
    if (result.exitCode !== 0) throw new Error("PORTAL_COMMAND_FAILED");
    const bytes = await s.readFileToBuffer({ path: path + ".response" });
    if (!bytes || bytes.length > 10 * 1024 * 1024)
      throw new Error("PORTAL_RESPONSE_INVALID");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const response = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
    if (response.connection !== undefined)
      await cacheMetadata(userId, portal, response.connection);
    stop =
      response.canStop !== false &&
      ["confirm", "close", "disconnect", "apply"].includes(request.op);
    if (response.error) throw new RequestError(response.error);
    if (request.op === "open" && response.data?.live) {
      const url = new URL("/live", s.domain(3001));
      url.protocol = "wss:";
      response.data.live.url = url.href;
    }
    return response.data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "A conexão com o navegador foi interrompida. Confira o portal antes de repetir uma candidatura.",
    );
  } finally {
    await s
      .runCommand({
        cmd: "node",
        args: [
          "--input-type=module",
          "-e",
          "import{rm}from'node:fs/promises';for(const p of process.argv.slice(1))await rm(p,{force:true});",
          path + ".request",
          path + ".response",
        ],
      })
      .catch(() => {});
    if (stop) await s.stop();
  }
}
export async function sendCloudApplication(
  userId: string,
  portal: CandidatePortal,
  resumeId: string,
  input: PortalApplication,
): Promise<PortalResult> {
  return cloudPortalCommand<PortalResult>(userId, portal, {
    op: "apply",
    resumeId,
    input,
  });
}
export async function disconnectCloudPortal(
  userId: string,
  portal: CandidatePortal,
) {
  try {
    const s = await Sandbox.get({ name: portalSandboxName(userId, portal) });
    await s.delete({ deleteOrphanSnapshots: true });
  } catch (error) {
    if (!(error instanceof Error) || !/not.found|404/i.test(error.message))
      throw error;
  }
  await cacheMetadata(userId, portal, null);
}
