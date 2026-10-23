import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
import { firestoreStore } from "../server/storage-firestore";
import { and, eq, or, lt } from "../server/storage-types";
import { analyze, matchesObjectiveFilters, matchesSelectedSites } from "../server/engine";
import { opportunityKey } from "../server/job-identity";
import { confirmedApplication } from "../shared/confirmed-applications";
import { confirmedAutomaticApplication } from "../server/automation-trace";

// Read-only operator audit. No sessions created, no employers contacted, no credentials logged.
const config = JSON.parse(await readFile(join(homedir(),".config/configstore/firebase-tools.json"),"utf8"));
const email = process.argv.find(arg => arg.startsWith("--email="))?.slice(8) ||
  (process.argv.includes("--operator") ? config.user?.email : undefined);
if (!email || !config.tokens?.access_token || config.tokens.expires_at <= Date.now())
  throw new Error("Exige titular explícito (--operator ou --email=) e credencial Firebase CLI válida.");
const envFile = process.argv.find(arg => arg.startsWith("--env="))?.slice(6);
if (envFile) {
  const env = dotenv.parse(await readFile(envFile));
  // These values describe permissions only. Secret placeholders are never used to send.
  for (const key of ["ATS_PUBLIC_FORM_PLATFORMS","ATS_BROWSER_AUTHORIZED","COMPANY_FORM_AUTHORIZED","GOOGLE_CLIENT_ID","GOOGLE_REDIRECT_URI","APP_ORIGIN","DISCOVERY_COMPANY_BOARDS"])
    if (env[key]) process.env[key] = env[key];
}
const client = new OAuth2Client();
client.setCredentials({access_token:config.tokens.access_token});
const projectId = "curriculoautomatico-a15fa";
const db = new Firestore({projectId,ignoreUndefinedProperties:true,auth:new GoogleAuth({authClient:client,projectId})});
const store = firestoreStore(db);
try {
  const [owner] = await store.select("users",{where:eq("email",email)});
  if (!owner) throw new Error("Titular não encontrado.");
  const rows = await store.select("workspaces",{where:and(eq("userId",owner.id),eq("demo",false))});
  if (rows.length !== 1) throw new Error("Espaço do titular ambíguo.");
  const {id,data:w} = rows[0];
  const day = new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  const jobs = w.jobs.map(job => {
    const match = analyze(job,w.profile,w.filters);
    const excluded = !!w.submissionExclusions?.includes(opportunityKey(job));
    const compatible = !job.discarded && !excluded && job.availability !== "closed" &&
      matchesSelectedSites(job,w) && matchesObjectiveFilters(job,w.profile,w.filters) &&
      match.confidence !== "insufficient" && !match.blockers.length && match.score >= w.routine.minScore;
    return {id:job.id,title:job.title,company:job.company,url:job.url,publishedAt:job.publishedAt,
      score:match.score,compatible,excluded,blockers:match.blockers,
      emailPublished:!!job.emailDestination,
      destinations:job.destinations?.map(d=>({platform:d.platform,state:d.state,formFound:d.formFound,expiresAt:d.expiresAt})),
      resolution:job.resolution?.message,trace:job.automation,
      application:w.applications.find(a=>a.jobId===job.id)?.status};
  });
  const applications = w.applications.map(a=>({id:a.id,jobId:a.jobId,status:a.status,receipt:a.receipt,
    createdAt:a.createdAt,updatedAt:a.updatedAt,lastAt:a.history.at(-1)?.at,
    submittedAt:a.submittedAt,verification:a.verification,execution:a.execution,attempts:a.attempts,
    last:a.history.at(-1)?.message,confirmed:confirmedApplication(a),automaticProvenance:confirmedAutomaticApplication(a)}));
  const tasks = await Promise.all(["discoveryTasks","resolutionTasks"].map(async table => {
    const result = await store.select(table as "discoveryTasks"|"resolutionTasks",{where:eq("workspaceId",id)});
    return {table,items:result.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0,10).map(t=>({id:t.id,status:t.status,attempts:t.attempts,updatedAt:t.updatedAt}))};
  }));
  const usage = await store.count("applicationUsage",and(eq("userId",owner.id),eq("day",day)));
  const scheduling=await store.routines();
  const schedulerAudit={workspaces:scheduling.length,missingRoutine:scheduling.filter(row=>!row.routine).length,
    missingSchedule:scheduling.filter(row=>row.routine && typeof row.routine.enabled!=="boolean").length,
    ownerDue:scheduling.some(row=>row.id===id&&row.routine?.enabled&&!!row.routine.nextRun&&Date.parse(row.routine.nextRun)<=Date.now())};
  const recoveryQueries=[];
  for(const table of ["resolutionTasks","discoveryTasks"] as const) {
    try {
      const rows=await store.select(table,{where:or(eq("status","queued"),and(eq("status","running"),lt("leaseUntil",new Date()))),columns:["id"],limit:100});
      recoveryQueries.push({table,ok:true,count:rows.length});
    }catch(error) {
      const e=error as {code?:number;message?:string};
      recoveryQueries.push({table,ok:false,code:e.code,indexRequired:/requires an index/i.test(e.message||'')});
    }
  }
  let publicProbe:unknown;
  if(process.argv.includes("--probe")) {
    const {discoverAblerJobs}=await import("../server/abler-discovery");
    const {configuredCompanyBoards,discoverCompanyBoard}=await import("../server/company-board");
    const {withDiscoveryBudget}=await import("../server/discovery-budget");
    const results=await withDiscoveryBudget(180000,async()=>{
      const sources=[await discoverAblerJobs(w)];
      for(const source of configuredCompanyBoards())sources.push(await discoverCompanyBoard(source));
      return sources;
    });
    publicProbe={readOnly:true,found:results.reduce((sum,result)=>sum+result.jobs.length,0),
      checkpoints:results.map(result=>result.checkpoint),eligible:results.flatMap(result=>result.jobs).flatMap(job=>{
        const match=analyze(job,w.profile,w.filters);
        if(match.score<w.routine.minScore||match.blockers.length||!matchesObjectiveFilters(job,w.profile,w.filters))return [];
        return [{title:job.title,url:job.url,score:match.score,alreadyAttempted:w.submissionExclusions?.includes(opportunityKey(job))||w.applications.some(a=>w.jobs.find(j=>j.id===a.jobId)?.url===job.url)}];
      })};
  }
  const report = {at:new Date().toISOString(),day,readOnly:true,filters:w.filters,routine:w.routine,
    publicProbe,schedulerAudit,recoveryQueries,
    confirmedProfile:w.profile.confirmed,approvedOriginalResume:w.resumes.some(r=>r.approved&&r.originalFileAvailable),
    gmailCredentialStored:(await store.select("portalOAuthAccounts",{where:and(eq("userId",owner.id),eq("provider","gmail-send")),columns:["id"]})).length===1,
    counts:{found:jobs.length,compatible:jobs.filter(j=>j.compatible).length,
      compatiblePublishedEmail:jobs.filter(j=>j.compatible&&j.emailPublished).length,
      newCompatiblePublishedEmail:jobs.filter(j=>j.compatible&&j.emailPublished&&!j.application).length,
      preflightBlocked:applications.filter(a=>a.status==="Requer ação manual"&&!a.receipt).length,
      preflightBlockedToday:applications.filter(a=>a.status==="Requer ação manual"&&!a.receipt&&a.lastAt&&new Date(a.lastAt).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})===day).length,
      submissionStartedToday:w.applications.filter(a=>a.history.some(e=>e.message.startsWith("Envio iniciado.")&&new Date(e.at).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})===day)).length,
      confirmedToday:applications.filter(a=>a.confirmed&&a.submittedAt&&new Date(a.submittedAt).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})===day).length,
      verifiedAutomaticToday:applications.filter(a=>a.automaticProvenance&&a.submittedAt&&new Date(a.submittedAt).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})===day).length,
      quotaUsed:usage},runs:w.runs.slice(0,5),tasks,applications,
    jobs:jobs.filter(j=>j.compatible||j.application)};
  await mkdir("artifacts",{recursive:true});
  const output=process.argv.find(arg=>arg.startsWith("--output="))?.slice(9)||"artifacts/automation-audit-2026-10-23.json";
  await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,jobs:report.jobs.map(({trace,...job})=>job)}));
} finally { await store.close(); }
