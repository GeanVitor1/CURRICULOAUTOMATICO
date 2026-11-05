import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
const auth = JSON.parse(await readFile(join(homedir(), "AppData/Roaming/com.vercel.cli/Data/auth.json"), "utf8"));
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (project.projectName !== "curriculoautomatico" || !auth.token) throw Error("Existing project authorization required");
const workspaceId = process.argv.find(a => a.startsWith("--workspace="))?.slice(12);
if (!workspaceId?.endsWith(":live") || workspaceId.length > 200) throw Error("Explicit real workspace required");
let config;
try { config = JSON.parse(await readFile(".data/automation-observer-private.json", "utf8")); } catch {}
if (config && config.workspaceId !== workspaceId) throw Error("Observer already belongs to another workspace");
config ||= { origin: "https://curriculoautomatico.vercel.app", workspaceId, key: randomBytes(32).toString("base64url") };
if (process.argv.includes("--rotate")) config.key = randomBytes(32).toString("base64url");
await writeFile(".data/automation-observer-private.json", JSON.stringify(config), { mode: 0o600 });
const env = { AUTOMATION_OBSERVER_WORKSPACE: workspaceId,
  AUTOMATION_OBSERVER_KEY_SHA256: createHash("sha256").update(config.key).digest("hex") };
const response = await fetch(`https://api.vercel.com/v10/projects/${project.projectId}/env?teamId=${project.orgId}&upsert=true`, {
  method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
  body: JSON.stringify(Object.entries(env).map(([key, value]) => ({ key, value, type: "encrypted", target: ["production"] }))),
});
if (!response.ok) throw Error(`Observer configuration HTTP ${response.status}`);
const result = await response.json();
if (result.failed?.length) throw Error("Observer environment update failed");
console.log(JSON.stringify({ configured: true, scope: "one workspace; read-only diagnostics", iamChanges: 0, appliesOnNextDeployment: true }));
