import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {quickinFieldPlan} from '../server/quickin-form';
const value=process.env.GLOBALTI_APPROVED_CPF;
if(!value||!/^\d{11}$/.test(value))throw Error('Exact user-provided answer is required; never print its value');
const destinationUrl='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0/apply';
const schema=JSON.parse(await readFile('artifacts/quickin-globalti-form-schema-2026-10-23.json','utf8'));
const question=schema.find((f:any)=>f.name==='job_question_69a9a48967f6d000131a9530')?.label;
if(!question)throw Error('Inspected CPF question missing');
const {store,operatorEmail}=await operatorStore();
try{
 const [user]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
 const result=await store.transaction(async tx=>{
  const [current]=await tx.select('workspaces',{where:eq('id',row.id),lock:true}),w=current.data;
  const unchanged=JSON.stringify({filters:w.filters,applications:w.applications,routine:w.routine});
  w.profile.approvedAnswers=(w.profile.approvedAnswers||[]).filter(a=>!(a.question===question&&a.destinationUrl===destinationUrl));
  w.profile.approvedAnswers.push({id:randomUUID(),question,aliases:[],value,confirmedAt:new Date().toISOString(),destinationUrl,destinationOrigin:new URL(destinationUrl).origin});
  const plan=quickinFieldPlan(schema,w.profile,destinationUrl);
  if(plan.missing.length)throw Error('Required answers remain missing; no update applied');
  if(unchanged!==JSON.stringify({filters:w.filters,applications:w.applications,routine:w.routine}))throw Error('Unexpected change outside approved answer');
  await tx.update('workspaces',{data:w},eq('id',row.id));
  return {at:new Date().toISOString(),destinationUrl,approvedExactDestination:true,requiredQuestionsReady:true,cpfValueOmitted:true,filtersHistoryRoutineUnchanged:true};
 });
 await writeFile('artifacts/quickin-scoped-answer-2026-10-23.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await store.close();}
