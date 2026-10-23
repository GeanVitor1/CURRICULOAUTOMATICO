import {writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {readPublicPage} from '../server/public-web';
import {jobFromQuickinPage} from '../server/quickin-board';
import {screenDiscovery} from '../server/discovery-quality';
import {analyze} from '../server/engine';
import type {Source} from '../shared/types';
const boards=['starta','beltis','domvsit'];
const {store,operatorEmail}=await operatorStore();
try{
 const [u]=await store.select('users',{where:eq('email',operatorEmail)}),[r]=await store.select('workspaces',{where:and(eq('userId',u.id),eq('demo',false))});
 const results=[];
 for(const board of boards){
  const site=JSON.parse((await readPublicPage(`https://api.quickin.io/public/careersites/${board}`)).html);
  if(site.slug!==board||!site.name)throw Error('Unverified public board');
  const source:Source={id:`quickin-board:${board}`,board,company:site.name,type:'manual',enabled:true,discovery:true,application:false,status:''};
  const list=JSON.parse((await readPublicPage(`https://api.quickin.io/public/careersites/${board}/jobs?sort=-created_at&limit=12&page=1`)).html);
  const jobs=[];for(const entry of list.docs.slice(0,12))if(entry.publicate==='published'&&/desenvolv|developer|analista.*sistemas/i.test(entry.title||'')){
   const j=jobFromQuickinPage(source,await readPublicPage(entry.career_url));if(j)jobs.push(j);
  }
  const s=screenDiscovery(r.data,source,jobs,new Date().toISOString());
  results.push({source,publicationsRead:jobs.length,productivity:s.productivity,jobs:jobs.map(j=>({url:j.url,title:j.title,publishedAt:j.publishedAt,requiredSkills:j.requiredSkills,match:analyze(j,r.data.profile,r.data.filters)}))});
 }
 const report={at:new Date().toISOString(),readOnly:true,employerWrites:0,filtersUnchanged:true,results};await writeFile('artifacts/targeted-source-quality-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(results.map(r=>({board:r.source.board,read:r.publicationsRead,productivity:r.productivity}))));
}finally{await store.close();}
