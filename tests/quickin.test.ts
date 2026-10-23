import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {quickinFieldPlan,quickinResponseFailure,quickinMediaReference,type QuickinField} from '../server/quickin-form';
import {defaultProfile} from '../shared/types';
import {confirmCandidateDetails} from './fixtures/candidate-details';
import {detectAts,destinationBrowserAllowed} from '../server/ats-registry';
import {atsExecutionHosts} from '../server/ats-network';
import {prepareAutomaticAnswers} from '../server/automatic-answers';
import {createWorkspace} from '../server/workspace';
import {jobFromQuickinPage} from '../server/quickin-board';
import {matchesSelectedSites} from '../server/engine';
import {submissionRoute} from '../server/submission-routing';
const url='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0/apply';
const fields:QuickinField[]=JSON.parse(readFileSync('artifacts/quickin-globalti-form-schema-2026-10-23.json','utf8'));
function profile(){const p={...structuredClone(defaultProfile),confirmed:true,name:'Pessoa QA',email:'qa@example.test'};confirmCandidateDetails({profile:p} as any);return p;}
describe('Quickin public form',()=>{
 it('reuses confirmed headline, state and PJ salary without manufacturing address, seniority or consent',()=>{
  const p=profile();p.headline='Desenvolvedor Full Stack';p.location='Ilhéus, BA';p.acceptsPj=true;
  const extra:QuickinField[]=[{name:'headline',label:'Cargo pretendido',type:'short_text',required:true},{name:'region',label:'Estado/Região',type:'short_text',required:true},{name:'salary',label:'Qual sua expectativa salarial como Prestador(a) ?',type:'short_text',required:true},{name:'address',label:'Endereço',type:'short_text',required:true},{name:'consent',label:'Autorizo o processamento dos meus dados',type:'boolean',required:true}];
  const plan=quickinFieldPlan(extra,p,url);
  expect(plan.answers.map(a=>a.field.name)).toEqual(['headline','region','salary']);
  expect(plan.answers.find(a=>a.field.name==='region')?.value).toBe('BA');
  expect(plan.missing).toEqual(['Endereço','Autorizo o processamento dos meus dados']);
 });
 it('keeps a rejected response uncertain and reports only status, known code and public field labels',()=>{
  const result=quickinResponseFailure(400,{name:'ValidationError',message:'PRIVATE_SENTINEL',errors:{email:{value:'PRIVATE_EMAIL'},'phones.0':{message:'PRIVATE_PHONE'},unexpectedSecret:{value:'PRIVATE_VALUE'}}},fields);
  expect(result.status).toBe('unknown');expect(result.retryable).toBeUndefined();
  expect(result.message).toContain('HTTP 400; ValidationError');expect(result.message).toContain('E-mail; Telefone');
  expect(result.diagnostic).toEqual({provider:'quickin',phase:'application_response',responseKind:'validation_rejection',httpStatus:400,providerCode:'ValidationError',fieldNames:['email','phones']});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|unexpectedSecret/);
 });
 it.each([400,401,403,409,422,429,500,503])('never infers receipt or safe retry from HTTP %s, including provider error codes',status=>{
  const payload={name:status===409?'AlreadyApplied':status===429?'TooManyRequests':'ValidationError',errors:{email:{message:'PRIVATE_VALUE'}}};
  const r=quickinResponseFailure(status,payload,fields);
  expect(r).toMatchObject({status:'unknown',diagnostic:{httpStatus:status,fieldNames:['email'],responseKind:status===400?'validation_rejection':'http_rejection'}});
  expect(r.receipt).toBeUndefined();expect(r.retryable).toBeUndefined();expect(JSON.stringify(r)).not.toContain('PRIVATE_VALUE');
 });
 it('recognizes the public client direct field map without trusting arbitrary provider prose',()=>{
  const r=quickinResponseFailure(400,{email:{message:'PRIVATE_VALUE'},unexpectedSecret:'PRIVATE'},fields);
  expect(r.diagnostic).toMatchObject({responseKind:'validation_rejection',fieldNames:['email']});
  expect(JSON.stringify(r)).not.toMatch(/PRIVATE|unexpectedSecret/);
  expect(quickinResponseFailure(400,{message:'invalid'},fields).diagnostic?.responseKind).toBe('http_rejection');
 });
 it('requires a media reference and refuses successful HTTP bodies containing only error data',()=>{
  for(const body of [null,{},[],{error:'refused'},{_id:''},{_id:123}])expect(quickinMediaReference(body)).toBeUndefined();
  expect(quickinMediaReference({_id:'controlled-media'})).toBe('controlled-media');
 });
 it('rejects empty required answers, malformed email, and ambiguous mandatory boolean before upload',()=>{
  const p=profile();p.email='bad-email';
  expect(quickinFieldPlan(fields,p,url).missing).toContain('E-mail');
  p.name=' ';expect(quickinFieldPlan(fields,p,url).missing).toContain('Nome completo');
  p.approvedAnswers=[{id:'test',question:'Autorizo o processamento?',value:'talvez',aliases:[],confirmedAt:new Date().toISOString(),destinationUrl:url}];
  expect(quickinFieldPlan([{name:'consent',label:'Autorizo o processamento?',type:'boolean',required:true}],p,url).missing).toEqual(['Autorizo o processamento?']);
 });
 it('recognizes a verified official Quickin channel in a completed portal interview without changing selected sites',()=>{
  const inspection=JSON.parse(readFileSync('artifacts/quickin-globalti-form-inspection-2026-10-23.json','utf8'))[0];
  const posting=JSON.parse(inspection.structured[0]),publication=url.slice(0,-6);
  const job=jobFromQuickinPage({id:'quickin-board:globalti',type:'manual',board:'globalti',company:'Global TI',enabled:true,discovery:true,application:true,status:''},{url:publication,status:200,contentType:'text/html',html:`<script type="application/ld+json">${JSON.stringify(posting)}</script><a href="${url}">Candidatar-se</a>`})!;
  expect(job.origins).toEqual([{source:'quickin',url:publication,id:'globalti:6ad64c6582963200138f28c0'}]);
  const w=createWorkspace('Pessoa QA','qa@example.test');w.routine.destinationPolicy='official';
  w.interview={completed:true,answers:{sites:['gupy']}} as any;
  const before=JSON.stringify(w.interview);
  expect(matchesSelectedSites(job,w)).toBe(true);
  // A posting already persisted before the source-origin fix is recoverable
  // from its exact verified publication/form binding.
  job.origins=[];expect(matchesSelectedSites(job,w)).toBe(true);
  const grant=process.env.ATS_BROWSER_AUTHORIZED,snapshot=process.env.PORTAL_CLOUD_SNAPSHOT_ID;
  try{process.env.ATS_BROWSER_AUTHORIZED='quickin:globalti';process.env.PORTAL_CLOUD_SNAPSHOT_ID='qa-snapshot';
   expect(submissionRoute(w,job,[])?.method).toBe('ats_browser');
   delete process.env.ATS_BROWSER_AUTHORIZED;expect(submissionRoute(w,job,[])).toBeNull();
  }finally{if(grant===undefined)delete process.env.ATS_BROWSER_AUTHORIZED;else process.env.ATS_BROWSER_AUTHORIZED=grant;if(snapshot===undefined)delete process.env.PORTAL_CLOUD_SNAPSHOT_ID;else process.env.PORTAL_CLOUD_SNAPSHOT_ID=snapshot;}
  job.destinations![0].url=url.replace('globalti','other');expect(matchesSelectedSites(job,w)).toBe(false);
  expect(JSON.stringify(w.interview)).toBe(before);
 });
 it('never generates an identification number through the missing-answer policy',async()=>{
  const p=profile();p.answerPolicy={enabled:true,missing:'no',confirmedAt:new Date().toISOString()};
  const answers=await prepareAutomaticAnswers({profile:p,resume:{id:'qa-resume',text:'Desenvolvimento de software'} as any,job:{title:'Desenvolvedor',source:'Quickin'} as any,destinationUrl:url,questions:[fields.at(-1)!.label,'Número do passaporte']});
  expect(answers).toEqual([]);
 });
 it('pauses for CPF, skips informational notices and optional disability groups',()=>{
  const plan=quickinFieldPlan(fields,profile(),url);
  expect(plan.missing).toEqual([fields.at(-1)!.label]);
  expect(plan.answers.some(a=>/gdpr|disability/.test(a.field.name))).toBe(false);
  expect(plan.answers.find(a=>a.field.name==='phones')?.value).toBe('+5511999990000');
  expect(plan.answers.find(a=>a.field.name.startsWith('job_question_'))?.value).toBe('3500');
 });
 it('only uses a confirmed CPF for its exact application, rejects invalid digits and new mandatory declarations',()=>{
  const p=profile(),question=fields.at(-1)!.label;
  p.approvedAnswers=[{id:'qa',question,value:'52998224725',aliases:[],confirmedAt:new Date().toISOString(),destinationUrl:url,destinationOrigin:new URL(url).origin}];
  expect(quickinFieldPlan(fields,p,url).missing).toEqual([]);
  expect(quickinFieldPlan(fields,p,url.replace('6ad64','6ad65')).missing).toContain(question);
  p.approvedAnswers[0].value='11111111111';expect(quickinFieldPlan(fields,p,url).missing).toContain(question);
  expect(quickinFieldPlan([{name:'consent',type:'boolean',label:'Aceito uso de dados para marketing',required:true}],p,url).missing).toHaveLength(1);
 });
 it('requires a board grant and restricts execution to the two publisher origins',()=>{
  expect(detectAts(url)).toMatchObject({platform:'quickin',board:'globalti',postingId:'6ad64c6582963200138f28c0'});
  expect(detectAts(url.replace('jobs.quickin.io','jobs.quickin.io.evil.example'))).toBeNull();
  expect(atsExecutionHosts(url)).toEqual(['jobs.quickin.io','api.quickin.io']);
  const before=process.env.ATS_BROWSER_AUTHORIZED;
  try{delete process.env.ATS_BROWSER_AUTHORIZED;expect(destinationBrowserAllowed({platform:'quickin',url} as any)).toBe(false);
   process.env.ATS_BROWSER_AUTHORIZED='quickin:globalti';expect(destinationBrowserAllowed({platform:'quickin',url} as any)).toBe(true);
   expect(destinationBrowserAllowed({platform:'quickin',url:url.replace('/globalti/','/other/')} as any)).toBe(false);
  }finally{if(before===undefined)delete process.env.ATS_BROWSER_AUTHORIZED;else process.env.ATS_BROWSER_AUTHORIZED=before;}
 });
});
