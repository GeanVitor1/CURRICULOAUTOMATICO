import {createHash,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {eq} from '../server/storage-types';
const {store,operatorEmail}=await operatorStore();
const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
const origin='https://curriculoautomatico.vercel.app';
let sessionCreated=false;
try{
 const [owner]=await store.select('users',{where:eq('email',operatorEmail),columns:['id','email']});
 if(!owner||owner.email!==operatorEmail)throw Error('Operator account required');
 await store.insert('sessions',{token:hash,userId:owner.id,expiresAt:new Date(Date.now()+10*60_000),googleAuthenticatedAt:null});
 sessionCreated=true;
 const headers={Origin:origin,'X-Orbita-Request':'1',Cookie:`orbita_session=${token}`};
 if(process.argv.includes('--verify-source-budget-policy')){
  const response=await fetch(origin+'/api/sources',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({type:'lever',board:'globalti',company:'Global TI',enabled:false}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  // An older release could accept the inactive source. Remove only that probe,
  // never any pre-existing source or application, before reporting the failure.
  if(response.ok&&typeof result.id==='string'&&/^[a-f0-9-]{36}$/.test(result.id)){
   const cleanup=await fetch(origin+'/api/sources/'+result.id,{method:'DELETE',headers,signal:AbortSignal.timeout(30000)});
   if(!cleanup.ok)throw Error('Inactive source probe requires cleanup');
  }
  if(response.status!==400||!String(result.error||'').includes('retirada da automa'))throw Error('Removed source policy is not active in production');
  const billingResponse=await fetch(origin+'/api/billing',{headers,signal:AbortSignal.timeout(30000)});
  if(!billingResponse.ok)throw Error('Unable to verify account plan');
  const billing=await billingResponse.json();
  const evidence={at:new Date().toISOString(),origin,removedSourceRejected:true,status:response.status,plan:billing.plan,dailyLimit:billing.dailyLimit,usedToday:billing.usedToday,remainingToday:billing.remainingToday,discoveryStarted:false,employerRequests:0,portalCredentialsTransferred:false};
  await writeFile('artifacts/source-budget-production-2026-10-29.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
 }
 if(process.argv.includes('--extension-context')){
  const checks=[];
  for(const portal of ['gupy','infojobs','glassdoor','linkedin']){
   const response=await fetch(`${origin}/api/connections/browser-extension-context?portal=${portal}`,{headers,signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error(`Extension context ${portal} HTTP ${response.status}`);
   const context=await response.json();
   const expectedAvailable=true;
   if(context.portal!==portal||context.account?.id!==owner.id||context.available!==expectedAvailable)throw Error(`Extension context ${portal} availability or account mismatch`);
   if(!expectedAvailable&&!context.unavailableReason)throw Error('Suspended connector must explain its state');
   if(portal==='linkedin'&&(context.mode!=='local-browser'||context.sessionRetest||!context.notice))throw Error('LinkedIn must use local browser verification without cloud session reuse');
   checks.push({portal,available:context.available,sameAuthenticatedAccount:true,...(portal==='linkedin'?{mode:context.mode,noticePresent:true}:{} )});
  }
  const evidence={at:new Date().toISOString(),checks};
  await writeFile('artifacts/browser-connectors-account-verification-2026-10-27.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }
 if(process.argv.includes('--verify-draft')){
  const applicationId=process.argv.find(arg=>arg.startsWith('--application='))?.slice(14);
  if(!applicationId||!/^[a-f0-9-]{36}$/.test(applicationId))throw Error('Application UUID required');
  const r=await fetch(`${origin}/api/applications/${applicationId}/verify-draft`,{method:'POST',headers,signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw Error(`Draft verification HTTP ${r.status}`);
  const result={at:new Date().toISOString(),applicationId,entryPoint:'project read-only verification queue',result:await r.json()};
  await writeFile(`artifacts/owner-draft-verification-${Date.now()}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
 if(process.argv.includes('--connections')){
  const r=await fetch(`${origin}/api/automation/sites`,{headers,signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw Error(`Connections HTTP ${r.status}`);
  const result=await r.json();console.log(JSON.stringify(result));
 }
 if(process.argv.includes('--verify-linkedin-suspension')){
  // Empty state cannot pass the previous session schema either. This probe
  // carries no portal credentials and must never reach a provider browser.
  const response=await fetch(origin+'/api/connections/linkedin/browser-session',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({authorizeSessionTransfer:true,expectedUserId:owner.id,state:{cookies:[],origins:[]}}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(response.status!==400||!result.error?.includes('temporariamente suspensa'))throw Error('LinkedIn transfer suspension was not enforced');
  console.log(JSON.stringify({at:new Date().toISOString(),portal:'linkedin',transferBlocked:true,status:response.status,portalCredentialsSent:false}));
 }
 if(process.argv.includes('--verify-linkedin-retest')){
  const response=await fetch(origin+'/api/connections/linkedin/browser-session',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({authorizeSessionTransfer:true,expectedUserId:owner.id,state:{cookies:[],origins:[]}}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(response.status!==400||!result.error?.includes('Nenhuma sessão'))throw Error('LinkedIn retest did not reach normal empty-state validation');
  console.log(JSON.stringify({at:new Date().toISOString(),portal:'linkedin',retestReachesNormalValidation:true,emptyStateRejected:true,portalCredentialsSent:false}));
 }
 if(process.argv.includes('--verify-linkedin-retest-runtime')){
  const response=await fetch(origin+'/api/connections/linkedin/check-runtime',{method:'POST',headers,signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Retest runtime HTTP ${response.status}`);
  const result=await response.json();if(result.sessionRetestAllowed!==true)throw Error('Private browser did not receive the authorized retest setting');
  console.log(JSON.stringify({at:new Date().toISOString(),privateBrowserRetestAllowed:true,hasActiveViewer:result.hasActiveViewer,portalCredentialsSent:false,providerNavigationPerformed:false}));
 }
 if(process.argv.includes('--process')){
  let jobId=process.argv.find(arg=>arg.startsWith('--job='))?.slice(6);
  const applicationId=process.argv.find(arg=>arg.startsWith('--application='))?.slice(14);
  if(applicationId){
   const snapshot=await fetch(`${origin}/api/workspace`,{headers,signal:AbortSignal.timeout(55000)});
   if(!snapshot.ok)throw Error(`Workspace HTTP ${snapshot.status}`);
   const workspace=await snapshot.json();
   jobId=workspace.applications.find((a:any)=>a.id===applicationId)?.jobId;
   if(!jobId)throw Error('Application not found in operator workspace');
  }
  const r=await fetch(`${origin}/api/routine/process`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(jobId?{jobId}:{}),signal:AbortSignal.timeout(185000)});
  if(!r.ok)throw Error(`Routine processing HTTP ${r.status}`);
  const result={at:new Date().toISOString(),entryPoint:'/api/routine/process',executor:'project production worker',jobId,result:await r.json()};
  await writeFile(`artifacts/owner-automation-resume-${Date.now()}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }
 if(process.argv.includes('--inspect-progress')){
  const r=await fetch(`${origin}/api/workspace`,{headers,signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw Error(`Workspace HTTP ${r.status}`);
  const w=await r.json(),day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  const result={at:new Date().toISOString(),routine:{enabled:w.routine.enabled,mode:w.routine.mode,destinationPolicy:w.routine.destinationPolicy,progress:w.routine.progress},
   applications:w.applications.filter((a:any)=>a.attempts?.some((t:any)=>new Date(t.startedAt).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})===day)||a.status==='Aguardando aprovação').map((a:any)=>({
    id:a.id,title:w.jobs.find((j:any)=>j.id===a.jobId)?.title,company:w.jobs.find((j:any)=>j.id===a.jobId)?.company,status:a.status,
    missingQuestions:a.missingQuestions,questionOptions:a.questionOptions,last:a.history.slice(-3),resumeState:a.resumeState,attempts:a.attempts,receiptPresent:!!a.receipt,
   }))};
  await writeFile(`artifacts/owner-submission-progress-${Date.now()}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
 if(process.argv.includes('--apply')){
  const r=await fetch(`${origin}/api/discover`,{method:'POST',headers,signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw Error(`Discovery HTTP ${r.status}`);
  const task=await r.json(),result={at:new Date().toISOString(),entryPoint:'/api/discover',executor:'project production worker',task};
  await writeFile(`artifacts/owner-automation-trigger-${Date.now()}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }
}finally{if(sessionCreated)await store.delete('sessions',eq('token',hash));await store.close();}
