import {load} from 'cheerio';
import {writeFile} from 'node:fs/promises';
import {readPublicPage} from '../server/public-web';
const urls=process.argv.slice(2);
const results=[];
for(let i=0;i<urls.length;i+=2) {
  results.push(...await Promise.all(urls.slice(i,i+2).map(async url=>{
    try {
      const p=await readPublicPage(url),$=load(p.html),posts:any[]=[];
      for(const node of $('script[type="application/ld+json"]').toArray()) {
        try {const v=JSON.parse($(node).text());posts.push(...(Array.isArray(v)?v:v['@graph']||[v]).filter((r:any)=>r['@type']==='SocialMediaPosting').map((r:any)=>({url:r.url||r.mainEntityOfPage,author:r.author,date:r.datePublished,body:r.articleBody})));}catch{}
      }
      return {url:p.url,status:p.status,title:$('h1').first().text().trim(),posts};
    }catch{return {url,error:'Publicação não respondeu'};}
  })));
}
await writeFile(urls[0]?.includes('/posts/')?'artifacts/primary-employer-posts-2026-10-22.json':'artifacts/primary-employer-feeds-2026-10-22.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({...r,posts:r.posts?.map(p=>({...p,body:p.body?.slice(0,1000)}))})),null,2));
