import { readFile, writeFile, readdir, mkdir, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { load } from "cheerio";
import { readPublicPage } from "../server/public-web";
import { enrichOriginFromPage } from "../server/destination-page";
import type { Job } from "../shared/types";

const deployment = process.argv[2];
if (
  !deployment ||
  !/^curriculoautomatico-[a-z0-9]+-geans-projects-da7db03c\.vercel\.app$/.test(
    deployment,
  )
)
  throw new Error("Informe o deployment de validação verificado.");
const cacheRoot = join(homedir(), "AppData/Local/npm-cache/_npx");
let cli = "";
for (const dir of await readdir(cacheRoot)) {
  try {
    const path = join(cacheRoot, dir, "node_modules/vercel");
    const manifest = JSON.parse(
      await readFile(join(path, "package.json"), "utf8"),
    );
    if (manifest.version === "64.4.0") {
      cli = join(path, manifest.bin.vercel);
      break;
    }
  } catch {
    /* Unrelated npm caches are ignored. */
  }
}
if (!cli)
  throw new Error("Vercel CLI verificado não encontrado no cache local.");
const dir = await mkdtemp(join(tmpdir(), "empregatos-destination-api-"));
const jar = join(dir, "cookies.private"),
  password = `QA-${randomUUID()}`;
const origin = "https://curriculoautomatico.vercel.app";
async function request(path: string, method = "GET", body?: unknown) {
  const headersPath = join(dir, `headers-${randomUUID()}.private`);
  const args = [
    cli,
    "curl",
    path,
    "--deployment",
    deployment,
    "--",
    "-sS",
    "-D",
    headersPath,
    "-X",
    method,
    "-H",
    `Origin: ${origin}`,
    "-H",
    "X-Orbita-Request: 1",
    "--cookie",
    jar,
    "--cookie-jar",
    jar,
    "--max-time",
    "65",
  ];
  if (body !== undefined) {
    const bodyPath = join(dir, `body-${randomUUID()}.json`);
    await writeFile(bodyPath, JSON.stringify(body));
    args.push(
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      `@${bodyPath}`,
    );
  }
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (part) => (stdout += part));
    child.stderr.on("data", (part) => (stderr += part));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(
              `Chamada protegida falhou (${code}): ${stderr.slice(-300)}`,
            ),
          ),
    );
  });
  const headers = await readFile(headersPath, "utf8"),
    status = Number([...headers.matchAll(/HTTP\/[^\s]+ (\d+)/g)].at(-1)?.[1]);
  let json: any;
  try {
    json = JSON.parse(output);
  } catch {
    throw new Error(`Resposta não JSON; HTTP ${status}`);
  }
  if (status >= 400)
    throw new Error(`HTTP ${status}: ${json.error || "Falha na API"}`);
  return json;
}
let registered = false;
try {
  await request("/api/auth/register", "POST", {
    name: "Pessoa fictícia QA de destinos",
    email: `destination-api-qa-${randomUUID()}@example.test`,
    password,
  });
  registered = true;
  const url =
    "https://www.infojobs.com.br/vaga-de-desenvolvedor-junior-net-react-ia-em-__12110291.aspx";
  const publicPage = await readPublicPage(url),
    $ = load(publicPage.html);
  const company = $('#detailContainer a[href*="empresa-"]')
    .toArray()
    .map((node) => $(node).text().replace(/\s+/g, " ").trim())
    .find((value) => /[a-z]/i.test(value));
  if (!company) throw new Error("Empresa da vaga não confirmada.");
  const base = {
    id: randomUUID(),
    company,
    title: $(".js_vacancyHeaderTitle").text(),
    description: "",
    url,
    source: "InfoJobs",
    location: "Brasil",
    modality: "Remoto",
    level: "Júnior",
    contract: "PJ",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: [],
    requiredSkills: [],
    requiredYears: null,
    discoveredAt: new Date().toISOString(),
    publishedAt: null,
    saved: false,
    discarded: false,
    origins: [],
    match: {} as Job["match"],
    demo: false,
  } satisfies Job;
  const parsed = enrichOriginFromPage(base, publicPage);
  if (!parsed) throw new Error("Não foi possível ler a publicação real.");
  const imported = await request("/api/jobs", "POST", {
    title: parsed.title,
    company: parsed.company,
    url,
    description: parsed.description,
    location: parsed.location,
    modality: parsed.modality,
    level: parsed.level,
    contract: parsed.contract,
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: ["C#", ".NET", "React", "Git"],
    requiredSkills: [],
    requiredYears: null,
  });
  const queued = await request(`/api/jobs/${imported.id}/resolve`, "POST");
  let result: any, state: any;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    result = await request(`/api/jobs/${imported.id}`);
    if (result.resolution) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  state = await request("/api/workspace");
  const report = {
    at: new Date().toISOString(),
    deployment,
    environment:
      "Rotas autenticadas → Vercel Queues real → função publicada → Firestore Standard real",
    taskAccepted: queued.status === "queued",
    resolutionRecorded: !!result.resolution,
    resolutionState: result.resolution?.state,
    consulted: result.resolution?.consulted,
    destinationCount: result.destinations?.length || 0,
    destinations: result.destinations?.map((item: any) => ({
      url: item.url,
      platform: item.platform,
      state: item.state,
      method: item.method,
      formFound: item.formFound,
    })),
    applications: state.applications?.length,
    resumeUploaded: false,
    employerSubmissions: 0,
    disposableAccountRemoved: false,
  };
  if (
    !report.taskAccepted ||
    !report.resolutionRecorded ||
    !report.destinations?.some(
      (item: any) =>
        item.url ===
          "https://kingoflanguages.pandape.infojobs.com.br/Detail/3817540" &&
        item.state === "verified",
    ) ||
    report.applications !== 0
  )
    throw new Error(`Verificação não comprovada: ${JSON.stringify(report)}`);
  await request("/api/account", "DELETE", { password });
  registered = false;
  report.disposableAccountRemoved = true;
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/destination-queue-verification.json",
    JSON.stringify(report, null, 2),
  );
  // Local cookies remain in a private OS temporary directory, never an exported artifact.
  await writeFile(jar, "");
  console.log(JSON.stringify(report));
} finally {
  if (registered)
    await request("/api/account", "DELETE", { password }).catch(() => {});
  await writeFile(jar, "").catch(() => {});
}
