import type {Page} from 'playwright';
import type {PortalApplication} from './portal-application';
import {gupyJobId} from './gupy-application';
import {normalized} from './job-identity';

export type GupyDraftProof={nativeApplicationId:string;continuationUrl:string;destinationUrl:string;resumeId:string;observedAt:string};
/** Read only: zero progress in the signed-in account AND the same job's own
 * curriculum still offers Começar. Neither signal alone authorizes resuming. */
export async function inspectGupyDraft(page:Page,input:PortalApplication,resumeId:string):Promise<GupyDraftProof|null>{
 const jobId=gupyJobId(input.job.url),tenant=new URL(input.job.url).hostname;
 if(!jobId||!tenant.endsWith('.gupy.io'))return null;
 await page.goto('https://portal.gupy.io/my/applications',{waitUntil:'domcontentloaded',timeout:20000});
 const ongoing=page.getByRole('tab',{name:'Em andamento',exact:true});
 await ongoing.waitFor({state:'visible',timeout:5000}).catch(()=>{});
 if(await ongoing.isVisible().catch(()=>false))await ongoing.click();
 await page.getByRole('heading',{name:input.job.title,exact:true}).first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
 for(const heading of await page.getByRole('heading',{name:input.job.title,exact:true}).all()){
  if(!await heading.isVisible())continue;
  const id=(await heading.getAttribute('id'))?.match(/^job-name-(\d+)$/)?.[1];
  if(!id)continue;
  const progress=page.locator(`[id="application-progress-${id}"]`);
  if(!await progress.isVisible().catch(()=>false))continue;
  const progressLabel=await progress.getAttribute('aria-label')||await progress.innerText();
  if(!/\b0\s+de\s+[1-9]\d*\b/.test(progressLabel))continue;
  const links=page.locator(`a[href*="/candidates/applications/${id}"]`);
  let target:URL|undefined;
  for(const link of await links.all()){
   const href=await link.getAttribute('href');if(!href)continue;
   const url=new URL(href,page.url());
   if(url.protocol==='https:'&&url.hostname===tenant&&url.pathname===`/candidates/applications/${id}`)target=url;
  }
  if(!target)continue;
  await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:20000});
  await page.getByRole('heading',{name:input.job.title,exact:true}).waitFor({state:'visible',timeout:10000}).catch(()=>{});
  const actual=new URL(page.url());if(actual.hostname!==tenant||actual.pathname!==target.pathname)return null;
  if(!await page.getByRole('heading',{name:input.job.title,exact:true}).isVisible().catch(()=>false))return null;
  const publication=await page.locator(`a[href*="/jobs/${jobId}"]`).all();
  if(!publication.length)return null;
  let sameJob=false;
  for(const link of publication){const href=await link.getAttribute('href');if(href){const url=new URL(href,page.url());sameJob ||= url.protocol==='https:'&&url.hostname===tenant&&url.pathname===`/jobs/${jobId}`;}}
  if(!sameJob)return null;
  const start=page.getByRole('button',{name:'Começar',exact:true});
  for(const button of await start.all())if(await button.isVisible()&&await button.isEnabled()&&await button.getAttribute('id')==='expandable-card-1'){
   if(normalized(await page.getByRole('heading',{name:input.job.title,exact:true}).innerText())!==normalized(input.job.title))return null;
   return {nativeApplicationId:id,continuationUrl:target.href,destinationUrl:input.job.url,resumeId,observedAt:new Date().toISOString()};
  }
  return null;
 }
 return null;
}
