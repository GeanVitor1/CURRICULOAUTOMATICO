import { writeFile } from 'node:fs/promises';
import { operatorStore } from './operator-firestore';
import { and, eq } from '../server/storage-types';
import { analyze, matchesObjectiveFilters, eligibleForDestinationResearch } from '../server/engine';
const {store, operatorEmail}=await operatorStore();
try {
  const [user]=await store.select('users',{where:eq('email',operatorEmail)});
  if(!user) throw Error('Operator account not found');
  const rows=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
  if(rows.length!==1) throw Error('Expected one operator workspace');
  const {id,data:w}=rows[0];
  await writeFile('.data/owner-automation-context.json',JSON.stringify({id,userId:user.id,workspace:w}),{mode:0o600});
  const summary={at:new Date().toISOString(),workspaceId:id,readOnly:true,filters:w.filters,
    profile:{confirmed:w.profile.confirmed,skills:w.profile.skills,years:w.profile.years,level:w.profile.level,experience:w.profile.experience,education:w.profile.education},
    routine:{enabled:w.routine.enabled,mode:w.routine.mode,minScore:w.routine.minScore,dailyLimit:w.routine.dailyLimit,destinationPolicy:w.routine.destinationPolicy},
    qualified:w.jobs.filter(j=>!j.discarded&&eligibleForDestinationResearch(j,w)).map(j=>{
      const m=analyze(j,w.profile,w.filters);return {title:j.title,company:j.company,url:j.url,score:m.score,blockers:m.blockers,confidence:m.confidence,objective:matchesObjectiveFilters(j,w.profile,w.filters),publishedAt:j.publishedAt,contract:j.contract,modality:j.modality,applied:w.applications.some(a=>a.jobId===j.id),resolution:j.resolution?.state};
    }).sort((a,b)=>b.score-a.score).slice(0,35)};
  await writeFile('artifacts/automation-context-2026-10-27.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
} finally {await store.close();}
