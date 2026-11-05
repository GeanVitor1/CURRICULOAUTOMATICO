import { it,expect,vi,afterEach } from "vitest";
import {createWorkspace} from "../server/workspace";
import {confirmCandidateDetails} from "./fixtures/candidate-details";
import {reviewReconciledRetry,authorizeReconciledRetry,assertReconciledRetry,recordReconciledRetryReview} from "../server/reconciled-retry";
import type {Application} from "../shared/types";
afterEach(()=>vi.unstubAllEnvs());
function fixture(){
  vi.stubEnv("ATS_BROWSER_AUTHORIZED","quickin:qaemployer");vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","controlled");
  const w=createWorkspace("QA","qa@example.test");confirmCandidateDetails(w);w.profile.confirmed=true;w.profile.skills=["C#",".NET","SQL Server"];w.profile.level="Júnior";
  w.filters={...w.filters,titles:["Desenvolvedor .NET"],modalities:["Remoto"],contracts:["CLT"],ageDays:14,dateKnownOnly:true};w.routine.minScore=70;
  const url="https://jobs.quickin.io/qaemployer/jobs/6ad64c6582963200138f28c0";
  w.jobs=[{id:"job",url,company:"Empresa QA",title:"Desenvolvedor .NET Júnior",description:"",origins:[],destinations:[],match:{} } as any];
  w.resumes=[{id:"resume",name:"qa.pdf",approved:true,text:"C# .NET SQL Server",skills:w.profile.skills,originalFileAvailable:true} as any];
  w.applications=[{id:"original",jobId:"job",resumeId:"resume",status:"Falha no envio",receipt:null,mode:"automatic",note:"",createdAt:"2026-10-23T13:51:00Z",updatedAt:"2026-10-26T12:00:00Z",destinationUrl:`${url}/apply`,
    history:[{at:"2026-10-23T13:52:00Z",actor:"Sistema",message:"Envio iniciado."}],
    attempts:[{id:"old-attempt",startedAt:"2026-10-23T13:52:00Z",finishedAt:"2026-10-23T13:53:00Z",outcome:"unknown",origin:"user_triggered_automation",executor:"ats_browser",correlationId:"old"}],
    reconciliations:[{id:"reconciliation",attemptId:"old-attempt",outcome:"not_received",source:"official_employer_reply",at:new Date().toISOString()}]} as Application];
  const page=(title="Desenvolvedor .NET Júnior",extra="")=>({url,status:200,html:`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',url,title,description:'Desenvolvimento de sistemas e APIs em C# .NET SQL Server. Contratação CLT. Trabalho remoto no Brasil. '+extra,hiringOrganization:{name:'Empresa QA'},datePosted:new Date().toISOString(),jobLocationType:'TELECOMMUTE',applicantLocationRequirements:{name:'Brasil'}})}</script><a href="${url}/apply">Candidatar-se</a>`,contentType:"text/html"});
  const inspect=vi.fn(async(_input:unknown)=>({status:"action_required" as const,preflightReady:true as const,message:"Pronto"}));
  return {w,page,inspect};
}
it("creates one linked child, preserves the original attempt and refuses a second transmission",async()=>{
  const {w,page,inspect}=fixture(),before=structuredClone(w.applications[0]);
  const result=await reviewReconciledRetry(w,"original",5,inspect,async()=>page());
  expect(result.blockers).toEqual([]);expect(inspect.mock.calls[0][0]).toMatchObject({inspectOnly:true});
  w.jobs=[result.job];w.applications[0].retryReview=result.review!;
  const child=authorizeReconciledRetry(w,"original",result.review!.fingerprint);
  expect(child.id).not.toBe(before.id);expect(child.retryOf).toMatchObject({applicationId:before.id,attemptId:"old-attempt",reconciliationId:"reconciliation"});
  expect(authorizeReconciledRetry(w,"original",result.review!.fingerprint).id).toBe(child.id);expect(w.applications).toHaveLength(2);
  expect(w.applications.find(a=>a.id==="original")?.attempts).toEqual(before.attempts);
  expect(w.applications.find(a=>a.id==="original")?.history).toEqual(before.history);
  expect(()=>assertReconciledRetry(w,child)).not.toThrow();
  child.attempts=[{...before.attempts![0],id:"new-attempt"}];child.status="Resultado desconhecido";
  expect(()=>assertReconciledRetry(w,child)).toThrow();expect(()=>authorizeReconciledRetry(w,"original",result.review!.fingerprint)).toThrow();
});
it("keeps an incompatible senior posting blocked before any form execution",async()=>{
  const {w,page,inspect}=fixture();w.profile.level="Não especificado";
  const r=await reviewReconciledRetry(w,"original",5,inspect,async()=>page("Desenvolvedor .NET PL/SR"));
  expect(r.ready).toBe(false);expect(r.review).toBeNull();expect(r.blockers.join(' ')).toMatch(/Senioridade|Compatibilidade/);expect(inspect).not.toHaveBeenCalled();
});
it("persists a blocked evaluation as an audit event without authorizing or changing the old attempt",async()=>{
  const {w,page,inspect}=fixture(),before=structuredClone(w.applications[0]);w.profile.level="Não especificado";
  const result=await reviewReconciledRetry(w,"original",5,inspect,async()=>page("Desenvolvedor .NET PL/SR"));
  recordReconciledRetryReview(w,"original",result);
  expect(w.applications[0].retryEvaluation).toMatchObject({ready:false,score:result.score,blockers:result.blockers,reconciliationId:"reconciliation",attemptId:"old-attempt"});
  expect(w.applications[0].retryReview).toBeUndefined();expect(w.applications[0].attempts).toEqual(before.attempts);
  expect(w.applications[0].history.slice(0,-1)).toEqual(before.history);expect(w.applications[0].history.at(-1)?.message).toMatch(/Nenhuma transmissão autorizada/);
  expect(()=>authorizeReconciledRetry(w,"original","a".repeat(64))).toThrow();expect(w.applications).toHaveLength(1);
});
it.each(["profile","resume","filters","answers","expired"])("requires revalidation after %s changes",async key=>{
  const {w,page,inspect}=fixture(),r=await reviewReconciledRetry(w,"original",5,inspect,async()=>page());
  w.jobs=[r.job];w.applications[0].retryReview=r.review!;
  if(key==="profile")w.profile.salaryDesired++;
  if(key==="resume")w.resumes[0].approved=false;
  if(key==="filters")w.filters.ageDays=7;
  if(key==="answers")w.applications[0].automaticAnswers=[];
  if(key==="expired")w.applications[0].retryReview!.expiresAt=new Date(0).toISOString();
  expect(()=>authorizeReconciledRetry(w,"original",r.review!.fingerprint)).toThrow();expect(w.applications).toHaveLength(1);
});
it("binds the new candidacy to the reviewed answers and destination",async()=>{
  const {w,page,inspect}=fixture(),r=await reviewReconciledRetry(w,"original",5,inspect,async()=>page());
  w.jobs=[r.job];w.applications[0].retryReview=r.review!;
  const child=authorizeReconciledRetry(w,"original",r.review!.fingerprint);
  child.automaticAnswers=[];
  expect(()=>assertReconciledRetry(w,child)).toThrow();
  child.automaticAnswers=undefined;child.destinationUrl="https://example.test/other";
  expect(()=>assertReconciledRetry(w,child)).toThrow();
});
it("does not authorize a missing answer or a closed publication",async()=>{
  const {w,page,inspect}=fixture();inspect.mockResolvedValueOnce({status:"action_required",message:"CPF pendente"} as any);
  expect((await reviewReconciledRetry(w,"original",5,inspect,async()=>page())).ready).toBe(false);
  await expect(reviewReconciledRetry(w,"original",5,inspect,async()=>({...page(),status:404}))).rejects.toThrow();
});
