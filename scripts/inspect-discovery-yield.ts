import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)});
 const [r]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const w=r.data;
 const report={at:new Date().toISOString(),readOnly:true,profile:{headline:w.profile.headline,level:w.profile.level,skills:w.profile.skills,years:w.profile.years,acceptsPj:w.profile.acceptsPj},filters:w.filters,sources:w.sources.map(s=>({id:s.id,type:s.type,board:s.board,company:s.company,enabled:s.enabled,discovery:s.discovery,status:s.status,lastError:s.lastError})),runs:w.runs.slice(0,4),routine:w.routine,applications:w.applications.map(a=>({id:a.id,jobId:a.jobId,status:a.status,receiptPresent:!!a.receipt})),approvedAnswerQuestions:w.profile.approvedAnswers?.map(a=>({question:a.question,destinationUrl:a.destinationUrl,approved:!!a.confirmedAt}))};
 await writeFile('.data/discovery-yield-profile.private.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{await store.close();}
