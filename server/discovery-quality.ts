import type {DiscoveryProductivity,Job,Source,Workspace} from '../shared/types';
import {analyze,eligibleForDestinationResearch,matchesObjectiveFilters,matchesSelectedSites,nextExecution} from './engine';
import {createHash} from 'node:crypto';
import {canonicalJobUrl,opportunityKey} from './job-identity';
import {detectAts} from './ats-registry';
import {confirmedApplication} from '../shared/confirmed-applications';

/** Screen per workspace AFTER the shared public cache, BEFORE retaining/ranking.
 * Missing publication fields can still be researched; known incompatibility cannot. */
export function discoveryQuerySignature(w:Workspace){return createHash('sha256').update(JSON.stringify([w.filters,w.routine.minScore,w.profile.skills,w.profile.experience,w.profile.education,w.profile.years,w.profile.level])).digest('hex');}
export function sourceDue(w:Workspace,s:Source){
 const p=w.routine.discoveryProductivity?.[s.id];
 return !/^(?:catalog:|quickin-board:)/.test(s.id)||!p||p.compatible>0||p.querySignature!==discoveryQuerySignature(w)||!p.nextCheckAt||Date.parse(p.nextCheckAt)<=Date.now();
}
export function screenDiscovery(w:Workspace,source:Source,jobs:Job[],checkedAt:string,examined=jobs.length){
 const retained:Job[]=[],excluded:Record<string,number>={};let compatible=0,channelVerified=0;
 const reject=(reason:string)=>{excluded[reason]=(excluded[reason]||0)+1;};
 for(const input of jobs){
  const j=structuredClone(input);
  const prior=w.jobs.find(old=>canonicalJobUrl(old.url)===canonicalJobUrl(j.url)||opportunityKey(old)===opportunityKey(j));
  if(prior&&w.applications.some(a=>a.jobId===prior.id&&(a.receipt||a.submittedAt||['Resultado desconhecido','Enviando'].includes(a.status)))){reject('existing_or_uncertain_application');continue;}
  if(prior?.discarded||w.submissionExclusions?.includes(opportunityKey(j))){reject('excluded_by_user');continue;}
  const match=analyze(j,w.profile,w.filters);
  if(j.publishedAt&&(!Number.isFinite(Date.parse(j.publishedAt))||Date.parse(j.publishedAt)>Date.now())){reject('invalid_publication_date');continue;}
  if(!eligibleForDestinationResearch(j,w)){
   const reasons=match.blockers.filter(b=>/fora|exclu|bloqueada|filtro|limite|mínimo|máximo/i.test(b));
   reject(reasons[0]||'objective_preferences');continue;
  }
  const mandatory=match.blockers.filter(b=>/indispensável|obrigatório|Habilitação exigida|experiência exigida/i.test(b));
  if(mandatory.length){reject(mandatory[0]);continue;}
  j.match=match;j.discoverySourceIds=[...new Set([...(prior?.discoverySourceIds||[]),...(j.discoverySourceIds||[]),source.id])];
  retained.push(j);
  const eligible=matchesObjectiveFilters(j,w.profile,w.filters)&&matchesSelectedSites(j,w)&&!match.blockers.length&&match.confidence!=='insufficient'&&match.score>=w.routine.minScore;
  if(eligible){compatible++;if(j.emailDestination||j.destinations?.some(d=>d.state==='verified'&&d.formFound&&Date.parse(d.expiresAt)>Date.now()))channelVerified++;}
 }
 const productivity:DiscoveryProductivity={sourceId:source.id,company:source.company,checkedAt,examined,retained:retained.length,compatible,channelVerified,excluded,querySignature:discoveryQuerySignature(w),...(compatible===0?{nextCheckAt:nextExecution(w.routine.time)}:{})};
 return {jobs:retained,productivity};
}
export function learnedDiscoverySources(w:Workspace):Source[]{
 return (w.routine.learnedBoards||[]).slice(0,12).map(b=>({id:b.type==='manual'?`quickin-board:${b.board}`:`catalog:${b.type}:${b.board}`,...b,enabled:true,discovery:true,application:false,status:'Quadro público aprendido de publicação oficial'}));
}
/** Only an individually re-read official posting teaches a board. No grant is created. */
export function learnOfficialBoards(w:Workspace,jobs:Job[],at:string){
 for(const j of jobs){const a=detectAts(j.url);
  if(!a?.board||!['quickin','greenhouse','lever','ashby','smartrecruiters'].includes(a.platform)||!j.company||!j.publishedAt)continue;
  const type=a.platform==='quickin'?'manual':a.platform as Source['type'];
  const previous=w.routine.learnedBoards||[];
  w.routine.learnedBoards=[...previous.filter(b=>b.board!==a.board||b.type!==type),{type,board:a.board,company:j.company,verifiedAt:at}].slice(-12);
 }
}
/** Prefer measured compatible yield within each existing cost/adapter tier. */
export function rankDiscoverySources(w:Workspace,sources:Source[]){
 const p=w.routine.discoveryProductivity||{};
 return sources.sort((a,b)=>(p[b.id]?.compatible||0)-(p[a.id]?.compatible||0));
}
export function sourceProductivity(w:Workspace){
 return Object.values(w.routine.discoveryProductivity||{}).map(p=>{
  const jobs=w.jobs.filter(j=>j.discoverySourceIds?.includes(p.sourceId));
  const apps=w.applications.filter(a=>jobs.some(j=>j.id===a.jobId));
  return {...p,scope:'latest_check_and_retained_applications',prepared:apps.length,
   preflightPassed:apps.filter(a=>a.history.some(h=>h.message.startsWith('Envio iniciado.'))).length,
   transmissionsStarted:apps.filter(a=>a.attempts?.some(t=>t.outcome!=='pre_submit_blocked')).length,
   confirmed:apps.filter(confirmedApplication).length};
 });
}
