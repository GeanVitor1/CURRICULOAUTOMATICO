import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {readPublicPage} from '../server/public-web';
const prior=JSON.parse(await readFile('artifacts/automation-production-final-2026-10-23.json','utf8'));
const jobs=prior.jobs.filter((j:any)=>j.compatible&&!j.application&&!j.destinations?.length);
async function inspect(url:string){
  try {const page=await readPublicPage(url,AbortSignal.timeout(25000)), $=load(page.html);
    const links=$('a[href]').toArray().map(n=>({label:$(n).text().replace(/\s+/g,' ').trim(),url:new URL($(n).attr('href')!,page.url).href}));
    const structured=$('script[type="application/ld+json"]').toArray().flatMap(n=>{try{const v=JSON.parse($(n).text());return Array.isArray(v)?v:v['@graph']||[v];}catch{return [];}});
    const text=$('body').clone().find('script,style').remove().end().text().replace(/\s+/g,' ').trim();
    return {url:page.url,status:page.status,title:$('h1').first().text(),links:links.filter(l=>/appl|candidat|carreir|trabalhe|website|gupy|mailto:|talento|vagas/i.test(l.label+' '+l.url)),
      forms:$('form').toArray().map(n=>({action:$(n).attr('action'),method:$(n).attr('method'),password:$(n).find('input[type="password"]').length>0})),
      structured:structured.filter(v=>v['@type']==='JobPosting'),text:text.slice(0,23000)};
  }catch(e){return {url,error:e instanceof Error?e.message:'read_failed'};}
}
const results=[];
for(const job of jobs){
  const decoded=JSON.parse(Buffer.from(new URL(job.url).pathname.split('/')[2],'base64').toString());
  const official=`${new URL(job.url).origin}/jobs/${decoded.jobId}`;
  const posting=await inspect(official);
  const apply=(posting.links||[]).find(l=>/\/candidates\/jobs\/.*\/apply/.test(l.url));
  results.push({jobId:job.id,company:job.company,title:job.title,originalUrl:job.url,posting,apply:apply?await inspect(apply.url):null});
}
const sites=await Promise.all(['https://www.pixeon.com/','https://www.softplan.com.br/carreiras/','https://www.vissimo.com.br/','https://www.bancorbras.com.br/','https://www.libbs.com.br/','https://www.lanlink.com.br/','https://domo.gupy.io/'].map(inspect));
await writeFile('artifacts/eight-official-destinations-2026-10-23.json',JSON.stringify({at:new Date().toISOString(),readOnly:true,results,sites},null,2));
console.log(JSON.stringify(results.map(r=>({company:r.company,title:r.title,status:r.posting.status,error:r.posting.error,apply:r.apply?.url,structured:r.posting.structured?.map(v=>({title:v.title,datePosted:v.datePosted,validThrough:v.validThrough})),links:r.posting.links})),null,2));
