import { readFile, writeFile } from "node:fs/promises";
const config = JSON.parse(await readFile(".data/automation-observer-private.json", "utf8"));
if (config.origin !== "https://curriculoautomatico.vercel.app" || typeof config.key !== "string") throw Error("Invalid observer configuration");
const day = process.argv.find(a => a.startsWith("--day="))?.slice(6) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("Invalid day");
const response = await fetch(`${config.origin}/api/internal/automation-diagnostics?day=${day}`, {
  headers: { "X-Automation-Observer-Key": config.key }, redirect: "error", signal: AbortSignal.timeout(55000),
});
if (!response.ok) throw Error(`Observer HTTP ${response.status}`);
const report = await response.json();
const output=process.argv.find(a=>a.startsWith("--output="))?.slice(9)||`artifacts/production-observer-${day}-${Date.now()}.json`;
await writeFile(output, JSON.stringify(report, null, 2),{flag:"wx"});
console.log(JSON.stringify({ output, at: report.at, readOnly: report.readOnly, day: report.day, deployment: report.deployment,
  counts: report.counts, schedule: report.schedule, panelConsistent: report.panel?.progressConsistent,
  discoveryTasks: report.tasks?.discovery, resolutionTasks: report.tasks?.resolution, submission: report.submission,
  workerEvents: report.workerEvents?.length }));
