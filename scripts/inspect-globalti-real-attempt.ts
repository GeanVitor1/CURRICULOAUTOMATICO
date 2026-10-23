import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {readPublicPage} from '../server/public-web';
import {jobFromQuickinPage} from '../server/quickin-board';
import {quickinFieldPlan,type QuickinField} from '../server/quickin-form';
import {applicationAnswerProfile} from '../server/automatic-answers';
import {analyze,matchesObjectiveFilters,matchesSelectedSites} from '../server/engine';
import {opportunityKey} from '../server/job-identity';
import {confirmedAutomaticApplication} from '../server/automation-trace';

// Read-only, exact already-discovered job. Never prepares, queues or transmits.
const url='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0';
const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const {store,operatorEmail}=await operatorStore();
try{
 const [owner]=await store.select('users',{where:eq('email',operatorEmail)});
 if(!owner)throw Error('Authenticated operator owner missing');
 const rows=await store.select('workspaces',{where:and(eq('userId',owner.id),eq('demo',false))});
 if(rows.length!==1)throw Error('Ambiguous live workspace');
 const w=rows[0].data,job=w.jobs.find(j=>j.url===url);
 if(!job)throw Error('Existing automation-discovered Global TI job required');
 const applications=w.applications.filter(a=>w.jobs.some(j=>j.id===a.jobId&&opportunityKey(j)===opportunityKey(job)));
 const application=applications[0];
 const resume=w.resumes.find(r=>r.id===application?.resumeId);
 const page=await readPublicPage(url);
 const fresh=jobFromQuickinPage({id:'quickin-board:globalti',type:'manual',company:'Global TI',board:'globalti',enabled:true,application:true,discovery:true,status:''},page);
 if(!fresh)throw Error('Current official publication not confirmed');
 const site=await readPublicPage('https://api.quickin.io/public/careersites/globalti');
 const config=JSON.parse(site.html);
 if(config.slug!=='globalti'||config.name!=='Global TI'||!/^[a-f0-9]{24}$/.test(config.account_id))throw Error('Public board identity mismatch');
 const schema=await readPublicPage(`https://api.quickin.io/public/${config.account_id}/apply-form-schema?job_id=6ad64c6582963200138f28c0&origin=applied`);
 const fields:QuickinField[]=JSON.parse(schema.html);
 const profile=application?applicationAnswerProfile(w.profile,application,`${url}/apply`):w.profile;
 const plan=quickinFieldPlan(fields,profile,`${url}/apply`),match=analyze(fresh,w.profile,w.filters);
 const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,workspaceId:rows[0].id,jobId:job.id,url,
  publication:{status:page.status,title:fresh.title,company:fresh.company,availability:fresh.availability||'published with application link',publishedAt:fresh.publishedAt,score:match.score,minimumScore:w.routine.minScore,blockers:match.blockers,objectiveFiltersPassed:matchesObjectiveFilters(fresh,w.profile,w.filters),selectedSourcesPassed:matchesSelectedSites(fresh,w),excluded:w.submissionExclusions?.includes(opportunityKey(job))||false},
  approvals:{profileConfirmed:w.profile.confirmed,routineEnabled:w.routine.enabled,mode:w.routine.mode,interviewComplete:w.interview?.completed,interviewResumeMatches:w.interview?.answers.resumeId===resume?.id,resumeApproved:resume?.approved,originalAvailable:resume?.originalFileAvailable,exactCpfApproved:profile.approvedAnswers?.some(a=>/\bcpf\b/i.test(a.question)&&a.destinationUrl===`${url}/apply`&&!!a.confirmedAt)},
  form:{schemaStatus:schema.status,missingRequired:plan.missing,requiredFields:fields.filter(f=>f.required).map(f=>({name:f.name,label:f.label,type:f.type,answered:plan.answers.some(a=>a.field.name===f.name)||f.name==='resume_media_id'&&!!resume?.originalFileAvailable})),mandatoryDeclarations:fields.filter(f=>f.required&&f.type==='boolean').map(f=>({label:f.label,approved:plan.answers.some(a=>a.field.name===f.name)})),informationalNotices:fields.filter(f=>f.type==='message').length},
  applications:applications.map(a=>({id:a.id,status:a.status,receipt:a.receipt,submittedAt:a.submittedAt||null,execution:a.execution,attempts:a.attempts,history:a.history,missingQuestions:a.missingQuestions||[]})),
  safeToTransmit:applications.length===0&&plan.missing.length===0,
  transmissionDecision:applications.some(a=>a.status==='Resultado desconhecido')?'BLOCKED_UNKNOWN_OUTCOME_DO_NOT_RETRY':applications.length?'EXISTING_APPLICATION_REQUIRES_RECONCILIATION':'NO_EXISTING_APPLICATION',
  routine:w.routine,scheduledRuns:w.runs.filter(r=>r.origin==='scheduled_automation').slice(0,3),confirmedAutomaticToday:w.applications.filter(a=>confirmedAutomaticApplication(a)&&new Date(a.submittedAt!).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})===day).length};
 await writeFile(`artifacts/globalti-real-attempt-state-${day}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
