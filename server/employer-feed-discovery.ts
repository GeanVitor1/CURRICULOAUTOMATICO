import {load} from 'cheerio';
import type {Job,Source,Workspace} from '../shared/types';
import {employerPostUrl,jobFromEmployerPost} from './employer-posts';
import {emailDestinationReady} from './email-destination';
import {readPublicPage,type PublicPage} from './public-web';
import {discoveryBudgetExpired} from './discovery-budget';

export const employerFeedSource:Source={id:'employer-channel-updates',board:'employer-channel-updates',type:'manual',company:'Atualizações das empresas com canal verificado',enabled:true,discovery:true,application:false,status:'Consulta pública de anúncios das empresas'};
function records(page:PublicPage) {
  const $=load(page.html), result:Record<string,any>[]=[];
  for(const node of $('script[type="application/ld+json"]').toArray()) {
    try {const value=JSON.parse($(node).text());result.push(...(Array.isArray(value)?value:value['@graph']||[value]));}catch{/* No structured evidence. */}
  }
  return result;
}
function companyUrl(value:unknown) {
  if(typeof value!=='string') return null;
  try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && /(^|\.)linkedin\.com$/.test(u.hostname) && /^\/company\/[^/]+\/?$/.test(u.pathname) ? u.href : null;}catch{return null;}
}
export function employerFeedAnchors(w:Workspace) {
  return w.jobs.filter(j=>emailDestinationReady(j)&&employerPostUrl(j.url)).map(j=>j.url).slice(0,4);
}
/** Follow new public posts from employers whose application channel was already
 * verified, without a search subscription or candidate/browser session. Each new
 * post is independently re-read and its email channel verified before queueing. */
export async function discoverEmployerUpdates(w:Workspace,read:(url:string)=>Promise<PublicPage>=readPublicPage) {
  const cache=new Map<string,Promise<PublicPage>>();
  const get=(url:string)=>{if(!cache.has(url))cache.set(url,read(url));return cache.get(url)!;};
  const employers=new Set<string>(),seen=new Set<string>(),jobs:Job[]=[];
  for(const anchor of employerFeedAnchors(w)) {
    if(discoveryBudgetExpired()||employers.size>=2)break;
    try {
      const post=await get(anchor);
      if(post.status>=400)continue;
      const author=records(post).find(r=>r['@type']==='SocialMediaPosting'&&r.author?.['@type']==='Organization')?.author;
      const organization=companyUrl(author?.url);
      if(!organization||employers.has(new URL(organization).pathname))continue;
      employers.add(new URL(organization).pathname);
      const feed=await get(organization);
      if(feed.status>=400||!companyUrl(feed.url)||new URL(feed.url).pathname.replace(/\/$/,'')!==new URL(organization).pathname.replace(/\/$/,''))continue;
      const links=records(feed).filter(r=>r['@type']==='SocialMediaPosting'&&companyUrl(r.author?.url)&&new URL(r.author.url).pathname.replace(/\/$/,'')===new URL(organization).pathname.replace(/\/$/,'')&&
        Number.isFinite(Date.parse(r.datePublished))&&Date.parse(r.datePublished)<=Date.now()&&Date.now()-Date.parse(r.datePublished)<=w.filters.ageDays*86400000)
        .map(r=>r.url||r.mainEntityOfPage).filter((url):url is string=>typeof url==='string'&&employerPostUrl(url));
      for(const url of [...new Set(links)].slice(0,6)) {
        if(discoveryBudgetExpired())break;
        if(seen.has(url))continue;seen.add(url);
        const page=await get(url),job=await jobFromEmployerPost(page,get);
        if(job)jobs.push(job);
      }
    }catch{/* A publisher failure cannot create an application. Other employers continue. */}
  }
  return {jobs,cached:false,checkedAt:new Date().toISOString(),method:'novos anúncios públicos de empresas com e-mail verificado'};
}
