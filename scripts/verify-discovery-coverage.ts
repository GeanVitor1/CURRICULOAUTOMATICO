import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {discoverQuickinBoard} from '../server/quickin-board';
import {readPublicPage} from '../server/public-web';
import {analyze,matchesObjectiveFilters} from '../server/engine';
import type {Workspace,Source} from '../shared/types';
const {workspace:w}=JSON.parse(await readFile('.data/owner-automation-context.json','utf8')) as {workspace:Workspace};
const current=parse(await readFile('.env.automation-current.local'));
for(const k of ['VERCEL_OIDC_TOKEN','VERCEL_ORG_ID','VERCEL_PROJECT_ID'])if(current[k]&&current[k]!=='[SENSITIVE]')process.env[k]=current[k];
Object.assign(process.env,parse(await readFile('.env.antigravity-owner.local')));
if(process.argv.includes('--provider=gemini')){
 const local=parse(await readFile('.env'));
 process.env.ANTIGRAVITY_ENABLED='false';
 process.env.GEMINI_API_KEY=local.GEMINI_API_KEY;
}
const boards=process.argv.filter(a=>a.startsWith('--board=')).map(a=>a.slice(8));
const results=[];
for(const board of boards){
 if(!/^[a-z0-9_-]{1,100}$/i.test(board))throw Error('Invalid board');
 try{
  const site=await readPublicPage(`https://api.quickin.io/public/careersites/${board}`),config=JSON.parse(site.html);
  if(site.status!==200||config.slug!==board||typeof config.name!=='string')throw Error('Company not confirmed');
  const source:Source={id:`quickin-board:${board}`,type:'manual',board,company:config.name,enabled:true,discovery:true,application:false,status:''};
  const r=await discoverQuickinBoard(source,w);
  results.push({source,examined:r.examined,checkpoint:r.checkpoint,jobs:r.jobs.map(j=>{
   const m=analyze(j,w.profile,w.filters);return {title:j.title,company:j.company,url:j.url,publishedAt:j.publishedAt,contract:j.contract,modality:j.modality,score:m.score,blockers:m.blockers,confidence:m.confidence,eligible:matchesObjectiveFilters(j,w.profile,w.filters)&&!m.blockers.length&&m.confidence!=='insufficient'&&m.score>=w.routine.minScore};
  })});
 }catch(e){results.push({board,error:e instanceof Error?e.message:'Unavailable'});}
}
if(process.argv.includes('--search')){
 const {discoverOfficialCareers,discoverCorporateEmailCareers}=await import('../server/official-discovery');
 const {withDiscoveryBudget}=await import('../server/discovery-budget');
 try{const result=await withDiscoveryBudget(120000,()=>(process.argv.includes('--email')?discoverCorporateEmailCareers:discoverOfficialCareers)(w,process.env.ANTIGRAVITY_OWNER_ID));
  results.push({search:'official',jobs:result.jobs.map(j=>{const m=analyze(j,w.profile,w.filters);return {title:j.title,company:j.company,url:j.url,score:m.score,blockers:m.blockers,publishedAt:j.publishedAt,contract:j.contract,modality:j.modality,confidence:m.confidence,eligible:matchesObjectiveFilters(j,w.profile,w.filters)&&!m.blockers.length&&m.confidence!=='insufficient'&&m.score>=w.routine.minScore};})});
 }catch(e){results.push({search:'official',error:e instanceof Error?e.message:'Unavailable'});}
}
const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,results};
const path=`artifacts/discovery-coverage-${Date.now()}.json`;await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({path,...report}));
