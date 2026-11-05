import type {Workspace} from '../shared/types';
import type {GupyDraftProof} from './gupy-draft-verification';
import {isJobUrl} from '../shared/portals';
import {RequestError} from './errors';
import {PORTAL_RUNTIME_VERSION} from '../shared/portal-runtime-version';
import {randomUUID} from 'node:crypto';

export function recoverableGupyDraft(w:Workspace,applicationId:string){
 const a=w.applications.find(a=>a.id===applicationId),job=a&&w.jobs.find(j=>j.id===a.jobId),attempt=a?.attempts?.at(-1);
 const day=(at:string)=>new Date(at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 if(w.demo||!w.routine.enabled||w.routine.mode!=='automatic'||!a||!job||!isJobUrl('gupy',job.url)||
    a.status!=='Resultado desconhecido'||a.receipt||a.submittedAt||!a.resumeId||attempt?.outcome!=='unknown'||!attempt.finishedAt||
    !Number.isFinite(Date.parse(attempt.finishedAt))||Date.now()-Date.parse(attempt.finishedAt)<120000||
    (a.verifiedGupyDrafts||[]).filter(v=>day(v.at)===day(new Date().toISOString())).length>=2)return null;
 return {application:a,job,attempt};
}
export function recordVerifiedGupyDraft(w:Workspace,applicationId:string,attemptId:string,proof:GupyDraftProof){
 const candidate=recoverableGupyDraft(w,applicationId);
 if(!candidate||candidate.attempt.id!==attemptId||candidate.application.resumeId!==proof.resumeId||candidate.job.url!==proof.destinationUrl||
    !/^\d+$/.test(proof.nativeApplicationId)||new URL(proof.continuationUrl).protocol!=='https:'||new URL(proof.continuationUrl).origin!==new URL(candidate.job.url).origin||
    new URL(proof.continuationUrl).pathname!==`/candidates/applications/${proof.nativeApplicationId}`||
    !Number.isFinite(Date.parse(proof.observedAt))||Math.abs(Date.now()-Date.parse(proof.observedAt))>120000)
   throw new RequestError('A prova do rascunho não corresponde à tentativa incerta atual.');
 const a=candidate.application;
 (a.verifiedGupyDrafts||=[]).push({attemptId,at:proof.observedAt,nativeApplicationId:proof.nativeApplicationId,continuationUrl:proof.continuationUrl});
 a.status='Requer ação manual';a.missingQuestions=[];
 a.resumeState={resumeId:proof.resumeId,destinationUrl:proof.destinationUrl,recordedAt:proof.observedAt,portalRuntimeVersion:PORTAL_RUNTIME_VERSION};
 delete a.automaticBlockedFingerprint;
 a.updatedAt=new Date().toISOString();
 a.history.push({at:a.updatedAt,actor:'Sistema',message:'A Gupy confirmou progresso zero e currículo ainda por começar para esta mesma vaga. O projeto pode retomar o rascunho; a tentativa incerta e sua reserva original foram preservadas. Nenhum recibo foi criado.'});
 return a;
}
export async function verifyUncertainGupyDraft(workspaceId:string,applicationId:string){
 const {store,readWorkspace,mutateWorkspace}=await import('./db');
 const {eq}=await import('./storage-types');
 const w=await readWorkspace(workspaceId);if(!w)return false;
 const candidate=recoverableGupyDraft(w,applicationId);if(!candidate)return false;
 const [owner]=await store.select('workspaces',{where:eq('id',workspaceId),columns:['userId']});if(!owner)return false;
 const leaseId=randomUUID();
 const acquired=await mutateWorkspace(workspaceId,current=>{
  if(current.applications.some(a=>a.status==='Enviando')||(current.portalVerification?.until||0)>Date.now())throw new Error('PortalVerificationBusy');
  if(!recoverableGupyDraft(current,applicationId))return false;
  current.portalVerification={id:leaseId,until:Date.now()+180000};return true;
 });
 if(!acquired)return false;
 try{
 const {cloudPortalCommand}=await import('./portal-cloud');
 const proof=await cloudPortalCommand<GupyDraftProof|null>(owner.userId,'gupy',{op:'verify-draft',resumeId:candidate.application.resumeId,input:{
  applicationId,job:{title:candidate.job.title,company:candidate.job.company,url:candidate.job.url},profile:w.profile,resume:{name:'approved-portal-profile'},
 }});
 if(!proof)return false;
 await mutateWorkspace(workspaceId,current=>recordVerifiedGupyDraft(current,applicationId,candidate.attempt.id,proof));
 return true;
 }finally{await mutateWorkspace(workspaceId,current=>{if(current.portalVerification?.id===leaseId)delete current.portalVerification;});}
}
