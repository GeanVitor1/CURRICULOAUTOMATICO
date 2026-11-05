import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {chromium,type Browser} from 'playwright';
import type {FastifyInstance} from 'fastify';
import {createWorkspace} from '../server/workspace';
import {confirmCandidateDetails} from './fixtures/candidate-details';import {resumePdf} from './pdf-fixture';
const queue=vi.hoisted(()=>({send:vi.fn(),messages:new Map<string,{topic:string;payload:any;messageId:string}>()}));
vi.mock('@vercel/queue',()=>({send:queue.send,QueueClient:class{handleNodeCallback(callback:unknown){return callback;}}}));
vi.mock('../server/automation-runtime',async original=>({...await original<typeof import('../server/automation-runtime')>(),vercelQueueEnabled:()=>true}));
vi.mock('../server/public-web',async original=>({...await original<typeof import('../server/public-web')>(),readPublicPage:vi.fn()}));
const publication='https://jobs.quickin.io/qaemployer/jobs/6ad64c6582963200138f28c0',apply=publication+'/apply',api='https://api.quickin.io/public/692a0e88fa9dcb00134dc379';
const title='Desenvolvedor .NET Júnior';
const schema=[{name:'name',type:'short_text',label:'Nome completo',required:true},{name:'email',type:'email',label:'E-mail',required:true},{name:'phones',type:'array',label:'Telefone',required:true},{name:'salary',type:'number',label:'Pretensão salarial',required:true},{name:'cpf',type:'short_text',label:'CPF',required:true},{name:'resume_media_id',type:'media',label:'Currículo',required:true}];
let directory='',app:FastifyInstance,cookie='',workspaceId='',originalId='',originalAttemptId='',posting:any,httpStatus=200;
let db:typeof import('../server/db'),worker:any,browsers:Browser[]=[],writes:string[]=[],transmitted:any[]=[];
const launch=chromium.launch.bind(chromium);
const headers=()=>({cookie,origin:'http://127.0.0.1:5173','x-orbita-request':'1'});
const request=(path:string,payload:Record<string,unknown>={})=>app.inject({method:'POST',url:`/api/applications/${originalId}/retry/${path}`,headers:headers(),payload});
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'empregatos-recovery-worker-'));
 vi.stubEnv('DATA_DIR',directory);vi.stubEnv('NODE_ENV','test');vi.stubEnv('DATABASE_PROVIDER','');vi.stubEnv('DATABASE_URL','');vi.stubEnv('REDIS_URL','');vi.stubEnv('VERCEL','');
 db=await import('../server/db');app=await(await import('../server/app')).buildApp();worker=(await import('../server/vercel-submission-worker')).default;
 const account=await app.inject({method:'POST',url:'/api/auth/register',headers:headers(),payload:{name:'Pessoa QA Fictícia',email:'recovery-qa@example.test',password:'Controlled-recovery-123'}});
 expect(account.statusCode).toBe(200);cookie=String(account.headers['set-cookie']).split(';')[0];workspaceId=account.json().id+':live';
},60000);
beforeEach(async()=>{
 vi.stubEnv('APPLICATION_WEBHOOK_AUTHORIZED','false');vi.stubEnv('ATS_BROWSER_AUTHORIZED','quickin:qaemployer');vi.stubEnv('ATS_EXECUTION_LOCAL','true');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','');
 queue.messages.clear();queue.send.mockReset().mockImplementation(async(topic,payload,options)=>{let message=queue.messages.get(options.idempotencyKey);if(!message){message={topic,payload:structuredClone(payload),messageId:'controlled-'+queue.messages.size};queue.messages.set(options.idempotencyKey,message);}return{messageId:message.messageId};});
 writes=[];transmitted=[];httpStatus=200;
 posting={'@type':'JobPosting',url:publication,title,hiringOrganization:{name:'Empresa QA'},description:'Desenvolvimento de sistemas em C# .NET SQL Server Angular e Git. Contratação CLT. Trabalho remoto no Brasil. Construção e manutenção de APIs REST.',datePosted:new Date().toISOString(),jobLocationType:'TELECOMMUTE',applicantLocationRequirements:{name:'Brasil'}};
 const web=await import('../server/public-web');vi.mocked(web.readPublicPage).mockImplementation(async url=>({url,status:200,contentType:'text/html',html:url===publication?`<script type="application/ld+json">${JSON.stringify(posting)}</script><a href="${apply}">Candidatar-se</a>`:JSON.stringify(url.includes('careersites')?{slug:'qaemployer',name:'Empresa QA',account_id:'692a0e88fa9dcb00134dc379'}:schema)}));
 // Actual ATS execution and Quickin code run in Chromium. Every browser request
 // is intercepted at page scope, before the context's production network guard.
 vi.spyOn(chromium,'launch').mockImplementation(async options=>{
  const browser=await launch(options);browsers.push(browser);const newContext=browser.newContext.bind(browser);
  vi.spyOn(browser,'newContext').mockImplementation(async options=>{const context=await newContext(options),newPage=context.newPage.bind(context);
   vi.spyOn(context,'newPage').mockImplementation(async()=>{const page=await newPage();await page.route('**/*',async route=>{
    const r=route.request();if(r.method()==='GET'&&r.url()===apply)return route.fulfill({contentType:'text/html; charset=utf-8',body:`<script type="application/ld+json">${JSON.stringify(posting)}</script><h1>${title} Empresa QA</h1><form><label>Nome completo<input name="name" required></label><label>E-mail<input name="email" type="email" required></label><label>Telefone<input type="tel" required></label><button type="button" class="iti__selected-country" aria-label="Brazil (+55)"></button><label>Pretensão salarial<input name="salary" type="number" required></label><label>CPF<input name="cpf" required></label><input type="file"><button type="submit">Enviar candidatura</button></form><script>
     let media;document.querySelector('input[type=file]').addEventListener('change',async()=>{const r=await fetch('${api}/media/multipart',{method:'POST',body:'fictitious-pdf-only'});media=await r.json();});
     document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,body={name:f.name.value,email:f.email.value,phones:['+55'+f.querySelector('[type=tel]').value],salary:Number(f.salary.value),cpf:f.cpf.value,resume_media_id:media,job_id:'6ad64c6582963200138f28c0',origin:'applied'};const r=await fetch('${api}/apply',{method:'POST',body:JSON.stringify(body)});if(r.ok)document.body.insertAdjacentHTML('beforeend','<p>Candidatura enviada!</p>');});</script>`});
    if(r.method()==='POST'&&[api+'/media/multipart',api+'/apply'].includes(r.url())){writes.push(r.url());if(r.url().endsWith('/apply'))transmitted.push(r.postDataJSON());return route.fulfill({status:r.url().endsWith('/apply')?httpStatus:200,contentType:'application/json',body:r.url().endsWith('/apply')?(httpStatus===200?'{}':JSON.stringify({name:'ValidationError',errors:{cpf:{message:'PRIVATE_SENTINEL'}}})):JSON.stringify({_id:'controlled-media'})});}
    return route.abort();
   });return page;});return context;});return browser;
 });
 const {jobFromQuickinPage}=await import('../server/quickin-board'),{archiveResumeFile}=await import('../server/resume-storage'),{TARGETS_VERSION}=await import('../server/resume-targets');
 const page=await web.readPublicPage(publication),job=jobFromQuickinPage({id:'qa',type:'manual',board:'qaemployer',company:'Empresa QA',enabled:true,discovery:true,application:true,status:''},page)!;
 originalId=randomUUID();originalAttemptId=randomUUID();
 await db.mutateWorkspace(workspaceId,async(w,tx)=>{
  Object.assign(w,createWorkspace('Pessoa QA Fictícia','recovery-qa@example.test'));confirmCandidateDetails(w);w.profile.confirmed=true;w.profile.skills=['C#','.NET','SQL Server','Angular','Git'];w.profile.level='Júnior';
  w.profile.approvedAnswers=[{id:'qa-cpf',question:'CPF',aliases:[],value:'52998224725',confirmedAt:new Date().toISOString(),destinationUrl:apply}];
  w.filters={...w.filters,titles:['Desenvolvedor .NET'],modalities:['Remoto'],contracts:['CLT'],ageDays:14,dateKnownOnly:true};w.routine.enabled=false;w.routine.mode='approval';w.routine.minScore=70;w.routine.dailyLimit=5;
  const resumeId=randomUUID();w.resumes=[{id:resumeId,name:'qa.pdf',uploadedAt:new Date().toISOString(),text:'Currículo FICTÍCIO C# .NET SQL Server Angular Git',skills:w.profile.skills,approved:true,analysis:'Fictício',targetsVersion:TARGETS_VERSION,storedFile:archiveResumeFile(resumePdf(),'.pdf')}];w.jobs=[job];
  w.applications=[{id:originalId,jobId:job.id,resumeId,status:'Resultado desconhecido',receipt:null,createdAt:'2026-10-23T13:51:00Z',updatedAt:'2026-10-23T13:53:00Z',mode:'automatic',note:'Somente QA',destinationUrl:apply,history:[{at:'2026-10-23T13:52:00Z',actor:'Sistema',message:'Envio iniciado.'}],attempts:[{id:originalAttemptId,startedAt:'2026-10-23T13:52:00Z',finishedAt:'2026-10-23T13:53:00Z',outcome:'unknown',executor:'ats_browser',origin:'user_triggered_automation',correlationId:'qa-old'}]}];
  await tx.delete('applicationUsage',{field:'userId',op:'==',value:workspaceId.split(':')[0]});await tx.insert('applicationUsage',{applicationId:originalId,userId:workspaceId.split(':')[0],day:'2026-10-23'});
 });
 const {reconcileEmployerNonReceipt,candidateEmailHash}=await import('../server/application-reconciliation');
 await db.mutateWorkspace(workspaceId,w=>reconcileEmployerNonReceipt(w,{applicationId:originalId,attemptId:originalAttemptId,startedAt:'2026-10-23T13:52:00Z',publicationUrl:publication,candidateEmailSha256:candidateEmailHash(w.profile.email),threadId:'1a16937d1e63856d',messageId:'1a16a33ce23f137c',replyAt:'2026-10-23T19:18:57Z',evidenceSha256:'a'.repeat(64)}));
});
afterEach(async()=>{await Promise.all(browsers.map(b=>b.close()));browsers=[];vi.restoreAllMocks();});
afterAll(async()=>{await app?.close();await db?.closeDb();vi.unstubAllEnvs();if(directory.startsWith(join(tmpdir(),'empregatos-recovery-worker-')))await rm(directory,{recursive:true,force:true});});
it.each([200,400])('recovers through API, Queue transport double, actual worker and Quickin; concurrent delivery and replay; HTTP %s',async status=>{
 httpStatus=status;const before=(await db.readWorkspace(workspaceId))!.applications[0],review=await request('review');
 expect(review.statusCode).toBe(200);expect(review.json().ready,JSON.stringify(review.json())).toBe(true);expect(writes).toEqual([]);
 const fingerprint=review.json().review.fingerprint;
 const authorized=await Promise.all([request('authorize',{confirmation:true,fingerprint}),request('authorize',{confirmation:true,fingerprint})]);
 expect(authorized.map(r=>r.statusCode)).toEqual([200,200]);const childId=authorized[0].json().applicationId;expect(authorized[1].json().applicationId).toBe(childId);expect(childId).not.toBe(originalId);
 expect(queue.messages.size).toBe(1);const message=[...queue.messages.values()][0];expect(message.topic).toBe('empregatos-submissions');expect(message.payload).toEqual({workspaceId,applicationId:childId});
 const invoke=(deliveryCount:number)=>worker(message.payload,{messageId:message.messageId,deliveryCount,topicName:message.topic,consumerGroup:'controlled-submission-worker'});
 // Failure after the result was committed must be recovered on redelivery.
 const cycle=await import('../server/automatic-cycle');vi.spyOn(cycle,'continueAutomaticCycle').mockRejectedValueOnce(new Error('Controlled continuation interruption'));
 await Promise.allSettled([invoke(1),invoke(2)]);await invoke(3);
 const w=(await db.readWorkspace(workspaceId))!,original=w.applications.find(a=>a.id===originalId)!,child=w.applications.find(a=>a.id===childId)!;
 expect(w.applications.filter(a=>a.retryOf?.applicationId===originalId)).toHaveLength(1);expect(original.attempts).toEqual(before.attempts);expect(original.reconciliations).toEqual(before.reconciliations);expect(original.history.slice(0,before.history.length)).toEqual(before.history);
 expect(original.retryEvaluation).toMatchObject({ready:true,reconciliationId:original.reconciliations![0].id,attemptId:originalAttemptId});
 expect(child.attempts).toHaveLength(1);expect(child.attempts![0]).toMatchObject({previousAttemptId:originalAttemptId,reconciliationId:original.reconciliations![0].id,outcome:status===200?'confirmed':'unknown',diagnostic:{httpStatus:status}});
 expect(writes).toEqual([api+'/media/multipart',api+'/apply']);expect(transmitted[0]).toMatchObject({email:'recovery-qa@example.test',cpf:'52998224725',phones:['+5511999990000'],salary:3500,resume_media_id:{_id:'controlled-media'},job_id:'6ad64c6582963200138f28c0',origin:'applied'});
 expect(child.status).toBe(status===200?'Enviada':'Resultado desconhecido');if(status===200){expect(child.receipt).toMatch(/^Quickin: Candidatura enviada!/);expect(child.submittedAt).toBeTruthy();expect(child.verification?.method).toBe('portal_confirmation');}else{expect(child.receipt).toBeNull();expect(child.submittedAt).toBeFalsy();expect(JSON.stringify(child)).not.toContain('PRIVATE_SENTINEL');}
 expect(w.workerEvents?.some(e=>e.state==='received'&&e.subjectId===childId)).toBe(true);expect(w.workerEvents?.some(e=>e.deliveryCount===3&&e.state==='completed')).toBe(true);
 const usage=await db.store.select('applicationUsage');expect(usage.map(u=>u.applicationId).sort()).toEqual([originalId,childId].sort());
 expect((await request('authorize',{confirmation:true,fingerprint})).statusCode).toBe(400);await invoke(4);expect(writes).toHaveLength(2);
 console.log(JSON.stringify({controlled:true,httpStatus:status,queueTransport:'in-memory test double; production dispatch and worker code',realEmployerTransmissions:0,childCount:1,attemptCount:1,interceptedUploadCount:1,interceptedApplyCount:1,deliveries:4,preservedOriginal:true,reservations:usage.length,result:child.status,receiptPersisted:!!child.receipt}));
},60000);

