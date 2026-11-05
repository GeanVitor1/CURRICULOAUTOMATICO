import {beforeAll,afterAll,it,expect} from 'vitest';
import {chromium,type Browser} from 'playwright';
import {inspectGupyDraft} from '../server/gupy-draft-verification';
import type {PortalApplication} from '../server/portal-application';
import {createWorkspace} from '../server/workspace';
import {recoverableGupyDraft,recordVerifiedGupyDraft} from '../server/gupy-draft-recovery';
import {pausedBeforeSubmission,dailySubmissionAttempts} from '../server/submission-attempts';
const title='Analista administrativo',url='https://fixture.gupy.io/jobs/12345';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});});
afterAll(async()=>{await browser.close();});
it.each(['draft','progress','other_tenant','other_job','completed'])('requires account progress zero and the exact native curriculum before recovering: %s',async scenario=>{
 const context=await browser.newContext(),page=await context.newPage();let transmissions=0;
 await page.route('**/*',async route=>{
  if(route.request().method()!=='GET')transmissions++;
  const target=new URL(route.request().url());
  if(target.hostname==='portal.gupy.io')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>Minhas candidaturas</h1><button role="tab">Em andamento</button><h3 id="job-name-777">${title}</h3><div id="application-progress-777" aria-label="Seu progresso nessa candidatura é ${scenario==='progress'?1:0} de 6.">Progresso</div><a href="https://${scenario==='other_tenant'?'another':'fixture'}.gupy.io/candidates/applications/777">Ver andamento</a>`});
  return route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>${title}</h1><a href="/jobs/${scenario==='other_job'?'99999':'12345'}">clique aqui</a><button id="expandable-card-1" onclick="fetch('/never-submit',{method:'POST'})">${scenario==='completed'?'Ver':'Começar'}</button>`});
 });
 try{
  const input={applicationId:'fixture',job:{title,url,company:'Fixture'},profile:{},resume:{name:'approved'}} as PortalApplication;
  const proof=await inspectGupyDraft(page,input,'resume');
  expect(!!proof,`Last fixture page: ${page.url()} ${await page.locator('body').innerText()}`).toBe(scenario==='draft');
  if(proof)expect(proof).toMatchObject({nativeApplicationId:'777',resumeId:'resume',destinationUrl:url});
  expect(transmissions).toBe(0);
 }finally{await context.close();}
});

function uncertain(){
 const w=createWorkspace('QA','qa@example.test');w.demo=false;w.routine.enabled=true;w.routine.mode='automatic';
 const at=new Date(Date.now()-300000).toISOString();
 w.jobs=[{id:'job',title,url} as any];
 w.applications=[{id:'application',jobId:'job',resumeId:'resume',status:'Resultado desconhecido',receipt:null,mode:'automatic',history:[{at,actor:'Sistema',message:'Envio iniciado.'}],attempts:[{id:'attempt',outcome:'unknown',executor:'browser',startedAt:at,finishedAt:at}],createdAt:at,updatedAt:at} as any];
 return w;
}
it('records a fresh exact draft proof without changing the original unknown attempt or releasing its quota',()=>{
 const w=uncertain(),proof={nativeApplicationId:'777',resumeId:'resume',destinationUrl:url,continuationUrl:'https://fixture.gupy.io/candidates/applications/777',observedAt:new Date().toISOString()};
 const before=JSON.stringify(w.applications[0].attempts);
 recordVerifiedGupyDraft(w,'application','attempt',proof);
 expect(JSON.stringify(w.applications[0].attempts)).toBe(before);
 expect(w.applications[0].status).toBe('Requer ação manual');
 expect(w.applications[0].receipt).toBeNull();
 expect(pausedBeforeSubmission(w.applications[0])).toBe(false);
 expect(dailySubmissionAttempts(w)).toBe(1);
 w.applications[0].attempts!.push({...w.applications[0].attempts![0],id:'later-pause',outcome:'pre_submit_blocked',finishedAt:new Date().toISOString()});
 expect(pausedBeforeSubmission(w.applications[0])).toBe(false);
 expect(dailySubmissionAttempts(w)).toBe(1);
});
it.each(['receipt','concurrent_attempt','other_destination','stale_proof','limit'])('cannot authorize recovery with mismatched or superseded evidence: %s',scenario=>{
 const w=uncertain(),a=w.applications[0],proof={nativeApplicationId:'777',resumeId:'resume',destinationUrl:url,continuationUrl:'https://fixture.gupy.io/candidates/applications/777',observedAt:new Date().toISOString()};
 if(scenario==='receipt')a.receipt='already-confirmed';
 if(scenario==='concurrent_attempt')a.attempts![0].id='newer-attempt';
 if(scenario==='other_destination')proof.destinationUrl='https://fixture.gupy.io/jobs/99999';
 if(scenario==='stale_proof')proof.observedAt=new Date(Date.now()-300000).toISOString();
 if(scenario==='limit')a.verifiedGupyDrafts=Array.from({length:2},()=>({attemptId:'older',at:new Date().toISOString(),nativeApplicationId:'777',continuationUrl:proof.continuationUrl}));
 expect(()=>recordVerifiedGupyDraft(w,'application','attempt',proof)).toThrow();
 expect(a.status).toBe('Resultado desconhecido');
});
