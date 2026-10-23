import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {readPublicPage} from '../server/public-web';
import {jobFromQuickinPage} from '../server/quickin-board';
import {quickinFieldPlan,type QuickinField} from '../server/quickin-form';
import {approvedFieldAnswer} from '../server/approved-answers';
import {analyze,matchesObjectiveFilters} from '../server/engine';
const url='https://jobs.quickin.io/cadmus/jobs/6ad7b356cc70ac0013cd030b',apply=url+'/apply';
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)});
 const [r]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const w=r.data,page=await readPublicPage(url),j=jobFromQuickinPage({id:'quickin-board:cadmus',company:'Cadmus',board:'cadmus',type:'manual',enabled:true,discovery:true,application:true,status:''},page);
 if(!j)throw Error('Cadmus official posting not verified');
 const site=JSON.parse((await readPublicPage('https://api.quickin.io/public/careersites/cadmus')).html);
 if(site.slug!=='cadmus'||site.name!=='Cadmus')throw Error('Publisher identity mismatch');
 const schema=await readPublicPage(`https://api.quickin.io/public/${site.account_id}/apply-form-schema?job_id=${url.split('/').at(-1)}&origin=applied`);
 const fields:QuickinField[]=JSON.parse(schema.html),plan=quickinFieldPlan(fields,w.profile,apply),m=analyze(j,w.profile,w.filters);
 const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,url,httpStatus:page.status,active:j.availability,publishedAt:j.publishedAt,match:{score:m.score,minimum:w.routine.minScore,objectivePreferences:matchesObjectiveFilters(j,w.profile,w.filters),mandatorySkills:j.requiredSkills,blockers:m.blockers,gaps:m.gaps},schemaStatus:schema.status,requiredFields:fields.filter(f=>f.required).map(f=>({name:f.name,label:f.label,type:f.type,answered:plan.answers.some(a=>a.field.name===f.name)||f.name==='resume_media_id'&&w.resumes.some(r=>r.approved&&r.originalFileAvailable),availableFact:!!approvedFieldAnswer(f.label,w.profile,apply),options:f.options?.map(o=>o.label)})),missingRequired:plan.missing,photoRequired:fields.find(f=>f.name==='photo_media_id')?.required===true,photoFileSupported:false,consents:fields.filter(f=>f.type==='boolean'&&f.required).map(f=>({question:f.label,approved:plan.answers.some(a=>a.field.name===f.name)})),countryEvidence:'Confirmed city/state can identify Brazil; no country answer or selection is manufactured by this inspection.',safeToTransmit:false,reason:'Unconfirmed mandatory technologies and unresolved required photo, personal data, experience selection and explicit privacy consent. No submission.'};
 await writeFile('artifacts/cadmus-requirements-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
