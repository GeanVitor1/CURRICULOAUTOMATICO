import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {readPublicPage} from '../server/public-web';
import {jobFromQuickinPage} from '../server/quickin-board';
import {analyze,matchesObjectiveFilters} from '../server/engine';
import {writeFile} from 'node:fs/promises';
const {store,operatorEmail}=await operatorStore();
try{
 const [user]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
 const results=[];
 for(const board of ['gestaltconsultoria','policonecta','pantheon','seekerh','verity']){
  const config=JSON.parse((await readPublicPage(`https://api.quickin.io/public/careersites/${board}`)).html);
  const list=JSON.parse((await readPublicPage(`https://api.quickin.io/public/careersites/${board}/jobs?sort=-created_at&limit=12&page=1`)).html);
  const urls=new Set<string>((list.docs||[]).filter((r:any)=>r.publicate==='published'&&/desenvolv|developer|analista.*sistemas/i.test(r.title)).map((r:any)=>r.career_url));
  if(board==='gestaltconsultoria')urls.add('https://jobs.quickin.io/gestaltconsultoria/jobs/6ab10f118b97c700124f4f75');
  if(board==='verity')urls.add('https://jobs.quickin.io/verity/jobs/6a4674330ad5470013fdea03');
  for(const url of urls){
   const job=jobFromQuickinPage({id:`quickin-board:${board}`,type:'manual',board,company:config.name,enabled:true,discovery:true,application:true,status:''},await readPublicPage(url));
   if(!job){results.push({url,parsed:false});continue;}
   const match=analyze(job,row.data.profile,row.data.filters),objective=matchesObjectiveFilters(job,row.data.profile,row.data.filters);
   results.push({url,company:job.company,title:job.title,publishedAt:job.publishedAt,modality:job.modality,score:match.score,blockers:match.blockers,objective,eligible:objective&&!match.blockers.length&&match.confidence!=='insufficient'&&match.score>=row.data.routine.minScore});
  }
 }
 await writeFile('artifacts/quickin-additional-channel-yield-2026-10-23.json',JSON.stringify({at:new Date().toISOString(),readOnly:true,results},null,2));console.log(JSON.stringify(results));
}finally{await store.close();}
