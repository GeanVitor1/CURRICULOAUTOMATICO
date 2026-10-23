import {load} from 'cheerio';
import {randomUUID,createHash} from 'node:crypto';
import type {Job,Source,Workspace} from '../shared/types';
import {classify,extractSkills,normalize} from './engine';
import {nuxtPublicData} from './nuxt-public-data';
import {readPublicPage,type PublicPage} from './public-web';
import {discoveryBudgetExpired} from './discovery-budget';
import {canonicalJobUrl} from './job-identity';

export const ablerSource:Source={id:'official-abler-email',type:'manual',board:'https://candidatos.abler.com.br/sitemap.xml',company:'Abler · candidaturas por e-mail da vaga',enabled:true,discovery:true,application:true,status:'Anúncios e endereços publicados pela plataforma'};
export function ablerPublication(page:PublicPage) {
  const url=new URL(page.url);
  if(page.status!==200||url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='candidatos.abler.com.br'||/^[a-z0-9-]+\.abler\.com\.br$/.test(url.hostname))||!/^\/vagas\/[^/]+\/?$/.test(url.pathname))return null;
  const v=nuxtPublicData(page.html)?.state?.candidate?.vacancy?.vacancy;
  if(!v||v.provider!=='abler'||typeof v.id!=='string'||!/^\d{2,12}$/.test(v.id)||v.identifier!==`abler-${v.id}`||v.slug!==url.pathname.split('/').filter(Boolean).at(-1)||v.released!==true||v.hideCompany||v.status!=='Em andamento'||typeof v.title!=='string'||typeof v.companyName!=='string'||!v.companyName.trim()||typeof v.allDescriptions!=='string'||v.allDescriptions.length<80||!Number.isFinite(Date.parse(v.publishedAt))||Date.parse(v.publishedAt)>Date.now())return null;
  // The recipient must be explicitly published in the job data. Never derive
  // an address from an ID when the publisher has not exposed this channel.
  if(v.candidatureEmailAddress!==`vaga-${v.id}@vagas.abler.in`||(v.closeOn&&Number.isFinite(Date.parse(v.closeOn))&&Date.parse(v.closeOn)<Date.now()))return null;
  return v;
}
export function ablerEmailDestination(job:Job,page:PublicPage):NonNullable<Job['emailDestination']>|null {
  const v=ablerPublication(page);
  if(!v||canonicalJobUrl(page.url)!==canonicalJobUrl(job.url)||job.requisitionId!==`abler-${v.id}`||Date.parse(job.publishedAt||'')!==Date.parse(v.publishedAt)||normalize(v.title)!==normalize(job.title)||normalize(v.companyName)!==normalize(job.company))return null;
  return {email:v.candidatureEmailAddress,publicationUrl:job.url,employerUrl:page.url,publishedAt:new Date(v.publishedAt).toISOString(),verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
}
export function jobFromAblerPage(page:PublicPage):Job|null {
  const v=ablerPublication(page);if(!v)return null;
  const content=load(v.allDescriptions);content('br').replaceWith('\n');content('p,li,h1,h2,h3,div').append('\n');
  const description=content.text().replace(/\s+/g,' ').trim();
  const types=(v.workTypes||[]).map((x:any)=>x.id);
  const modality=types.length===1?({remoto:'Remoto',presencial:'Presencial',hibrido:'Híbrido'} as Record<string,string>)[types[0]]:undefined;
  const classified=classify(`${v.title}\n${description}`),location=[v.address?.cityName,v.address?.stateAbbr,v.address?.country].filter(Boolean).join(', ')||'Não informado';
  const salary=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0?x:null;
  const job:Job={id:randomUUID(),title:v.title.trim(),company:v.companyName.trim(),url:page.url,source:'Abler · anúncio oficial',description,location,...classified,modality:modality||classified.modality,
    contract:v.contractingRegime==='clt'?'CLT':v.contractingRegime==='pj'?'PJ':classified.contract,
    salaryMin:salary(v.initialSalaryRange)||salary(v.salaryValue),salaryMax:salary(v.finalSalaryRange)||salary(v.salaryValue),currency:'BRL',skills:extractSkills(`${v.title}\n${description}`),requiredSkills:[],publishedAt:new Date(v.publishedAt).toISOString(),discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,requisitionId:`abler-${v.id}`,geographicEligibility:v.address?.country||location,origins:[{source:'company',url:page.url,id:`abler:${v.id}`}],match:{} as Job['match']};
  job.emailDestination=ablerEmailDestination(job,page)!;
  return job;
}
export async function discoverAblerJobs(w:Workspace,read:(url:string)=>Promise<PublicPage>=readPublicPage) {
  const page=await read(ablerSource.board);
  if(page.status!==200||new URL(page.url).href!==ablerSource.board)throw new Error('O catálogo público da Abler não respondeu.');
  const $=load(page.html,{xmlMode:true}),cutoff=Date.now()-w.filters.ageDays*86400000;
  const hints=w.filters.titles.map(normalize).map(t=>t.replace(/[^a-z0-9]+/g,'-')).filter(Boolean);
  const entries=$('url').toArray().map(n=>({url:$(n).find('loc').text(),modified:Date.parse($(n).find('lastmod').text())})).flatMap(item=>{
    try {
      const u=new URL(item.url),slug=u.pathname.split('/').at(-1)||'';
      if(u.origin!=='https://candidatos.abler.com.br'||!/^\/vagas\/[^/]+$/.test(u.pathname)||!Number.isFinite(item.modified)||item.modified<cutoff||item.modified>Date.now()||/banco-de-talentos/.test(slug))return [];
      const match=hints.reduce((score,h)=>{
        const words=h.split('-').filter(word=>word.length>=5),tokens=slug.split('-');
        const partial=h.startsWith('analista-')?words.length>1&&words.every(word=>tokens.includes(word)):words.some(word=>tokens.includes(word));
        return score+(slug.includes(h)?30:partial?5:0);
      },0);
      return match?[{...item,score:match}]:[];
    }catch{return [];}
  }).sort((a,b)=>b.score-a.score||b.modified-a.modified);
  const jobs:Job[]=[];
  // Lastmod only chooses pages to inspect; it is never the publication date.
  // Inspect more matching publications while retaining the worker's time budget.
  const candidates=[...new Set(entries.map(x=>x.url))];
  const fingerprint=createHash('sha256').update(JSON.stringify(candidates)).digest('hex').slice(0,16);
  const saved=w.routine.discoveryCheckpoints?.[ablerSource.id]?.cursor.split(':');
  const offset=saved?.[0]===fingerprint && /^\d+$/.test(saved[1]) ? Math.min(Number(saved[1]),candidates.length) : 0;
  const size=Math.max(2,Math.min(240,Number(process.env.ABLER_DISCOVERY_BATCH_SIZE)||120));
  const urls=candidates.slice(offset,offset+size);
  let visited=0;
  for(let i=0;i<urls.length;i+=2) {
    if(discoveryBudgetExpired())break;
    const found=await Promise.all(urls.slice(i,i+2).map(async url=>{
      try {const job=jobFromAblerPage(await read(url));return job&&Date.parse(job.publishedAt!)>=cutoff?job:null;}catch{return null;}
    }));
    jobs.push(...found.filter((j):j is Job=>!!j));
    visited+=found.length;
  }
  const next=offset+visited,pending=next<candidates.length;
  return {jobs,cached:false,checkedAt:new Date().toISOString(),checkpoint:{cursor:`${fingerprint}:${pending?next:0}`,pending},method:'catálogo público e e-mail individual da vaga; data confirmada no anúncio'};
}
