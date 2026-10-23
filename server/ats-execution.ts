import { Sandbox } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { destinationBrowserAllowed } from "./ats-registry";
import { executeAtsApplication, type AtsApplication } from "./ats-application";
import type { ExecutionResult } from "./application-verification";
import { atsHostResolverRules, guardAtsPage,atsExecutionHosts } from "./ats-network";
import { publicUrl } from "./public-web";
import {WP_JOBS_EVIDENCE} from './company-board';
import {sendCompanyForm} from './company-form';

export async function sendAtsApplication(
  input: AtsApplication,
): Promise<ExecutionResult> {
  if (
    !destinationBrowserAllowed(input.destination) ||
    input.destination.state !== "verified" ||
    Date.parse(input.destination.expiresAt) <= Date.now()
  )
    return {
      status: "action_required",
      message:
        "O destino precisa de verificação atual e autorização de automação.",
    };
  publicUrl(input.destination.url);
  if(input.destination.platform==='company'&&input.destination.evidence.includes(WP_JOBS_EVIDENCE))return sendCompanyForm(input);
  if (process.env.ATS_EXECUTION_LOCAL === "true" && !process.env.VERCEL) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        `--host-resolver-rules=${await atsHostResolverRules(input.destination.url)}`,
      ],
    });
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      await guardAtsPage(context, input.destination.url);
      return await executeAtsApplication(await context.newPage(), input);
    } finally {
      await browser.close();
    }
  }
  if (!process.env.PORTAL_CLOUD_SNAPSHOT_ID)
    return {
      status: "action_required",
      message: "A imagem do navegador na nuvem não está configurada.",
    };
  const host = new URL(input.destination.url).hostname;
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
  try {
  sandbox = await Sandbox.create({
    source: {
      type: "snapshot",
      snapshotId: process.env.PORTAL_CLOUD_SNAPSHOT_ID,
    },
    persistent: false,
    resources: { vcpus: 1 },
    timeout: 120000,
    networkPolicy: {
      allow: Object.fromEntries(atsExecutionHosts(input.destination.url).map(host=>[host,[]])),
      subnets: {
        deny: [
          "10.0.0.0/8",
          "127.0.0.0/8",
          "169.254.0.0/16",
          "172.16.0.0/12",
          "192.168.0.0/16",
        ],
      },
    },
  });
  } catch (error) {
    const status = (error as {response?:{status?:number}})?.response?.status;
    return {status:"action_required",retryable:true,message:`O navegador não iniciou${status ? ` (infraestrutura HTTP ${status})` : ""}. Nenhum formulário recebeu esta candidatura. Revise a configuração antes de retomar.`};
  }
  // The snapshot installs Playwright under portal-runtime/node_modules.
  const root = "/vercel/sandbox/portal-runtime/ats-execution";
  try {
    await sandbox.mkDir(root);
    await sandbox.writeFiles([
      {
        path: `${root}/runner.mjs`,
        content: await readFile(resolve("dist-server/ats-browser-runner.mjs")),
        mode: 0o600,
      },
      {
        path: `${root}/input.json`,
        content: Buffer.from(JSON.stringify(input)),
        mode: 0o600,
      },
    ]);
    const command = await sandbox.runCommand({
      cmd: "node",
      args: [`${root}/runner.mjs`],
      cwd: root,
    });
    if (command.exitCode !== 0) {
      try {
        const started = await sandbox.readFileToBuffer({path:`${root}/form-execution-started`});
        if (!started) return {status:"action_required",retryable:true,message:"O navegador não iniciou o formulário. Nenhuma candidatura foi enviada; revise o ambiente e retome."};
      } catch { /* Missing phase cannot be inferred from an unavailable diagnostic API. */ }
      return {
        status: "unknown",
        message:
          "O navegador foi interrompido. Verifique o destino antes de repetir.",
      };
    }
    const bytes = await sandbox.readFileToBuffer({
      path: `${root}/result.json`,
    });
    if (!bytes)
      return {
        status: "unknown",
        message: "Não foi possível recuperar o resultado da tentativa.",
      };
    return JSON.parse(bytes.toString("utf8")) as ExecutionResult;
  } finally {
    try { await sandbox.stop(); }
    catch { console.error(JSON.stringify({event:"ats_sandbox_cleanup_failed",applicationId:input.applicationId})); }
  }
}
