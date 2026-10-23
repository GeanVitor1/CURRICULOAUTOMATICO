import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {readPublicPage} from '../server/public-web';
import {discoverQuickinBoard} from '../server/quickin-board';
import {quickinFieldPlan,type QuickinField} from '../server/quickin-form';
import {readFile,writeFile} from 'node:fs/promises';
const boards=process.argv.slice(2).filter(v=>/^[a-z0-9_-]+$/.test(v));
if(!boards.length)throw Error('Specify publicly verified boards');
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)});
 const [r]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const results=[];
 for(const board of boards){try{
  const site=JSON.parse((await readPublicPage(`https://api.quickin.io/public/careersites/${board}`)).html);
  if(site.slug!==board||!site.name||!/^[a-f0-9]{24}$/.test(site.account_id))throw Error('Unverified board');
  const discovery=await discoverQuickinBoard({id:`quickin-board:${board}`,type:'manual',company:site.name,board,enabled:true,discovery:true,application:true,status:''},r.data);
  const jobs=[];
  for(const job of discovery.jobs){
   const posting=job.destinations![0].url.split('/').at(-2);
   const response=await readPublicPage(`https://api.quickin.io/public/${site.account_id}/apply-form-schema?job_id=${posting}&origin=applied`);
   const fields:QuickinField[]=JSON.parse(response.html),plan=quickinFieldPlan(fields,r.data.profile,job.destinations![0].url);
   jobs.push({url:job.url,title:job.title,company:job.company,publishedAt:job.publishedAt,score:job.match.score,blockers:job.match.blockers,modality:job.modality,alreadyApplied:r.data.applications.some(a=>r.data.jobs.find(j=>j.id===a.jobId)?.url===job.url),missingRequired:plan.missing,requiredFields:fields.filter(f=>f.required).map(f=>({name:f.name,label:f.label,type:f.type})),description:job.description});
  }
  results.push({board,company:site.name,method:discovery.method,jobs});
 }catch(e){results.push({board,error:e instanceof Error?e.message:'Inspection failed'});}}
 let previous:{results:any[]}={results:[]};try{previous=JSON.parse(await readFile('artifacts/submittable-expansion-2026-10-23.json','utf8'));}catch{}
 const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,results:[...previous.results.filter(r=>!boards.includes(r.board)),...results]};
 await writeFile('artifacts/submittable-expansion-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
