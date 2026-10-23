import {load} from 'cheerio';
import {writeFile} from 'node:fs/promises';
import {readPublicPage} from '../server/public-web';
const url=new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');
url.search=new URLSearchParams({keywords:process.argv[2]||'.NET',location:'Brazil',f_TPR:'r1209600',f_WT:'2',start:'0'}).toString();
const p=await readPublicPage(url.href),$=load(p.html);
const urls=$('a.base-card__full-link').toArray().map(n=>{const u=new URL($(n).attr('href')!);u.search='';return u.href;});
const results=[];
for(let i=0;i<urls.length;i+=2)results.push(...await Promise.all(urls.slice(i,i+2).map(async url=>{
  try {
    const page=await readPublicPage(url),d=load(page.html),records=[];
    for(const n of d('script[type="application/ld+json"]').toArray())try{records.push(JSON.parse(d(n).text()));}catch{}
    const text=d('.show-more-less-html__markup').text().trim();
    const offsite=d('a[href]').toArray().map(n=>d(n).attr('href')!).filter(h=>/apply-link|offsite|externalApply|url=/.test(h));
    return {url,status:page.status,records,description:text,offsite,emails:text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)};
  }catch{return {url,error:'Anúncio não respondeu'};}
})));
await writeFile('artifacts/public-employer-jobs-2026-10-22.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({...r,records:r.records?.map((v:any)=>({type:v['@type'],title:v.title,date:v.datePosted,organization:v.hiringOrganization,location:v.jobLocation})),description:r.description?.slice(0,300)})),null,2));
