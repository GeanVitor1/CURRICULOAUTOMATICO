import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Existing operator authorization; only Vercel GETs and public health.
const auth = JSON.parse(await readFile(join(homedir(), "AppData/Roaming/com.vercel.cli/Data/auth.json"), "utf8"));
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
async function get(path) {
  const response = await fetch(`https://api.vercel.com${path}?teamId=${project.orgId}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  if (!response.ok) throw new Error(`Vercel read HTTP ${response.status}`);
  return response.json();
}
const alias = await get("/v4/aliases/curriculoautomatico.vercel.app");
const deploymentId = alias.deploymentId || alias.deployment?.id;
const [deployment, currentProject, healthResponse] = await Promise.all([
  get(`/v13/deployments/${deploymentId}`),
  get(`/v9/projects/${project.projectId}`),
  fetch("https://curriculoautomatico.vercel.app/api/health"),
]);
const report = {
  at: new Date().toISOString(), readOnly: true, deploymentId,
  readyState: deployment.readyState,
  health: { httpStatus: healthResponse.status, ...await healthResponse.json() },
  cron: { project: currentProject.crons, deployment: deployment.crons },
  deploymentPerformed: false, cronTriggered: false,
};
await writeFile(process.argv[2] || "artifacts/automation-viability-production-2026-10-23.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
