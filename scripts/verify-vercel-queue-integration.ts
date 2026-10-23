import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
import {QueueClient} from '@vercel/queue';
import {operatorStore} from './operator-firestore';
import {createWorkspace} from '../server/workspace';
import {applyCandidateDetails} from '../server/candidate-details';
import {resumePdf} from '../tests/pdf-fixture';
import {archiveResumeFile} from '../server/resume-storage';
import {and,eq} from '../server/storage-types';
import {confirmedAutomaticApplication} from '../server/automation-trace';
import type {Job,Application} from '../shared/types';
const qa=JSON.parse(await readFile('.data/queue-integration-private.json','utf8'));
const full=process.argv.includes('--full');
if(full){qa.workspaceId=qa.discoveryWorkspaceId;qa.userId=qa.discoveryUserId;}
if(!qa.workspaceId?.startsWith(qa.userId+':')||!new URL(qa.origin).hostname.endsWith('.vercel.run'))throw Error('Invalid isolated test state');
const {store}=await operatorStore();
const output=full?'artifacts/vercel-queues-full-cycle-2026-10-23.json':'artifacts/vercel-queues-integration-2026-10-23.json';
try {
 if(process.argv.includes('--seed')){
  if((await store.select('users',{where:eq('id',qa.userId)})).length)throw Error('Synthetic user already exists');
  process.env.ENCRYPTION_KEY=qa.encryptionKey;
  const w=createWorkspace('Pessoa Queues QA Fictícia','queues-qa@example.test');
  applyCandidateDetails(w,{phone:'11999990000',location:'São Paulo, SP',years:0,salaryDesired:3000,acceptsPj:true,compensationDisclosure:'prefer_not_to_say',confirmation:true});
  w.profile={...w.profile,headline:'Desenvolvedor React',skills:['React','TypeScript','Git'],years:0,level:'Júnior',education:'Ensino médio completo',confirmed:true};
  w.filters.titles=['Desenvolvedor React'];w.filters.dateKnownOnly=true;
  w.routine={...w.routine,enabled:true,mode:'automatic',destinationPolicy:'official',dailyLimit:5,minScore:0,nextRun:null};
  const at=new Date().toISOString(),resumeId=randomUUID(),runId=randomUUID();
  w.resumes=[{id:resumeId,name:'qa-ficticio.pdf',uploadedAt:at,text:'React TypeScript Git. Ensino médio completo.',skills:['React','TypeScript','Git'],approved:true,analysis:'Fictício',targetsConfirmed:true,targetTitles:['Desenvolvedor React'],storedFile:archiveResumeFile(resumePdf(),'.pdf')}];
  w.runs=[{id:runId,at,status:'completed',origin:'user_triggered_automation',discovered:4,processed:0,errors:[],message:'Somente destinos controlados; inventário de teste.'}];
  w.jobs=Array.from({length:4},(_,i)=>{
   const url=`${qa.origin}/${qa.secret}/job/${i}`;
   return {id:randomUUID(),url,title:`Desenvolvedor React QA ${i}`,company:`Empregatos Queues QA ${i}`,source:'Integração controlada Queues',description:'Desenvolvedor React júnior para aplicações web com TypeScript, Git e APIs REST. A equipe escreve testes e mantém componentes acessíveis. Ensino médio completo e projetos práticos são aceitos.',location:'Brasil',modality:'Remoto',level:'Júnior',contract:'CLT',salaryMin:3000,salaryMax:null,currency:'BRL',skills:['React','TypeScript','Git'],requiredSkills:[],requiredYears:null,publishedAt:at,discoveredAt:at,saved:false,discarded:false,demo:false,origins:[{source:'company',url,id:url}],match:{score:0,strengths:[],gaps:[],blockers:[],matchedSkills:[],missingSkills:[],radar:false,explanation:""},automation:{correlationId:randomUUID(),runId,origin:'user_triggered_automation',events:[{at,stage:'discovery',code:'controlled_publication'}]},destinations:[{id:randomUUID(),url,publicationUrl:url,platform:'company',company:`Empregatos Queues QA ${i}`,state:'verified',formFound:true,method:'browser',confidence:100,verifiedAt:at,expiresAt:new Date(Date.now()+86400000).toISOString(),evidence:['Formulário WP Jobs Board verificado.']}],resolution:{state:'verified',complete:true,checkedAt:at,retryAt:new Date(Date.now()+86400000).toISOString(),consulted:[],matches:[],message:'Destino controlado'}} as Job;
  });
  // Seed just the first preparation. Normal continuation must prepare the rest.
  const j=w.jobs[0],a:Application={id:randomUUID(),jobId:j.id,resumeId,status:'Aguardando aprovação',mode:'automatic',createdAt:at,updatedAt:at,receipt:null,note:'Somente QA',draft:'Currículo fictício QA',history:[{at,actor:'Sistema',message:'Preparação controlada de integração.'}],execution:{correlationId:j.automation!.correlationId,runId,origin:'user_triggered_automation'}};
  w.applications=[a];qa.applicationId=a.id;
  await store.insert('users',{id:qa.userId,name:'Pessoa Queues QA Fictícia',email:'queues-qa@example.test'});
  await store.insert('workspaces',{id:qa.workspaceId,userId:qa.userId,data:w});
  await writeFile('.data/queue-integration-private.json',JSON.stringify(qa));
  console.log(JSON.stringify({seeded:true,fictitiousOnly:true,workspaceId:qa.workspaceId,applicationId:a.id}));
 }else {
  const env=dotenv.parse(await readFile('.env.queue-integration.local'));process.env.VERCEL_OIDC_TOKEN=env.VERCEL_OIDC_TOKEN;
  const deploymentId=process.argv.find(v=>v.startsWith('--deployment='))?.slice(13)||qa.deploymentId;
  if(!deploymentId?.startsWith('dpl_'))throw Error('Explicit test deployment required');
  // dotenv in other modules may set development mode. Explicitly pin the cloud
  // deployment so the SDK cannot dispatch into its local development emulator.
  process.env.NODE_ENV='production';process.env.VERCEL_DEPLOYMENT_ID=deploymentId;
  qa.deploymentId=deploymentId;await writeFile('.data/queue-integration-private.json',JSON.stringify(qa));
  const client=new QueueClient({deploymentId,region:'iad1',token:env.VERCEL_OIDC_TOKEN,
    resolveBaseUrl:region=>new URL(`https://${region}.vercel-queue.com`)});
  const payload={workspaceId:qa.workspaceId,applicationId:qa.applicationId};
  if(process.argv.includes('--publish')){
    const first=await client.send('empregatos-submissions',payload,{idempotencyKey:`qa-integration:${qa.applicationId}`,retentionSeconds:3600});
    const duplicate=await client.send('empregatos-submissions',payload,{idempotencyKey:`qa-integration:${qa.applicationId}`,retentionSeconds:3600});
    await writeFile(output,JSON.stringify({at:new Date().toISOString(),deploymentId,actualVercelQueueTransport:true,fictitiousOnly:true,realEmployerSubmissions:0,publications:[first,duplicate],workspaceId:qa.workspaceId,applicationId:qa.applicationId},null,2));
    console.log(JSON.stringify({published:true,first,duplicate}));
  }else if(process.argv.includes('--redeliver')){
    await client.send('empregatos-submissions',payload,{idempotencyKey:`qa-redelivery:${randomUUID()}`,retentionSeconds:3600});
    console.log(JSON.stringify({replayPublished:true}));
  }else{
    const [row]=await store.select('workspaces',{where:eq('id',qa.workspaceId)}),w=row.data;
    const receiver=await(await fetch(`${qa.origin}/${qa.secret}/status`)).json();
    let before;try{before=JSON.parse(await readFile(output,'utf8'));}catch{before={deploymentId,actualVercelQueueTransport:true,fictitiousOnly:true,realEmployerSubmissions:0,workspaceId:qa.workspaceId};}
    const tasks=await Promise.all((['discoveryTasks','resolutionTasks'] as const).map(async table=>({table,items:(await store.select(table,{where:eq('workspaceId',qa.workspaceId)})).map(t=>({id:t.id,status:t.status,attempts:t.attempts,runId:'runId' in t?t.runId:undefined}))})));
    const report={...before,checkedAt:new Date().toISOString(),receiver,tasks,runs:w.runs,jobs:w.jobs.map(j=>({id:j.id,url:j.url,destinations:j.destinations,trace:j.automation})),applications:w.applications.map(a=>({id:a.id,jobId:a.jobId,status:a.status,receipt:a.receipt,execution:a.execution,attempts:a.attempts,history:a.history})),progress:w.routine.progress,quota:await store.count('applicationUsage',and(eq('userId',qa.userId),eq('day',new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})))),confirmed:w.applications.filter(confirmedAutomaticApplication).length,assertions:{continuedPreparation:w.applications.length===(full?3:4),twoConfirmed:w.applications.filter(confirmedAutomaticApplication).length===2,uncertainNotConfirmed:w.applications.some(a=>a.status==='Resultado desconhecido'&&!a.receipt),noDuplicates:Object.values(receiver.counts).every(n=>n===1),captchaUntouched:!receiver.counts['3']}};
    await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({confirmed:report.confirmed,progress:report.progress,receiver,assertions:report.assertions,statuses:report.applications.map((a:{status:string})=>a.status)}));
  }
 }
}finally{await store.close();}
