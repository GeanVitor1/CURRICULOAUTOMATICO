// Monta a imagem (snapshot) da Vercel Sandbox usada pelas conexões de
// Gupy, InfoJobs e Glassdoor: Chromium + bibliotecas do sistema + playwright.
// Uso: vercel env pull .env.sandbox.local  (gera VERCEL_OIDC_TOKEN)
//      node --env-file=.env.sandbox.local scripts/build-portal-snapshot.mjs
// Imprime apenas o snapshotId. Nenhum dado de usuário entra na imagem.
import { Sandbox } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const playwright = pkg.dependencies.playwright.replace(/^[^\d]*/, "");
const root = "/vercel/sandbox/portal-runtime";
// Bibliotecas que o Chromium headless exige no Amazon Linux 2023 da Sandbox.
const systemLibraries = [
  "nss", "nspr", "atk", "at-spi2-atk", "at-spi2-core", "cups-libs",
  "libdrm", "libxkbcommon", "libXcomposite", "libXdamage", "libXrandr",
  "libXfixes", "libXext", "libX11", "libxcb", "mesa-libgbm", "pango",
  "cairo", "alsa-lib", "dbus-libs", "expat", "libxshmfence",
];

async function run(sandbox, cmd, args, options = {}) {
  const result = await sandbox.runCommand({ cmd, args, ...options });
  if (result.exitCode !== 0) {
    const tail = (await result.stderr()).slice(-1500);
    throw new Error(`Falhou: ${cmd} ${args.join(" ")}\n${tail}`);
  }
  return result;
}

const sandbox = await Sandbox.create({
  runtime: "node22",
  resources: { vcpus: 2 },
  timeout: 30 * 60000,
});
try {
  console.error("Sandbox criada; instalando bibliotecas do sistema…");
  await run(sandbox, "dnf", ["install", "-y", ...systemLibraries], { sudo: true });
  await run(sandbox, "mkdir", ["-p", root + "/requests"]);
  await run(sandbox, "npm", ["init", "-y"], { cwd: root });
  console.error(`Instalando playwright@${playwright}…`);
  await run(sandbox, "npm", ["install", "--no-audit", "--no-fund", `playwright@${playwright}`], { cwd: root });
  await run(sandbox, "npx", ["playwright", "install", "chromium"], { cwd: root });
  console.error("Conferindo se o Chromium abre…");
  await run(sandbox, "node", ["-e",
    "import('playwright').then(async({chromium})=>{const b=await chromium.launch({headless:true});const p=await b.newPage();await p.setContent('<p>ok</p>');console.log(await p.textContent('p'));await b.close();})",
  ], { cwd: root });
  console.error("Gerando snapshot…");
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(snapshot.snapshotId);
} catch (error) {
  await sandbox.stop().catch(() => {});
  throw error;
}
