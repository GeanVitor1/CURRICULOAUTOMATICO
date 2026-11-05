import { writeFile } from "node:fs/promises";
import { operatorStore } from "./operator-firestore";
import { and, eq } from "../server/storage-types";
import { connectors } from "../server/connectors";
import { analyze, matchesObjectiveFilters } from "../server/engine";
import { opportunityKey } from "../server/job-identity";
import type { Source } from "../shared/types";
// One bounded inspection of new official boards; no writes or employer contact.
const sources: Source[] = [{ id:"catalog:greenhouse:stone",type:"greenhouse",company:"Stone",board:"stone",enabled:true,discovery:true,application:false,status:"" }];
const {store,operatorEmail}=await operatorStore();
try {
  const [owner]=await store.select("users",{where:eq("email",operatorEmail)});
  const [row]=await store.select("workspaces",{where:and(eq("userId",owner.id),eq("demo",false))});
  const w=row.data,results=[];
  for(const source of sources){
    const jobs=await connectors[source.type].discover(source);
    const relevant=jobs.filter(j=>/\.net|full.?stack|desenvolv|software engineer/i.test(j.title));
    results.push({source,examined:jobs.length,relevant:relevant.map(j=>{
      const match=analyze(j,w.profile,w.filters),objective=matchesObjectiveFilters(j,w.profile,w.filters);
      const existing=w.applications.some(a=>w.jobs.some(old=>old.id===a.jobId&&opportunityKey(old)===opportunityKey(j)))||!!w.submissionExclusions?.includes(opportunityKey(j));
      return {id:j.id,url:j.url,title:j.title,publishedAt:j.publishedAt,modality:j.modality,location:j.location,
        score:match.score,blockers:match.blockers,objective,existing,eligible:objective&&!existing&&!match.blockers.length&&match.confidence!=="insufficient"&&match.score>=w.routine.minScore};
    })});
  }
  const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,results};
  await writeFile("artifacts/new-authorized-opportunities-2026-10-26.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(results.map(r=>({source:r.source.company,examined:r.examined,eligible:r.relevant.filter(j=>j.eligible),dotnet:r.relevant.filter(j=>/\.net/i.test(j.title))}))));
} finally{await store.close();}
