import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
import {readPublicPage} from '../server/public-web';
import {structuredJobs,publicationFromStructured} from '../server/destination-page';
import {analyze,matchesObjectiveFilters,extractSkills} from '../server/engine';
import type {Job} from '../shared/types';
const {store,operatorEmail}=await operatorStore();
try{
const [user]=await store.select('users',{where:eq('email',operatorEmail)});
const [row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
let urls=process.argv.includes('--expand')?[
'https://jobs.quickin.io/verity/jobs/6a8c7f5a9766d500137c0b1e',
'https://jobs.quickin.io/globalti/jobs/6941b6764a59310013824f2f',
'https://jobs.quickin.io/sinqia/jobs/6ac8f1b63156750013366368',
'https://jobs.quickin.io/sinqia/jobs/6aa00e0056ac770013d74a21',
'https://jobs.quickin.io/beltis/jobs/6ad65952dd63cb0013761316',
'https://jobs.quickin.io/sinqia/jobs/6810e631ef17af00139660f1',
]:['https://jobs.quickin.io/insightit/jobs/6ada4a95845ace001364ca99'];
if(process.argv.includes('--boards')){
 urls=[];
 for(const board of ['qintess','sinqia','verity','globalti','beltis','rptalentos','infox']){
  try{const response=await readPublicPage(`https://api.quickin.io/public/careersites/${board}/jobs?sort=-created_at&limit=12&page=1`),v=JSON.parse(response.html);
   for(const j of v.docs||[]){if(j.publicate==='published'&&/desenvolv|developer|analista.*sistemas/i.test(j.title)&&j.career_url?.startsWith(`https://jobs.quickin.io/${board}/jobs/`))urls.push(j.career_url);}
  }catch{}
 }
}
const results=[];
for(const url of urls){try{
const page=await readPublicPage(url);
const data=structuredJobs(page.html)[0];
if(!data){results.push({url,blocked:'no_structured_posting'});continue;}
const base={id:randomUUID(),title:'',company:'',url:page.url,source:'Quickin',description:'',location:'Não informado',modality:'Não informado',level:'Não informado',contract:'Não informado',salaryMin:null,salaryMax:null,currency:'',skills:[],requiredSkills:[],requiredYears:null,publishedAt:null,discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,origins:[],match:{} as Job['match']} satisfies Job;
const job=publicationFromStructured(base,data,page.url)!;
job.publishedAt=data.datePosted;job.skills=extractSkills(job.title+' '+job.description);job.requiredYears=null;job.requiredSkills=[];
const match=analyze(job,row.data.profile,row.data.filters);
results.push({job,match,objective:matchesObjectiveFilters(job,row.data.profile,row.data.filters),minimum:row.data.routine.minScore});
}catch{results.push({url,blocked:'read_failed'});}}
await writeFile(process.argv.includes('--boards')?'artifacts/quickin-board-yield-2026-10-23.json':process.argv.includes('--expand')?'artifacts/quickin-expanded-compatibility-2026-10-23.json':'artifacts/quickin-compatibility-2026-10-23.json',JSON.stringify({at:new Date().toISOString(),readOnly:true,results},null,2));
console.log(JSON.stringify(results.map((r:any)=>r.job?{title:r.job.title,url:r.job.url,publishedAt:r.job.publishedAt,score:r.match.score,confidence:r.match.confidence,blockers:r.match.blockers,objective:r.objective,minimum:r.minimum}:r)));
}finally{await store.close();}
