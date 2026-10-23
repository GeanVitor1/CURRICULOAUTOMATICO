import type {Job,Workspace} from '../shared/types';
import {analyze,matchesObjectiveFilters,matchesSelectedSites} from './engine';
import {opportunityKey} from './job-identity';
import {emailDestinationReady} from './email-destination';
import {submissionRoute} from './submission-routing';
import {confirmedApplication} from '../shared/confirmed-applications';
import {confirmedAutomaticApplication} from './automation-trace';
import {detectAts} from './ats-registry';
import {sourceProductivity} from './discovery-quality';
const dayOf=(at:string)=>new Date(at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
export function compatibleForAutomation(w:Workspace,j:Job) {
  const m=analyze(j,w.profile,w.filters);
  return !j.discarded&&j.availability!=='closed'&&!w.submissionExclusions?.includes(opportunityKey(j))&&
    matchesSelectedSites(j,w)&&matchesObjectiveFilters(j,w.profile,w.filters)&&m.confidence!=='insufficient'&&
    !m.blockers.length&&m.score>=w.routine.minScore;
}
/** Snapshot of the retained pool; lifetime totals are deliberately not inferred.
 * Channel availability and actual form preflight are separate stages. */
export function automationConversion(w:Workspace,nativeSites:string[],emailAvailable:boolean,at=new Date().toISOString()) {
  const day=dayOf(at),blocked:Record<string,number>={},platforms:Record<string,Record<string,number>>={};
  const totals={discovered:w.jobs.length,compatible:0,validDestination:0,executorAvailable:0,preflightBlocked:0,prepared:w.applications.length,
    transmissionsStarted:w.applications.filter(a=>a.attempts?.some(t=>t.outcome!=='pre_submit_blocked')||a.history.some(e=>e.message.startsWith('Envio iniciado.'))).length,
    confirmed:w.applications.filter(confirmedApplication).length,confirmedAutomatic:w.applications.filter(confirmedAutomaticApplication).length};
  for(const job of w.jobs){
    const platform=job.emailDestination?'email':job.destinations?.[0]?.platform||detectAts(job.url)?.platform||job.origins[0]?.source||'unknown';
    const p=platforms[platform]||=( {discovered:0,compatible:0,validDestination:0,executorAvailable:0,prepared:0,transmissionsStarted:0,confirmed:0});p.discovered++;
    if(!compatibleForAutomation(w,job))continue;totals.compatible++;p.compatible++;
    const application=w.applications.find(a=>a.jobId===job.id);
    const valid=emailDestinationReady(job)||job.destinations?.some(d=>d.state==='verified'&&d.formFound&&Date.parse(d.expiresAt)>Date.parse(at));
    const route=submissionRoute(w,job,nativeSites,{emailAvailable});
    if(valid){totals.validDestination++;p.validDestination++;}if(route){totals.executorAvailable++;p.executorAvailable++;}
    if(application){p.prepared++;if(application.attempts?.some(t=>t.outcome!=='pre_submit_blocked')||application.history.some(e=>e.message.startsWith('Envio iniciado.')))p.transmissionsStarted++;if(confirmedApplication(application))p.confirmed++;}
    let reason='';
    if(application&&confirmedApplication(application))reason='already_confirmed';
    else if(application?.status==='Resultado desconhecido')reason='uncertain_do_not_retry';
    else if(application?.status==='Requer ação manual'){
      totals.preflightBlocked++;
      reason=/verifica[cç][aã]o humana|captcha/i.test(application.history.at(-1)?.message||'')?'human_verification':application.missingQuestions?.length?'required_answers':'preflight_other';
    }else if(emailDestinationReady(job)&&!emailAvailable)reason='email_connection_unavailable';
    else if(job.destinations?.some(d=>d.state==='blocked'))reason='human_or_site_block';
    else if(job.destinations?.some(d=>d.state==='login_required'))reason='authenticated_destination';
    else if(!valid)reason=job.destinations?.some(d=>Date.parse(d.expiresAt)<=Date.parse(at))?'destination_expired':'no_verified_submission_channel';
    else if(!route)reason='executor_or_authorization_unavailable';
    if(reason){blocked[reason]=(blocked[reason]||0)+1;p[`blocked:${reason}`]=(p[`blocked:${reason}`]||0)+1;}
  }
  const today={discovered:w.jobs.filter(j=>dayOf(j.discoveredAt)===day).length,
    compatible:w.jobs.filter(j=>dayOf(j.discoveredAt)===day&&compatibleForAutomation(w,j)).length,
    prepared:w.applications.filter(a=>dayOf(a.createdAt)===day).length,
    transmissionsStarted:w.applications.filter(a=>a.history.some(e=>e.message.startsWith('Envio iniciado.')&&dayOf(e.at)===day)).length,
    confirmed:w.applications.filter(a=>confirmedApplication(a)&&dayOf(a.submittedAt!)===day).length,
    confirmedAutomatic:w.applications.filter(a=>confirmedAutomaticApplication(a)&&dayOf(a.submittedAt!)===day).length};
  return {at,day,scope:'retained_inventory' as const,totals,today,blocked,platforms,sources:sourceProductivity(w),
    notes:['Disponibilidade de executor não confirma passagem pelo preflight nem envio.','Contagens históricas abrangem os registros preservados; não reconstroem dados removidos anteriormente.']};
}
export type AutomationConversion=ReturnType<typeof automationConversion>;
