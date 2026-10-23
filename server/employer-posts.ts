import { load } from 'cheerio';
import { randomUUID } from 'node:crypto';
import type { Job } from '../shared/types';
import type { PublicPage } from './public-web';
import { classify, extractSkills } from './engine';
import { verifyEmailDestination } from './email-destination';

export function employerPostUrl(value:string) {
  try {const u=new URL(value);return u.protocol==='https:' && /(^|\.)linkedin\.com$/.test(u.hostname) && /^\/(posts\/|feed\/update\/)/.test(u.pathname);}catch{return false;}
}
/** A model may find the URL; only the employer's own publication supplies facts. */
export async function jobFromEmployerPost(page:PublicPage,read:(url:string)=>Promise<PublicPage>):Promise<Job|null> {
  if(page.status>=400 || !employerPostUrl(page.url)) return null;
  const $=load(page.html),posts:Record<string,any>[]=[];
  for(const node of $('script[type="application/ld+json"]').toArray()) {
    try {const record=JSON.parse($(node).text());posts.push(...(Array.isArray(record)?record:record['@graph'] || [record]).filter((r:any)=>r['@type']==='SocialMediaPosting'));}catch{/* No evidence. */}
  }
  if(posts.length!==1) return null;
  const p=posts[0];
  if(p.author?.['@type']!=='Organization' || typeof p.author.name!=='string' || typeof p.articleBody!=='string' || p.articleBody.length<80) return null;
  // Employers often open with an introduction before naming the position.
  // Extract only a title literally stated in that same employer publication.
  const explicit=p.articleBody.match(/\b(?:oportunidade aberta para|estamos contratando|vaga (?:para|de))\s+([^\n!,]+)/iu)?.[1]?.replace(/\.(?:\s|$).*$/,'');
  const headline=explicit || (typeof p.headline==='string' ? p.headline : p.articleBody.split('\n')[0]);
  const title=headline.replace(/^[^\p{L}\d]+/u,'').replace(/^(?:estamos com (?:uma )?oportunidade aberta para|(?:vaga(?: aberta)?|oportunidade)\s*(?:para|de)?\s*[:–—-]?|estamos contratando\s*[:–—-]?)\s*/i,'').replace(/[!\s]+$/,'').trim();
  if(!title || title.length>200 || (title===headline.trim() && !/^(?:pessoa\s+)?(?:desenvolved|developer|analista|programador|arquiteto|software|engenheir|engineer|full.?stack)/i.test(title)) || !Number.isFinite(Date.parse(p.datePublished)) || Date.parse(p.datePublished)>Date.now()) return null;
  const classified=classify(`${title}\n${p.articleBody}`);
  const job:Job={id:randomUUID(),title,company:p.author.name,url:page.url,source:'Publicação da empresa',description:p.articleBody,
    location:typeof p.contentLocation?.name==='string'?p.contentLocation.name:'Não informado',...classified,
    salaryMin:null,salaryMax:null,currency:'BRL',skills:extractSkills(p.articleBody),requiredSkills:[],requiredYears:null,
    publishedAt:new Date(p.datePublished).toISOString(),discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,
    origins:[{source:'company',url:page.url,id:page.url}],match:{} as Job['match']};
  try {job.emailDestination=await verifyEmailDestination(job,undefined,url=>url===page.url?Promise.resolve(page):read(url));return job;}catch{return null;}
}
