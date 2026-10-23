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
  const requestedAge=process.argv.find(arg=>arg.startsWith("--age-days="))?.slice(11);
  if(requestedAge) w.filters.ageDays=Number(requestedAge);
  const {discoverAblerJobs}=await import("../server/abler-discovery");
  const {withDiscoveryBudget}=await import("../server/discovery-budget");
  const {analyze,matchesObjectiveFilters}=await import("../server/engine");
  const {opportunityKey}=await import("../server/job-identity");
  const result=await withDiscoveryBudget(180000,()=>discoverAblerJobs(w));
  const matches=result.jobs.map(job=>({title:job.title,company:job.company,url:job.url,publishedAt:job.publishedAt,score:analyze(job,w.profile,w.filters).score,blockers:analyze(job,w.profile,w.filters).blockers,filters:matchesObjectiveFilters(job,w.profile,w.filters),excluded:w.submissionExclusions?.includes(opportunityKey(job)),known:w.jobs.some(current=>current.url===job.url)}));
  console.log(JSON.stringify({at:new Date().toISOString(),jobs:result.jobs.length,matches}));
} finally {await store.close();}
