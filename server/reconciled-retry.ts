import { createHash, randomUUID } from "node:crypto";
import type { Application, Workspace, Job } from "../shared/types";
import { RequestError } from "./errors";
import { submissionReadiness } from "./submission-eligibility";
import { analyze } from "./engine";
import { opportunityKey } from "./job-identity";
import { detectAts } from "./ats-registry";
import { jobFromQuickinPage } from "./quickin-board";
import { readPublicPage } from "./public-web";
import { applicationAnswerProfile } from "./automatic-answers";
import type { AtsApplication } from "./ats-application";
import type { ExecutionResult } from "./application-verification";

function basis(w: Workspace, id: string) {
  const a=w.applications.find(a=>a.id===id), r=a?.reconciliations?.at(-1);
  const job=a&&w.jobs.find(j=>j.id===a.jobId), attempt=a?.attempts?.at(-1);
  if(!a||!job||!r||r.outcome!=="not_received"||r.source!=="official_employer_reply"||
    a.status!=="Falha no envio"||a.receipt||a.submittedAt||!attempt||r.attemptId!==attempt.id)
    throw new RequestError("É necessária confirmação oficial de não recebimento da última tentativa.");
  if(w.applications.some(other=>other.id!==a.id&&w.jobs.some(j=>j.id===other.jobId&&opportunityKey(j)===opportunityKey(job))&&
    (other.receipt||other.submittedAt||["Enviando","Resultado desconhecido","Enviada"].includes(other.status))))
    throw new RequestError("Há outra candidatura recebida ou incerta para esta oportunidade.");
  return {a,r,job,attempt};
}
export function retryFingerprint(w:Workspace,a:Application,job:Job){
  const r=a.reconciliations!.at(-1)!;
  const {minScore:_legacy,...filters}=w.filters;
  return createHash("sha256").update(JSON.stringify({policy:'preferences-and-explicit-requirements-v3',profile:w.profile,filters,
    resume:w.resumes.find(v=>v.id===a.resumeId),answers:a.automaticAnswers,reconciliationId:r.id,attemptId:r.attemptId,
    job:{url:job.url,title:job.title,company:job.company,description:job.description,publishedAt:job.publishedAt,
      modality:job.modality,level:job.level,contract:job.contract,requiredSkills:job.requiredSkills},destination:a.destinationUrl})).digest("hex");
}
export async function freshRetryJob(w:Workspace,originalId:string,read=readPublicPage){
  const {job}=basis(w,originalId),ats=detectAts(job.url);
  if(ats?.platform!=="quickin"||!ats.board)throw new RequestError("A recuperação verificada está disponível para o formulário Quickin.");
  const fresh=jobFromQuickinPage({id:"revalidation",type:"manual",board:ats.board,company:job.company,enabled:true,discovery:true,application:true,status:""},await read(job.url));
  if(!fresh)throw new RequestError("A publicação oficial não confirmou que a vaga permanece aberta.");
  return {...job,...fresh,id:job.id,discoveredAt:job.discoveredAt,saved:job.saved,discarded:job.discarded};
}
export async function reviewReconciledRetry(w:Workspace,id:string,limit:number,
  inspect:(input:AtsApplication)=>Promise<ExecutionResult>,read=readPublicPage){
  const {a,r}=basis(w,id);
  if(w.applications.some(other=>other.retryOf?.applicationId===id))throw new RequestError("A única nova candidatura já foi criada. Consulte seu resultado.");
  const job=await freshRetryJob(w,id,read),snapshot=structuredClone(w);
  snapshot.jobs=snapshot.jobs.map(j=>j.id===job.id?job:j);
  const preview:Application={...a,id:"retry-preview",status:"Requer ação manual",history:[],attempts:[],receipt:null};
  delete preview.resumeState;delete preview.singleSubmission;
  const readiness=submissionReadiness(snapshot,preview,[],limit),match=analyze(job,w.profile,w.filters);
  const blockers=[...new Set([...readiness.blockers,...match.blockers])];
  const destination=job.destinations?.find(d=>d.url===a.destinationUrl);
  if(!destination)blockers.push("O formulário mudou desde a tentativa original.");
  if(blockers.length)return {ready:false,blockers,score:match.score,job,review:null};
  const result=await inspect({applicationId:id,inspectOnly:true,job:{title:job.title,company:job.company,url:job.url},
    destination:destination!,profile:applicationAnswerProfile(w.profile,a,destination!.url),resume:{name:w.resumes.find(v=>v.id===a.resumeId)?.name||""}});
  if(!result.preflightReady)return {ready:false,blockers:[result.message,...(result.missingQuestions||[])],score:match.score,job,review:null};
  return {ready:true,blockers:[],score:match.score,job,review:{fingerprint:retryFingerprint(w,a,job),reconciliationId:r.id,
    resumeId:a.resumeId!,destinationUrl:destination!.url,expiresAt:new Date(Date.now()+10*60000).toISOString()}};
}
export function recordReconciledRetryReview(w:Workspace,id:string,result:Awaited<ReturnType<typeof reviewReconciledRetry>>){
  const {a,r}=basis(w,id);
  if(w.applications.some(child=>child.retryOf?.applicationId===id))throw new RequestError("A única nova candidatura já foi criada. Consulte seu resultado.");
  if(result.review&&retryFingerprint(w,a,result.job)!==result.review.fingerprint)throw new RequestError("Seus dados mudaram durante a revisão.");
  w.jobs=w.jobs.map(j=>j.id===result.job.id?result.job:j);
  if(result.review)a.retryReview=result.review;else delete a.retryReview;
  const at=new Date().toISOString();
  a.retryEvaluation={at,reconciliationId:r.id,attemptId:r.attemptId,ready:result.ready,score:result.score,blockers:result.blockers};
  a.history.push({at,actor:"Sistema",message:`Reavaliou recuperação após reconciliação ${r.id}: ${result.ready?"pronta para autorização específica":"bloqueada"}. ${result.blockers.join(" ")} Nenhuma transmissão autorizada nesta revisão.`});
  a.updatedAt=at;
}
export function authorizeReconciledRetry(w:Workspace,id:string,expected:string){
  const {a,r,job,attempt}=basis(w,id),review=a.retryReview;
  if(!review||review.fingerprint!==expected||review.reconciliationId!==r.id||Date.parse(review.expiresAt)<=Date.now()||
    review.fingerprint!==retryFingerprint(w,a,job))throw new RequestError("Revalide a vaga, o currículo e suas respostas antes de autorizar.");
  const child=w.applications.find(other=>other.retryOf?.applicationId===id);
  if(child){if(child.id===review.childId&&child.status==="Aguardando aprovação"&&!child.attempts?.length)return child;
    throw new RequestError("A única nova tentativa já foi autorizada. Não será repetida.");}
  const at=new Date().toISOString();
  const next:Application={id:randomUUID(),jobId:job.id,resumeId:review.resumeId,status:"Aguardando aprovação",mode:"single",
    createdAt:at,updatedAt:at,receipt:null,note:"",attempts:[],destinationUrl:review.destinationUrl,destinationId:a.destinationId,
    automaticAnswers:structuredClone(a.automaticAnswers),
    retryOf:{applicationId:a.id,attemptId:attempt.id,reconciliationId:r.id,fingerprint:review.fingerprint},
    singleSubmission:{confirmedAt:at,expiresAt:new Date(Date.now()+10*60000).toISOString(),resumeId:review.resumeId,destinationUrl:review.destinationUrl,method:"ats_browser"},
    history:[{at,actor:"Usuário",message:`Autorizou uma única nova tentativa, limitada a esta vaga, após reconciliação ${r.id}. A candidatura original foi preservada.`}]};
  review.childId=next.id;w.applications.unshift(next);return next;
}
export function assertReconciledRetry(w:Workspace,child:Application){
  if(!child.retryOf)return;
  const {a,r,job}=basis(w,child.retryOf.applicationId);
  if(a.retryReview?.childId!==child.id||child.resumeId!==a.retryReview.resumeId||child.destinationUrl!==a.retryReview.destinationUrl||
    JSON.stringify(child.automaticAnswers)!==JSON.stringify(a.automaticAnswers)||r.id!==child.retryOf.reconciliationId||r.attemptId!==child.retryOf.attemptId||
    child.retryOf.fingerprint!==retryFingerprint(w,a,job)||child.attempts?.length)
    throw new RequestError("A autorização de recuperação mudou ou sua única tentativa já foi consumida.");
}
