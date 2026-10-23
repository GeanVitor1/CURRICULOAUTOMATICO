import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { firestoreStore } from "../server/storage-firestore";
import { and, eq } from "../server/storage-types";
import { clearApplicationHistory } from "../server/clear-application-history";

// Uses the operator's existing Firebase CLI credentials, never a browser session.
// Dry run by default. Restricts all changes to exactly one explicitly named owner.
const email = process.argv.find((arg) => arg.startsWith("--email="))?.slice(8);
if (!email) throw new Error("Informe --email=conta e opcionalmente --apply.");
const config = JSON.parse(
  await readFile(
    join(homedir(), ".config/configstore/firebase-tools.json"),
    "utf8",
  ),
);
if (!config.tokens?.access_token)
  throw new Error("Entre no Firebase CLI primeiro.");
const client = new OAuth2Client();
client.setCredentials({ access_token: config.tokens.access_token });
const projectId = "curriculoautomatico-a15fa";
process.env.FIREBASE_PROJECT_ID = projectId;
const database = new Firestore({
  projectId,
  ignoreUndefinedProperties: true,
  auth: new GoogleAuth({ authClient: client, projectId }),
});
const store = firestoreStore(database);
try {
  const [owner] = await store.select("users", { where: eq("email", email) });
  if (!owner) throw new Error("Conta não encontrada");
  const rows = await store.select("workspaces", {
    where: and(eq("userId", owner.id), eq("demo", false)),
  });
  if (rows.length !== 1) throw new Error("Espaço ambíguo");
  const { id, data: w } = rows[0];
  const tasks = await store.select("discoveryTasks", {
    where: eq("workspaceId", id),
  });
  const resolutions = await store.select("resolutionTasks", {
    where: eq("workspaceId", id),
  });
  const {
    analyze,
    matchesObjectiveFilters,
    matchesSelectedSites,
    eligibleForDestinationResearch,
  } = await import("../server/engine");
  const { opportunityKey } = await import("../server/job-identity");
  const summary = {
    at: new Date().toISOString(),
    routine: w.routine,
    jobs: w.jobs.length,
    quotaUsed: await store.count(
      "applicationUsage",
      and(
        eq("userId", owner.id),
        eq(
          "day",
          new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          }),
        ),
      ),
    ),
    researched: w.jobs.filter((j) => j.resolution).length,
    poolRemaining: w.jobs.filter(
      (j) =>
        !j.discarded &&
        j.availability !== "closed" &&
        !w.submissionExclusions?.includes(opportunityKey(j)) &&
        !w.applications.some(
          (a) =>
            a.jobId === j.id &&
            (a.receipt ||
              a.submittedAt ||
              ["Enviando", "Resultado desconhecido"].includes(a.status)),
        ) &&
        !w.applications.some(a=>a.jobId===j.id && a.history.some(event=>/exige verificação humana|solicitou verificação humana/.test(event.message))) &&
        matchesSelectedSites(j, w) &&
        eligibleForDestinationResearch(j, w) &&
        (!j.resolution || Date.parse(j.resolution.retryAt) <= Date.now()),
    ).length,
    runs: w.runs.slice(0, 2),
    discovery: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      attempts: t.attempts,
      error: t.lastError,
      updatedAt: t.updatedAt,
    })),
    resolution: resolutions.map((t) => ({
      id: t.id,
      status: t.status,
      attempts: t.attempts,
      error: t.lastError,
      updatedAt: t.updatedAt,
    })),
    applications: w.applications.map((a) => ({
      id: a.id,
      job: w.jobs.find((j) => j.id === a.jobId)?.title,
      company: w.jobs.find((j) => j.id === a.jobId)?.company,
      status: a.status,
      receipt: a.receipt,
      submittedAt: a.submittedAt,
      questions: a.missingQuestions,
      last: a.history.at(-1),
    })),
    resolvedJobs: w.jobs
      .filter((j) => j.resolution?.state === "verified" || j.emailDestination)
      .map((j) => ({
        title: j.title,
        url: j.url,
        contract: j.contract,
        modality: j.modality,
        publishedAt: j.publishedAt,
        confidence: analyze(j, w.profile, w.filters).confidence,
        score: analyze(j, w.profile, w.filters).score,
        blockers: analyze(j, w.profile, w.filters).blockers,
        filters: matchesObjectiveFilters(j, w.profile, w.filters),
        sites: matchesSelectedSites(j, w),
        excluded: w.submissionExclusions?.includes(opportunityKey(j)),
      })),
    topJobs: [...w.jobs]
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 10)
      .map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        url: j.url,
        score: j.match.score,
        blockers: j.match.blockers,
        resolution: j.resolution
          ? { state: j.resolution.state, message: j.resolution.message }
          : undefined,
        destinations: j.destinations?.map((d) => ({
          platform: d.platform,
          state: d.state,
          formFound: d.formFound,
        })),
        email: !!j.emailDestination,
      })),
  };
  console.log(JSON.stringify(summary));
} finally {
  await store.close();
}
