import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {normalized} from '../server/job-identity';
import {detectAts} from '../server/ats-registry';
const {store,operatorEmail}=await operatorStore();
try{
 const inspected=JSON.parse(await readFile('artifacts/eight-official-destinations-2026-10-23.json','utf8'));
 const browser=[...JSON.parse(await readFile('artifacts/eight-gupy-access-2026-10-23.json','utf8')),...JSON.parse(await readFile('artifacts/expanded-browser-channels-2026-10-23.json','utf8'))];
 const [owner]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',owner.id),eq('demo',false))});
 const at=new Date().toISOString(),until=new Date(Date.now()+86400000).toISOString();
 const report=await store.transaction(async tx=>{
  const [current]=await tx.select('workspaces',{where:eq('id',row.id),lock:true});const w=current.data;
  const filters=JSON.stringify(w.filters),history=JSON.stringify(w.applications),results=[];
  for(const record of inspected.results){
   const job=w.jobs.find(j=>j.id===record.jobId),target=record.apply?.url;
   const access=[...browser].reverse().find((p:any)=>p.url===target&&p.finalUrl===new URL('/candidates/signin',target).href);
   const ats=job&&detectAts(job.url);
   if(!job||!target||!access||record.posting.status!==200||normalized(job.title)!==normalized(record.posting.title)||ats?.platform!=='gupy'||new URL(target).origin!==new URL(job.url).origin||new URL(target).pathname!==`/candidates/jobs/${ats.postingId}/apply`||!record.posting.links.some((l:any)=>l.url===target)||w.applications.some(a=>a.jobId===job.id))throw Error('Current posting/inspection identity no longer matches');
   job.destinations=[{id:createHash('sha256').update(target).digest('hex').slice(0,24),url:target,publicationUrl:job.url,platform:'gupy',verifiedAt:at,expiresAt:until,confidence:100,evidence:['Link de candidatura lido na publicação oficial.','Inspeção pública sem sessão confirmou redirecionamento para /candidates/signin.','Inspeção de diagnóstico; nenhum dado de candidato transmitido.'],company:job.company,state:'login_required',formFound:false,method:'assisted'}];
   job.resolution={state:'no_destination',checkedAt:at,retryAt:until,complete:true,consulted:[...(job.resolution?.consulted||[]).slice(-12),{source:record.posting.url,count:1,outcome:'Anúncio aberto, com link público de candidatura.'},{source:target,count:1,outcome:'Navegador sem sessão redirecionou para login da Gupy.'}],matches:job.resolution?.matches||[],message:'O link oficial exige autenticação na Gupy. Não há executor independente autorizado para esse fluxo. Não foi encontrado canal alternativo publicado nas páginas corporativas examinadas.'};
   results.push({jobId:job.id,company:job.company,title:job.title,url:record.posting.url,applyUrl:target,state:'login_required',recovered:false});
  }
  if(filters!==JSON.stringify(w.filters)||history!==JSON.stringify(w.applications))throw Error('Unexpected change to filters/history');
  if(process.argv.includes('--apply'))await tx.update('workspaces',{data:w},eq('id',row.id));
  return {at,applied:process.argv.includes('--apply'),inspected:results.length,recovered:0,results,filtersUnchanged:true,historyUnchanged:true};
 });
 await writeFile('artifacts/eight-destinations-recorded-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
