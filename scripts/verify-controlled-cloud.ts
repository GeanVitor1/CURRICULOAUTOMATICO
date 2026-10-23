import { Sandbox } from "@vercel/sandbox";
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import { readdir } from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";

const cloud = dotenv.parse(await readFile(".env.portal-cloud.local"));
const auth = JSON.parse(await readFile(join(homedir(),"AppData/Roaming/com.vercel.cli/Data/auth.json"),"utf8"));
const project = JSON.parse(await readFile(".vercel/project.json","utf8"));
if (!auth.token || project.projectName !== "curriculoautomatico") throw new Error("Exige CLI autenticada e projeto correto.");
const snapshotId = cloud.PORTAL_CLOUD_SNAPSHOT_ID;
if (!snapshotId) throw new Error("Imagem de navegador QA indisponível.");
await build({
  entryPoints: ["scripts/controlled-destination-pipeline.ts"],
  outfile: ".data/controlled-pipeline.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const sandbox = await Sandbox.create({
  token:auth.token,teamId:project.orgId,projectId:project.projectId,
  source: { type: "snapshot", snapshotId },
  persistent: false,
  resources: { vcpus: 1 },
  ports: [3005],
  timeout: 600000,
});
try {
  const origin = sandbox.domain(3005),
    root = "/vercel/sandbox/controlled-pipeline";
  await sandbox.mkDir(root);
  await sandbox.mkDir(root + "/migrations");
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  await sandbox.writeFiles([
    {
      path: root + "/package.json",
      content: Buffer.from(
        JSON.stringify({
          private: true,
          type: "module",
          dependencies: manifest.dependencies,
        }),
      ),
    },
    {
      path: root + "/pipeline.mjs",
      content: await readFile(".data/controlled-pipeline.mjs"),
    },
    ...(await Promise.all(
      (await readdir("migrations"))
        .filter((name) => name.endsWith(".sql"))
        .map(async (name) => ({
          path: root + "/migrations/" + name,
          content: await readFile("migrations/" + name),
        })),
    )),
  ]);
  const install = await sandbox.runCommand({
    cmd: "npm",
    args: [
      "install",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    cwd: root,
  });
  if (install.exitCode !== 0)
    throw new Error("Não foi possível instalar as dependências na máquina QA.");
  for(const adapter of ["ats_browser","company_wp_jobs"]) {
  const run = await sandbox.runCommand({
    cmd: "node",
    args: [root + "/pipeline.mjs"],
    cwd: root,
    env: {
      NODE_ENV: "test",
      DATA_DIR: root + "/db-" + adapter,
      CONTROLLED_ORIGIN: origin,
      CONTROLLED_COUNT:"5",
      CONTROLLED_ADAPTER:adapter,
      GEMINI_API_KEY: "",
      ANTIGRAVITY_ENABLED: "false",
      DATABASE_URL: "",
      DATABASE_PROVIDER: "",
      REDIS_URL: "",
      VERCEL: "",
      ATS_EXECUTION_LOCAL: "true",
      ATS_BROWSER_AUTHORIZED: `company:${new URL(origin).hostname}`,
      COMPANY_FORM_AUTHORIZED:new URL(origin).hostname,
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    },
  });
  if (run.exitCode !== 0) {
    console.error((await run.stderr()).slice(-6000));
    throw new Error("O fluxo controlado na nuvem não foi confirmado.");
  }
  const bytes = await sandbox.readFileToBuffer({
    path: "/vercel/sandbox/controlled-pipeline-result.json",
  });
  if (!bytes) throw new Error("Sem evidência do receptor QA.");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    `artifacts/controlled-cloud-${adapter}-pipeline-2026-10-23.json`,
    bytes,
  );
  console.log(bytes.toString("utf8"));
  }
} finally {
  await sandbox.stop();
}
