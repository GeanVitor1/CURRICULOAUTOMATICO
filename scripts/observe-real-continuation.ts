import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {confirmedAutomaticApplication} from '../server/automation-trace';
import {matchesObjectiveFilters} from '../server/engine';
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const w=row.data,day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),since=Date.parse('2026-10-23T14:29:00Z');
 const runs=w.runs.filter(r=>Date.parse(r.at)>=since),runIds=new Set(runs.map(r=>r.id));
 const observed=w.jobs.filter(j=>j.automation?.runId&&runIds.has(j.automation.runId));
 const jobs=observed.filter(j=>Date.parse(j.discoveredAt)>=since);
 const tasks=[];for(const table of ['discoveryTasks','resolutionTasks'] as const){const rows=await store.select(table,{where:eq('workspaceId',row.id)});tasks.push({table,items:rows.filter(r=>r.createdAt.getTime()>=since).sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime()).map(r=>({id:r.id,status:r.status,attempts:r.attempts,createdAt:r.createdAt,updatedAt:r.updatedAt,error:r.lastError}))});}
 const apps=w.applications.filter(a=>a.id==='69692d0e-e9ba-448b-bb78-0140f31dc5f5'||a.attempts?.some(t=>Date.parse(t.startedAt)>=since)||jobs.some(j=>j.id===a.jobId)).map(a=>({id:a.id,jobId:a.jobId,company:w.jobs.find(j=>j.id===a.jobId)?.company,status:a.status,execution:a.execution,attempts:a.attempts,receipt:a.receipt,submittedAt:a.submittedAt||null,missingQuestions:a.missingQuestions||[],history:a.history}));
 const report={at:new Date().toISOString(),readOnly:true,workspaceId:row.id,filtersSha256:createHash('sha256').update(JSON.stringify(w.filters)).digest('hex'),runs,tasks,jobs:jobs.map(j=>({id:j.id,url:j.url,title:j.title,company:j.company,publishedAt:j.publishedAt,score:j.match.score,blockers:j.match.blockers,objectiveEligible:matchesObjectiveFilters(j,w.profile,w.filters)&&j.match.score>=w.routine.minScore&&!j.match.blockers.length&&j.match.confidence!=='insufficient',availability:j.availability,automation:j.automation,resolution:j.resolution,destinations:j.destinations?.map(d=>({url:d.url,platform:d.platform,state:d.state,formFound:d.formFound}))})),applications:apps,routine:w.routine,usageToday:await store.count('applicationUsage',and(eq('userId',u.id),eq('day',day))),confirmedAutomaticToday:w.applications.filter(a=>confirmedAutomaticApplication(a)&&new Date(a.submittedAt!).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})===day).length};
 await writeFile('artifacts/real-continuation-state-2026-10-23.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({at:report.at,runs:report.runs,tasks:report.tasks,newJobs:report.jobs.length,applications:apps.map(a=>({id:a.id,jobId:a.jobId,company:a.company,status:a.status,attempts:a.attempts,receipt:a.receipt})),usageToday:report.usageToday,confirmedAutomaticToday:report.confirmedAutomaticToday,nextRun:w.routine.nextRun}));
}finally{await store.close();}
