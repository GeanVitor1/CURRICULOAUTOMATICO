import {load} from 'cheerio';
import {createHash,randomUUID} from 'node:crypto';
import type {Job,Source} from '../shared/types';
import {classify,extractSkills} from './engine';
import {canonicalJobUrl,normalized} from './job-identity';
import {publicUrl,readPublicPage,type PublicPage} from './public-web';
import {discoveryBudgetExpired} from './discovery-budget';
export const WP_JOBS_EVIDENCE='Formulário WP Jobs Board verificado.';
export function configuredCompanyBoards():Source[] {
  try {const boards:unknown=JSON.parse(process.env.DISCOVERY_COMPANY_BOARDS||'[]');
    if(!Array.isArray(boards))return [];
    return boards.slice(0,10).flatMap(b=>{
      if(!b||typeof b.company!=='string'||!b.company.trim()||typeof b.url!=='string')return [];
      const url=publicUrl(b.url);
      return [{id:`company-board:${url.hostname}`,board:url.href,type:'manual' as const,company:b.company,enabled:true,discovery:true,application:true,status:'Página oficial da empresa'}];
    });
  }catch{return [];}
}
export function wpJobsForm(page:PublicPage) {
  const $=load(page.html);
  const forms=$('.wpjb-apply-form form').filter((_i,node)=>$(node).find('input[name="action"][value="apply-for-job"]').length===1&&$(node).find('input[type="file"][name="candidate-cv"]').length===1);
  if(page.status>=400||forms.length!==1)return null;
  const form=forms.first(),target=new URL(form.attr('action')||page.url,page.url);
  if(target.origin!==new URL(page.url).origin||(form.attr('method')||'').toLowerCase()!=='post')return null;
  if(form.is('[data-sitekey]')||form.find('input[type="password"], [data-sitekey], .h-captcha, .g-recaptcha, input[name*="captcha"], input[name*="token"]').length)return null;
  const fields=form.find('input,textarea,select').toArray();
  const standard=['candidate-name','candidate-email','candidate-cv','candidate-message','action'];
  const questions=fields.filter(n=>!standard.includes($(n).attr('name')||'')).map(n=>{
    const field=$(n),id=field.attr('id');
    const labels=id?form.find('label').filter((_i,label)=>$(label).attr('for')===id):field.closest('label');
    const label=labels.clone().find('input,select,textarea').remove().end().text()||field.attr('aria-label')||'';
    return {name:field.attr('name')||'',type:n.tagName==='select'?'select':n.tagName==='textarea'?'textarea':field.attr('type')||'text',
      label:label.replace(/\s+/g,' ').trim(),required:field.is('[required],[aria-required="true"]'),
      options:field.find('option').toArray().filter(option=>!!$(option).attr('value')&&!$(option).is('[disabled]')).map(option=>({value:$(option).attr('value')!,label:$(option).text().trim()}))};
  });
  // Unknown scripts, hidden tokens, file fields and ambiguous controls need a
  // separate adapter. Additional labelled questions use reviewed facts only.
  if(questions.some(q=>!q.name||!q.label||!['text','email','tel','url','number','textarea','select','checkbox'].includes(q.type)))return null;
  if(!['candidate-name','candidate-email'].every(name=>form.find(`[name="${name}"]`).length===1))return null;
  return {target:target.href,fields:fields.map(n=>({name:$(n).attr('name')!,value:$(n).attr('value')||''})),questions};
}
function publishedAt(page:PublicPage) {
  const $=load(page.html),dates=new Set<string>();
  for(const node of $('script[type="application/ld+json"]').toArray()) {
    try {const v=JSON.parse($(node).text());for(const r of (Array.isArray(v)?v:v['@graph']||[v])) {
      if(r['@type']==='WebPage'&&typeof r.url==='string'&&canonicalJobUrl(r.url)===canonicalJobUrl(page.url)&&Number.isFinite(Date.parse(r.datePublished))&&Date.parse(r.datePublished)<=Date.now())dates.add(new Date(r.datePublished).toISOString());
    }}catch{/* Unknown date stays unknown. */}
  }
  return dates.size===1?[...dates][0]:null;
}
export function jobFromCompanyPage(source:Source,page:PublicPage):Job|null {
  const $=load(page.html),wrapper=$('.wpjb-single-job-wrapper');
  if(new URL(page.url).origin!==new URL(source.board).origin||wrapper.length!==1||!wpJobsForm(page)||!normalized($('body').text()).includes(normalized(source.company)))return null;
  const post=wrapper.closest('.elementor-widget-theme-post-content');
  const title=$('h1').first().text().trim(),description=(post.length?post:wrapper).clone().find('.wpjb-apply-form-wrapper,.wpjb-apply-form').remove().end().text().replace(/\s+/g,' ').trim();
  const date=publishedAt(page);
  if(!title||description.length<80||!date)return null;
  const at=new Date().toISOString(),url=page.url;
  const destination={id:createHash('sha256').update(url).digest('hex').slice(0,24),url,platform:'company' as const,publicationUrl:url,verifiedAt:at,expiresAt:new Date(Date.now()+86400000).toISOString(),confidence:100,evidence:['Anúncio publicado no domínio oficial da empresa.',WP_JOBS_EVIDENCE],company:source.company,state:'verified' as const,formFound:true,method:'browser' as const};
  return {id:randomUUID(),title,company:source.company,url,source:'Página oficial da empresa',description,location:'Não informado',...classify(`${title}\n${description}`),salaryMin:null,salaryMax:null,currency:'BRL',skills:extractSkills(`${title}\n${description}`),requiredSkills:[],publishedAt:date,discoveredAt:at,saved:false,discarded:false,demo:false,origins:[{source:'company',url,id:url}],companyDomain:new URL(url).origin,destinations:[destination],resolution:{state:'verified',checkedAt:at,retryAt:destination.expiresAt,complete:true,consulted:[{source:source.board,count:1,outcome:WP_JOBS_EVIDENCE}],matches:[],message:'Formulário de candidatura confirmado no site oficial.'},match:{} as Job['match']};
}
export async function discoverCompanyBoard(source:Source,read:(url:string)=>Promise<PublicPage>=readPublicPage,cursor?:string) {
  const root=new URL(source.board),seen=new Set<string>(),jobs:Job[]=[];
  let next=source.board,offset=0,inspected=0;
  if(cursor) {
    try {const saved=JSON.parse(cursor);if(typeof saved.url==='string'&&Number.isInteger(saved.offset)&&saved.offset>=0){next=saved.url;offset=saved.offset;}}
    catch {next=cursor;}
  }
  const pageLimit=Math.max(1,Math.min(10,Number(process.env.COMPANY_DISCOVERY_PAGE_LIMIT)||4));
  const jobLimit=Math.max(2,Math.min(200,Number(process.env.COMPANY_DISCOVERY_BATCH_SIZE)||60));
  for(let page=0;next && page<pageLimit;page++) {
    if(discoveryBudgetExpired())break;
    const requested=new URL(next);
    if(requested.origin!==root.origin||!requested.pathname.startsWith(root.pathname)||seen.has(requested.href)) {next='';break;}
    seen.add(requested.href);
    const index=await read(requested.href);
    if(index.status>=400||new URL(index.url).origin!==root.origin)throw new Error('A página de vagas da empresa não respondeu.');
    const $=load(index.html);
    const urls=new Set<string>();
    for(const node of $('a[href]').toArray()) {
      try {const url=new URL($(node).attr('href')!,index.url);if(url.origin===root.origin&&url.pathname.startsWith(root.pathname)&&url.pathname!==root.pathname&&!/\/page\//.test(url.pathname)&&!url.search)urls.add(url.href);}catch{/* Ignore malformed links. */}
    }
    const publications=[...urls];
    for(;offset<publications.length;offset++) {
      if(discoveryBudgetExpired()||inspected>=jobLimit)break;
      inspected++;
      try {const job=jobFromCompanyPage(source,await read(publications[offset]));if(job)jobs.push(job);}catch{/* Preserve other publications and advance the finite checkpoint. */}
    }
    if(offset<publications.length)break;
    offset=0;
    const href=$('a[rel="next"],a.next.page-numbers,a.next').first().attr('href');
    next=href?new URL(href,index.url).href:'';
    if(next && (new URL(next).origin!==root.origin||!new URL(next).pathname.startsWith(root.pathname)||seen.has(next)))next='';
  }
  return {jobs,cached:false,checkedAt:new Date().toISOString(),checkpoint:{cursor:JSON.stringify({url:next||source.board,offset}),pending:!!next},method:'anúncios e formulários nativos no site oficial'};
}
