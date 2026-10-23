import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {analyze,eligibleForDestinationResearch} from '../server/engine';
const ids=['abadeed5-dc46-45da-b48b-b91511bc8a57','7e98745c-6905-4b61-98f5-4d64869b9088'];
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)}),[r]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,personalStatusInferred:false,jobs:r.data.jobs.filter(j=>ids.includes(j.id)).map(j=>{const m=analyze(j,r.data.profile,r.data.filters);return {id:j.id,title:j.title,url:j.url,previousStoredScore:j.match.score,recomputedScore:m.score,blockers:m.blockers,researchEligible:eligibleForDestinationResearch(j,r.data),existingApplications:r.data.applications.filter(a=>a.jobId===j.id).map(a=>({id:a.id,status:a.status,attemptIds:a.attempts?.map(t=>t.id)||[],receiptPresent:!!a.receipt}))};})};
 await writeFile('artifacts/affirmative-eligibility-regression-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
