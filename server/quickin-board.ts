import {randomUUID,createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {Job,Source,Workspace} from '../shared/types';
import {readPublicPage,type PublicPage} from './public-web';
import {detectAts} from './ats-registry';
import {publicationFromStructured,structuredJobs,applicationLinks} from './destination-page';
import {extractSkills,matchesRoleTitle,eligibleForDestinationResearch} from './engine';
import {discoveryBudgetExpired} from './discovery-budget';
import {mandatoryTechnicalSkills} from './mandatory-requirements';
import {discoveryCandidateLimit,takeDiscoveryCandidate} from './discovery-limits';
import {permittedDiscoverySource} from '../shared/job-source-policy';
export function configuredQuickinBoards():Source[]{
 try{const primary=JSON.parse(process.env.DISCOVERY_QUICKIN_BOARDS||'[]'),additional=JSON.parse(process.env.DISCOVERY_QUICKIN_ADDITIONAL_BOARDS||'[]');
 const values=[...(Array.isArray(primary)?primary:[]),...(Array.isArray(additional)?additional:[])],seen=new Set<string>();
 return values.slice(0,30).flatMap(v=>v&&typeof v.company==='string'&&v.company.trim()&&/^[a-z0-9_-]{1,100}$/i.test(v.board||'')&&!seen.has(v.board)&&(seen.add(v.board),true)?[{id:`quickin-board:${v.board}`,type:'manual' as const,board:v.board,company:v.company.trim(),enabled:true,discovery:true,application:true,status:'Formulário público Quickin'}]:[]).filter(permittedDiscoverySource);
 }catch{return [];}
}
/** Only an explicitly mandatory section creates technical requirements. */
export const quickinMandatorySkills=mandatoryTechnicalSkills;
export function jobFromQuickinPage(source:Source,page:PublicPage):Job|null{
 const ats=detectAts(page.url),data=structuredJobs(page.html);
 if(page.status!==200||ats?.platform!=='quickin'||ats.board!==source.board||data.length!==1||data[0].hiringOrganization?.name?.trim()!==source.company||data[0].url!==page.url||!Number.isFinite(Date.parse(data[0].datePosted))||Date.parse(data[0].datePosted)>Date.now())return null;
 const base:Job={id:randomUUID(),title:'',company:'',url:page.url,source:'Quickin · anúncio oficial',description:'',location:'Não informado',modality:'Não informado',level:'Não informado',contract:'Não informado',salaryMin:null,salaryMax:null,currency:'',skills:[],requiredSkills:[],requiredYears:null,publishedAt:null,discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,origins:[],match:{score:0,strengths:[],gaps:[],blockers:[],matchedSkills:[],missingSkills:[],radar:false,explanation:''}};
 const record={...data[0],description:load(data[0].description).text()};
 const j=publicationFromStructured(base,record,page.url);
 if(!j||j.availability==='closed'||j.description.length<80)return null;
 const apply=applicationLinks(page,j.title).find(url=>url===`${page.url}/apply`);
 if(!apply)return null;
 const at=new Date().toISOString(),expiresAt=new Date(Date.now()+86400000).toISOString();
 j.publishedAt=new Date(data[0].datePosted).toISOString();j.skills=extractSkills(j.title+' '+j.description);
 j.requiredSkills=quickinMandatorySkills(data[0].description);
 j.origins=[{source:'quickin',url:j.url,id:`${ats.board}:${ats.postingId}`}];
 j.applicationUrls=[{url:apply,source:'Link de candidatura da publicação Quickin'}];
 j.destinations=[{id:createHash('sha256').update(apply).digest('hex').slice(0,24),url:apply,publicationUrl:j.url,platform:'quickin',company:j.company,state:'verified',formFound:true,method:'browser',confidence:100,verifiedAt:at,expiresAt,evidence:['Anúncio oficial com data de publicação e link de candidatura.','Formulário público Quickin; preflight obrigatório antes de transmitir dados.']}];
 j.resolution={state:'verified',complete:true,checkedAt:at,retryAt:expiresAt,consulted:[{source:j.url,count:1,outcome:'Publicação e link de formulário identificados.'}],matches:[],message:'Formulário Quickin identificado; campos obrigatórios serão conferidos antes de qualquer transmissão.'};
 return j;
}
/** List API observed in the publisher UI. A listing never supplies a submission
 * endpoint or date; each potentially eligible job is re-read in its official page. */
export async function discoverQuickinBoard(source:Source,w:Workspace,read=readPublicPage){
 if(!permittedDiscoverySource(source))throw Error('Fonte retirada da descoberta automática.');
 if(!/^[a-z0-9_-]{1,100}$/i.test(source.board))throw Error('Quadro Quickin inválido');
 const jobs:Job[]=[];let inspected=0,examined=0;
 const saved=w.routine.discoveryCheckpoints?.[source.id];
 let cursor={page:1,offset:0};
 if(saved?.pending){try{const v=JSON.parse(saved.cursor);if(Number.isInteger(v.page)&&v.page>0&&v.page<=200&&Number.isInteger(v.offset)&&v.offset>=0&&v.offset<50)cursor=v;}catch{/* Start from the first published page. */}}
 const batch=Math.max(1,Math.min(120,Number(process.env.QUICKIN_DISCOVERY_BATCH_SIZE)||40));
 const pages=Math.max(1,Math.min(10,Number(process.env.QUICKIN_DISCOVERY_PAGE_LIMIT)||3));
 const firstJob=w.filters.titles.some(title=>/primeiro emprego|sem experi[eê]ncia/i.test(title));
 let pending=true;
 for(let pageCount=0;pageCount<pages&&pending;pageCount++){
  if(discoveryBudgetExpired()||!discoveryCandidateLimit(1))break;
  const listing=await read(`https://api.quickin.io/public/careersites/${source.board}/jobs?sort=-created_at&limit=50&page=${cursor.page}`);
  if(listing.status!==200)throw Error('Catálogo público Quickin indisponível');
  const data=JSON.parse(listing.html);
  if(!Array.isArray(data.docs))throw Error('Catálogo público Quickin inválido');
  const docs=data.docs.slice(0,50);
  for(;cursor.offset<docs.length;cursor.offset++){
   if(discoveryBudgetExpired()||inspected>=batch)break;
   if(!takeDiscoveryCandidate())break;
   const entry=docs[cursor.offset];examined++;
   if(entry.publicate!=='published'||typeof entry.title!=='string'||typeof entry.career_url!=='string'||detectAts(entry.career_url)?.board!==source.board||(!firstJob&&!matchesRoleTitle(entry.title,w.filters.titles,w.profile.headline)))continue;
   inspected++;
   try{
    const job=jobFromQuickinPage(source,await read(entry.career_url));
    // Central screening decides compatibility and records exclusions. Discovery
    // must not silently discard low scores or missing fields before that stage.
    if(job&&eligibleForDestinationResearch(job,w))jobs.push(job);
   }catch{/* A failed publication does not hide the following occupations. */}
  }
  if(cursor.offset<docs.length)break;
  const next=typeof data.hasNextPage==='boolean'?data.hasNextPage:
   typeof data.totalPages==='number'?cursor.page<data.totalPages:
   typeof data.pages==='number'?cursor.page<data.pages:
   typeof data.total==='number'&&typeof data.limit==='number'&&data.limit>0?cursor.page*data.limit<data.total:
   docs.length===(typeof data.limit==='number'?data.limit:50);
  pending=next&&cursor.page<200;
  if(pending)cursor={page:cursor.page+1,offset:0};
  else cursor={page:1,offset:0};
 }
 return {jobs,examined,checkedAt:new Date().toISOString(),cached:false,
  checkpoint:{cursor:JSON.stringify(cursor),pending},
  method:`formulários públicos por cargo; ${examined} registros consultados; ${inspected} publicações examinadas`};
}
