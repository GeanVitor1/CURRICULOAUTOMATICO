import {readFile,writeFile} from 'node:fs/promises';
import dotenv from 'dotenv';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {automationConversion} from '../server/automation-conversion';
import {approvedFieldAnswer} from '../server/approved-answers';
import {load} from 'cheerio';
import {quickinFieldPlan} from '../server/quickin-form';
import {confirmedAutomaticApplication} from '../server/automation-trace';
const {store,operatorEmail}=await operatorStore();
try{
 const [user]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
 const w=row.data,old=JSON.parse(await readFile('artifacts/automation-production-final-2026-10-23.json','utf8'));
 const env=dotenv.parse(await readFile('.env.queue-integration.local'));
 for(const key of ['ATS_PUBLIC_FORM_PLATFORMS','ATS_BROWSER_AUTHORIZED','COMPANY_FORM_AUTHORIZED','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','APP_ORIGIN'])if(env[key])process.env[key]=env[key];
 process.env.ATS_BROWSER_AUTHORIZED='quickin:globalti';
 // Only describe the known production capability; no Sandbox credential is read.
 process.env.PORTAL_CLOUD_SNAPSHOT_ID=env.PORTAL_CLOUD_SNAPSHOT_ID?'configured-in-production':'';
 const emailStored=(await store.select('portalOAuthAccounts',{where:and(eq('userId',user.id),eq('provider','gmail-send')),columns:['id']})).length===1;
 const snapshot=automationConversion(w,[],emailStored);
 const boards=JSON.parse(await readFile('artifacts/quickin-board-yield-2026-10-23.json','utf8'));
 const schema=JSON.parse(await readFile('artifacts/quickin-globalti-form-schema-2026-10-23.json','utf8'));
 const globalUrl='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0/apply';
 const missingGlobal=quickinFieldPlan(schema,w.profile,globalUrl).missing;
 const preflight=JSON.parse(await readFile('artifacts/quickin-cloud-preflight-2026-10-23.json','utf8'));
 const controlled=JSON.parse(await readFile('artifacts/quickin-ui-controlled-2026-10-23.json','utf8'));
 const globalJob=w.jobs.find(j=>j.url===globalUrl.slice(0,-6));
 const globalApplication=w.applications.find(a=>a.jobId===globalJob?.id);
 const globalConfirmed=!!globalApplication&&confirmedAutomaticApplication(globalApplication);
 const globalReady=preflight.result.preflightReady===true&&controlled.result.status==='sent'&&!missingGlobal.length;
 const qualified=boards.results.filter((r:any)=>r.job&&r.objective&&r.match.score>=w.routine.minScore&&!r.match.blockers.length).map((r:any)=>({company:r.job.company,title:r.job.title,url:r.job.url,score:r.match.score,
   unresolvedPresence:/comparecimento presencial/i.test(load(r.job.description).text()),missingRequiredAnswers:r.job.company==='Global TI'?missingGlobal:[],executorImplemented:r.job.company==='Global TI',preflightReady:r.job.company==='Global TI'&&globalReady,confirmedByProject:r.job.company==='Global TI'&&globalConfirmed}));
 const report={at:new Date().toISOString(),readOnly:true,filtersUnchanged:JSON.stringify(w.filters)===JSON.stringify(old.filters),realSubmissionsToday:snapshot.today.confirmedAutomatic,
   recoveredOriginalEight:0,newEligibleWithPassedPreflight:globalReady?1:0,newOpportunitiesWithRealSubmission:globalConfirmed?1:0,
   conversion:{...snapshot,capabilityBasis:'production configuration; stored email connection; no credential refresh or employer transmission performed'},
   quickin:{inspectedPostings:boards.results.length,qualifiedByCurrentMatcher:qualified,
     globalTiMissingExistingAnswers:missingGlobal,
     productionSourceConfigured:true,configuredBoard:'globalti',authorizedBoard:'quickin:globalti',
     actualApplication:globalApplication?{id:globalApplication.id,status:globalApplication.status,submittedAt:globalApplication.submittedAt,receipt:globalApplication.receipt,execution:globalApplication.execution,attempts:globalApplication.attempts}:null,
     reason:'Apenas o quadro Global TI foi configurado: 8 anúncios examinados pela fonte, 1 compatível e preflight aprovado. Teste da UI com escritas interceptadas é identificado separadamente; somente recibo real da rotina comprova candidatura.'},
   otherOfficialChannels:[
    {company:'adn.tech',urls:['https://adn.com.br/jobs/analista-desenvolvedor-net/','https://adn.com.br/jobs/analista-desenvolvedor-net-delphi/'],channel:'Formulário próprio AWSM Job Openings',blocker:'date_outside_filter',publicationYears:[2021,2021]},
    {company:'Nortweb',url:'https://nortweb.com.br/carreiras',channel:'E-mail publicado e formulário',blocker:'publication_date_unverified'},
    {company:'PERIGO ZERO',url:'https://perigozero.com.br/carreiras',channel:'E-mail corporativo publicado',blocker:'publication_date_unverified'},
    {company:'TemporadaLivre',url:'https://www.temporadalivre.com/vagas',channel:'E-mail corporativo publicado',blocker:'month_only_cannot_verify_14_day_filter'},
    {company:'WebSisti',url:'https://pt.linkedin.com/posts/websisti-solu%C3%A7%C3%B5es-inteligentes_estamoscontratando-vagasti-desenvolvedorjunior-activity-7513620071009652736-ckcR',channel:'E-mail da própria empresa',blockers:['published_2026_10_07','onsite_sao_luis_outside_preferences']},
    {company:'Ágape Consultoria',url:'https://br.linkedin.com/jobs/view/4477312564',channel:'E-mail descrito no anúncio da empresa',blocker:'posting_no_longer_accepting_on_linkedin_email_channel_not_reconfirmed'},
   ]};
 await writeFile('artifacts/submission-channel-yield-2026-10-23.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({filtersUnchanged:report.filtersUnchanged,conversion:snapshot,qualified,quickinMissing:missingGlobal}));
}finally{await store.close();}
