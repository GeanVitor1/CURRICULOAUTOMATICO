import {randomUUID,createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {Job,Source,Workspace} from '../shared/types';
import {readPublicPage,type PublicPage} from './public-web';
import {detectAts} from './ats-registry';
import {publicationFromStructured,structuredJobs,applicationLinks} from './destination-page';
import {analyze,extractSkills,matchesObjectiveFilters} from './engine';
import {discoveryBudgetExpired} from './discovery-budget';
import {mandatoryTechnicalSkills} from './mandatory-requirements';
export function configuredQuickinBoards():Source[]{
 try{const values=JSON.parse(process.env.DISCOVERY_QUICKIN_BOARDS||'[]');if(!Array.isArray(values))return [];
 return values.slice(0,10).flatMap(v=>typeof v.company==='string'&&v.company.trim()&&/^[a-z0-9_-]{1,100}$/i.test(v.board||'')?[{id:`quickin-board:${v.board}`,type:'manual' as const,board:v.board,company:v.company.trim(),enabled:true,discovery:true,application:true,status:'Formulário público Quickin'}]:[]);
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
 const jobs:Job[]=[];let inspected=0;
 const listing=await read(`https://api.quickin.io/public/careersites/${source.board}/jobs?sort=-created_at&limit=12&page=1`);
 if(listing.status!==200)throw Error('Catálogo público Quickin indisponível');
 const data=JSON.parse(listing.html);
 if(!Array.isArray(data.docs))throw Error('Catálogo público Quickin inválido');
 for(const entry of data.docs.slice(0,12)){
  if(discoveryBudgetExpired())break;
  if(entry.publicate!=='published'||typeof entry.career_url!=='string'||detectAts(entry.career_url)?.board!==source.board||!/desenvolv|developer|analista.*sistemas/i.test(entry.title||''))continue;
  inspected++;const job=jobFromQuickinPage(source,await read(entry.career_url));if(!job)continue;
  const match=analyze(job,w.profile,w.filters);
  // This source is deployed for compatible public forms, rather than bulk ads.
  if(matchesObjectiveFilters(job,w.profile,w.filters)&&!match.blockers.length&&match.confidence!=='insufficient'&&match.score>=w.routine.minScore){job.match=match;jobs.push(job);}
 }
 return {jobs,examined:inspected,checkedAt:new Date().toISOString(),cached:false,method:`formulários públicos; ${inspected} publicações examinadas; ${jobs.length} compatíveis`};
}
