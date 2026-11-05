// Upload only frontend sources and synthetic fixtures to a fresh QA VM.
import { Sandbox } from "@vercel/sandbox";
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { createWorkspace } from "../server/workspace";

const auth = JSON.parse(
  await readFile(
    join(homedir(), "AppData/Roaming/com.vercel.cli/Data/auth.json"),
    "utf8",
  ),
);
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (project.projectName !== "curriculoautomatico" || !auth.token)
  throw Error("Existing project authorization required");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const names = [
  "react",
  "react-dom",
  "@tanstack/react-query",
  "motion",
  "lucide-react",
  "@radix-ui/react-dialog",
  "react-hook-form",
  "@hookform/resolvers",
  "zod",
  "@fontsource-variable/inter",
  "@fontsource-variable/manrope",
  "vite",
  "@vitejs/plugin-react",
  "@tailwindcss/vite",
  "tailwindcss",
];
const dependencies = Object.fromEntries(
  names.map((name) => [
    name,
    pkg.dependencies?.[name] || pkg.devDependencies?.[name],
  ]),
);
if (Object.values(dependencies).some((value) => !value))
  throw Error("Missing frontend dependency");
dependencies.playwright = "1.64.0";
const files = new Set<string>();
async function collect(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(tsx?|css|svg|png|jpe?g|webp|gif)$/.test(path)) files.add(path);
  }
}
await collect("src");
await collect("shared");
for (const path of [...files]) {
  if (!/\.(tsx?|css)$/.test(path)) continue;
  const text = await readFile(path, "utf8");
  for (const match of text.matchAll(
    /(?:from\s*|import\s*)['"]([^'"\n]+)['"]/g,
  )) {
    if (!match[1].startsWith(".")) continue;
    const asset = resolve(dirname(path), match[1]);
    if (!/\.(jpeg|jpg|png|gif|svg|webp|mp4)$/.test(asset)) continue;
    const local = relative(process.cwd(), asset);
    if (local.startsWith("..") || local.includes(".env"))
      throw Error("Asset outside project");
    if ((await stat(asset)).isFile()) files.add(local);
  }
}
for (const path of [
  "index.html",
  "public/mascot-original.jpeg",
  "public/login-video-poster.png",
])
  files.add(path);
const fixture = createWorkspace("Ana de teste", "demo@example.test");
fixture.infrastructure.candidateDetailsRequired = true;
let sandbox: Sandbox | undefined,
  root = "";
const screenshots = [
  "onboarding-welcome-desktop.png",
  "onboarding-welcome-mobile.png",
  "onboarding-details-mobile.png",
  "onboarding-preferences-desktop.png",
  "onboarding-help-mobile.png",
  "onboarding-complete.png",
];
try {
  sandbox = await Sandbox.create({
    token: auth.token,
    teamId: project.orgId,
    projectId: project.projectId,
    image: "vercel/sandbox/universal",
    resources: { vcpus: 1 },
    timeout: 10 * 60000,
    tags: { purpose: "onboarding-synthetic-qa" },
  });
  console.log(
    JSON.stringify({
      stage: "created",
      sandboxName: sandbox.name,
      realAccountsUsed: false,
    }),
  );
  const pwd = await sandbox.runCommand({ cmd: "pwd", args: [] });
  const base = (await pwd.stdout()).trim();
  if (
    pwd.exitCode !== 0 ||
    !/^\/[a-zA-Z0-9_./-]+$/.test(base) ||
    base.includes("..")
  )
    throw Error("Unexpected sandbox directory");
  root = base.replace(/\/$/, "") + "/empregatos-onboarding-qa";
  await sandbox.mkDir(root);
  const uploads = await Promise.all(
    [...files].map(async (path) => ({
      path: root + "/" + path.replaceAll("\\", "/"),
      content: await readFile(path),
    })),
  );
  uploads.push(
    {
      path: root + "/package.json",
      content: Buffer.from(
        JSON.stringify({ type: "module", private: true, dependencies }),
      ),
    },
    {
      path: root + "/fixture.json",
      content: Buffer.from(JSON.stringify(fixture)),
    },
    {
      path: root + "/verify.mjs",
      content: await readFile("scripts/verify-onboarding-remote.mjs"),
    },
  );
  await sandbox.writeFiles(uploads);
  async function run(stage: string, cmd: string, args: string[], sudo = false) {
    console.log(JSON.stringify({ stage }));
    const result = await sandbox!.runCommand({
      cmd,
      args,
      cwd: root,
      sudo,
      env: {
        PLAYWRIGHT_BROWSERS_PATH: root + "/browsers",
        NODE_OPTIONS: "--max-old-space-size=512",
      },
    });
    if (result.exitCode !== 0)
      throw Error(
        stage +
          ": " +
          (await result.stderr()).slice(-2500) +
          " " +
          (await result.stdout()).slice(-1500),
      );
    return result;
  }
  await run("install-frontend-test-dependencies", "npm", [
    "install",
    "--no-audit",
    "--no-fund",
  ]);
  await run(
    "install-remote-browser",
    "npx",
    ["--no-install", "playwright", "install", "--with-deps", "chromium"],
    true,
  );
  const result = await run("build-and-test-guided-first-access", "node", [
    "verify.mjs",
  ]);
  console.log(await result.stdout());
  await mkdir("artifacts", { recursive: true });
  for (const name of [...screenshots, "onboarding-qa.json"]) {
    const content = await sandbox.readFileToBuffer({ path: root + "/" + name });
    if (!content) throw Error("Missing QA result " + name);
    await writeFile("artifacts/" + name, content);
  }
} catch (error) {
  if (sandbox && root) {
    const capture = await sandbox
      .readFileToBuffer({ path: root + "/onboarding-error.png" })
      .catch(() => null);
    if (capture) await writeFile("artifacts/onboarding-error.png", capture);
  }
  throw error;
} finally {
  if (sandbox) {
    let stopped = false,
      deleted = false;
    await sandbox
      .stop()
      .then(() => {
        stopped = true;
      })
      .catch(() => {});
    await sandbox
      .delete()
      .then(() => {
        deleted = true;
      })
      .catch(() => {});
    console.log(
      JSON.stringify({
        stage: "cleanup",
        sandboxName: sandbox.name,
        stopped,
        deleted,
      }),
    );
  }
}
