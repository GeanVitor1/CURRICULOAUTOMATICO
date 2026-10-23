import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {writeFile} from 'node:fs/promises';
const {store,operatorEmail}=await operatorStore();
try{
 const [user]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
 const w=row.data,tasks=[];
 for(const table of ['discoveryTasks','resolutionTasks'] as const){const rows=await store.select(table,{where:eq('workspaceId',row.id)});tasks.push({table,items:rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0,4).map(r=>({id:r.id,status:r.status,attempts:r.attempts,createdAt:r.createdAt,updatedAt:r.updatedAt,lastError:r.lastError}))});}
 const jobs=w.jobs.filter(j=>j.url.includes('jobs.quickin.io')).map(j=>({id:j.id,url:j.url,title:j.title,company:j.company,match:j.match,automation:j.automation,resolution:j.resolution}));
 const report={at:new Date().toISOString(),runs:w.runs.slice(0,4),tasks,quickinJobs:jobs,applications:w.applications.filter(a=>jobs.some(j=>j.id===a.jobId)).map(a=>({id:a.id,status:a.status,jobId:a.jobId,receipt:a.receipt,execution:a.execution,attempts:a.attempts,history:a.history,missingQuestions:a.missingQuestions})),routine:w.routine,sourceStatus:w.sources.filter(s=>s.id.includes('quickin'))};
 await writeFile('artifacts/globalti-routine-observation-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
