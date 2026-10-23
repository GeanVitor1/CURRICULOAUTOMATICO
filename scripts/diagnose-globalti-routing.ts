import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {matchesSelectedSites,matchesObjectiveFilters,analyze} from '../server/engine';
import {submissionRoute} from '../server/submission-routing';
import {opportunityKey} from '../server/job-identity';
import {writeFile} from 'node:fs/promises';
const {store,operatorEmail}=await operatorStore();
try{
 const [user]=await store.select('users',{where:eq('email',operatorEmail)}),[row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
 const w=row.data,job=w.jobs.find(j=>j.url==='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0');if(!job)throw Error('Routine-discovered posting required');
 process.env.ATS_BROWSER_AUTHORIZED='quickin:globalti';process.env.PORTAL_CLOUD_SNAPSHOT_ID='configured-in-production';
 const match=analyze(job,w.profile,w.filters),resume=w.resumes.find(r=>r.id===w.interview?.answers.resumeId&&r.approved);
 const report={at:new Date().toISOString(),readOnly:true,jobId:job.id,sourceAllowed:matchesSelectedSites(job,w),objectiveFiltersPassed:matchesObjectiveFilters(job,w.profile,w.filters),resumeTargetsPassed:!!resume&&matchesObjectiveFilters(job,w.profile,{...w.filters,titles:resume.targetTitles||w.filters.titles}),score:match.score,minimum:w.routine.minScore,blockers:match.blockers,route:submissionRoute(w,job,[])?.method,excluded:w.submissionExclusions?.includes(opportunityKey(job))||false,approvedOriginalResume:!!resume?.originalFileAvailable,interviewComplete:!!w.interview?.completed,applicationAlreadyExists:w.applications.some(a=>a.jobId===job.id)};
 await writeFile('artifacts/globalti-routing-recovery-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
