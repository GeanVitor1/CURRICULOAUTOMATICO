import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { join } from "node:path";

const minimums = JSON.parse(
  readFileSync(new URL("../shared/node-runtime-policy.json", import.meta.url), "utf8"),
);
function secure(version) {
  const p = version.trim().replace(/^v/, "").split(".").map(Number);
  const m = minimums[p[0]];
  return (
    !!m &&
    p.length === 3 &&
    p.every(Number.isInteger) &&
    (p[1] > m[1] || (p[1] === m[1] && p[2] >= m[2]))
  );
}

if (secure(process.versions.node)) {
  console.log(`Node ${process.versions.node} já atende à política de segurança.`);
  process.exit(0);
}

function download(url) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    const req = get(
      url,
      { headers: { "Accept-Encoding": "identity" }, timeout: 60000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Falha ao baixar ${url}: HTTP ${res.statusCode}`));
          return;
        }
        res.on("data", (part) => {
          size += part.length;
          if (size > 90_000_000) {
            res.destroy(new Error("Arquivo excedeu o limite esperado."));
            return;
          }
          parts.push(part);
        });
        res.on("error", reject);
        res.on("end", () => resolve(Buffer.concat(parts)));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado no download.")));
  });
}

if (process.platform === "win32") {
  execFileSync("powershell", ["-File", "scripts/install-secure-node.ps1"], {
    stdio: "inherit",
  });
  process.exit(0);
}

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error(`Instalador automático suporta Windows x64 e Linux x64 (atual: ${process.platform}/${process.arch}).`);
}

const nodeVersion = "v24.22.2";
const archiveName = `node-${nodeVersion}-linux-x64.tar.xz`;
const runtimeRoot = join(process.env.HOME || "/tmp", ".local", "share", "empregatos", "runtime");
const targetBinary = join(runtimeRoot, `node-${nodeVersion}-linux-x64`, "bin", "node");

if (existsSync(targetBinary)) {
  const out = execFileSync(targetBinary, ["--version"], { encoding: "utf8" }).trim();
  if (secure(out)) {
    console.log(`Runtime local seguro já instalado: ${out}`);
    process.exit(0);
  }
}

mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
const baseUrl = `https://nodejs.org/dist/${nodeVersion}/`;
const checksums = (await download(`${baseUrl}SHASUMS256.txt`)).toString("utf8");
const line = checksums
  .split("\n")
  .find((item) => item.trim().endsWith(` ${archiveName}`));
if (!line || !/^([a-f0-9]{64})\s/.test(line)) {
  throw new Error("Checksum oficial não encontrado para o pacote Linux x64.");
}
const expectedHash = line.trim().split(/\s+/)[0];
const bytes = await download(`${baseUrl}${archiveName}`);
const actualHash = createHash("sha256").update(bytes).digest("hex");
if (actualHash !== expectedHash) {
  throw new Error("O checksum do Node não corresponde ao publicado pelo fornecedor.");
}
const archivePath = join(runtimeRoot, archiveName);
writeFileSync(archivePath, bytes, { mode: 0o600 });
try {
  execFileSync("tar", ["-xJf", archivePath, "-C", runtimeRoot], { stdio: "inherit" });
} finally {
  rmSync(archivePath, { force: true });
}
const installedVersion = execFileSync(targetBinary, ["--version"], {
  encoding: "utf8",
}).trim();
console.log(`Runtime seguro instalado em ${targetBinary} (${installedVersion})`);
