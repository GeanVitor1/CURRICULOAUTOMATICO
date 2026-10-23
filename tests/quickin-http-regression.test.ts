import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {chromium,type Browser} from 'playwright';
import {createHash} from 'node:crypto';
import {defaultProfile} from '../shared/types';
import {confirmCandidateDetails} from './fixtures/candidate-details';
import {resumePdf} from './pdf-fixture';
vi.mock('../server/public-web',()=>({readPublicPage:vi.fn(async(url:string)=>({status:200,html:JSON.stringify(url.includes('careersites')?{slug:'globalti',name:'Global TI',account_id:'692a0e88fa9dcb00134dc379'}:[{name:'name',type:'short_text',label:'Nome completo',required:true},{name:'email',type:'email',label:'E-mail',required:true},{name:'resume_media_id',type:'media',label:'Currículo',required:true}])}))}));
import {executeQuickinForm} from '../server/quickin-form';
const publication='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0',url=`${publication}/apply`,api='https://api.quickin.io/public/692a0e88fa9dcb00134dc379';
let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});});
afterAll(async()=>{await browser?.close();});
async function run(status:number,options:{uploadStatus?:number;media?:unknown;showConfirmation?:boolean;invalidControl?:boolean;priorConfirmation?:boolean}={}){
 const context=await browser.newContext({serviceWorkers:'block'}),writes:string[]=[];
 const body=JSON.stringify({name:'ValidationError',errors:{email:{message:'PRIVATE_SENTINEL'}}});
 const posting={ '@type':'JobPosting',title:'Desenvolvedor',url:publication,hiringOrganization:{name:'Global TI'},description:'Desenvolvimento de sistemas com C# e .NET'};
 const html=`<script type="application/ld+json">${JSON.stringify(posting)}</script><h1>Desenvolvedor Global TI</h1>${options.priorConfirmation?'<p>Candidatura enviada!</p>':''}<form><label>Nome completo<input name="name" required></label><label>E-mail<input name="email" required type="email"></label>${options.invalidControl?'<input required name="unrecognized">':''}<button type="button" class="iti__selected-country" aria-label="Brazil (+55)"></button><input type="file"><button type="submit">Enviar candidatura</button></form><script>
 document.querySelector('input[type=file]').addEventListener('change',async()=>{await fetch('${api}/media/multipart',{method:'POST',body:'controlled-pdf'});});
 document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('${api}/apply',{method:'POST',body:JSON.stringify({name:document.querySelector('[name=name]').value,email:document.querySelector('[name=email]').value})});if(r.ok&&${options.showConfirmation!==false})document.body.insertAdjacentHTML('beforeend','<p>Candidatura enviada!</p>');});</script>`;
 await context.route('**/*',async route=>{
  const request=route.request();
  if(request.method()==='GET'&&request.url()===url)return route.fulfill({contentType:'text/html',body:html});
  if(request.method()==='POST'){
   writes.push(request.url());
   if(request.url()===`${api}/media/multipart`)return route.fulfill({status:options.uploadStatus||200,contentType:'application/json',body:JSON.stringify(options.media===undefined?{_id:'controlled-media'}:options.media)});
   if(request.url()===`${api}/apply`)return route.fulfill({status,contentType:'application/json',body:status>=400?body:'{}'});
  }
  return route.abort();
 });
 const p={...structuredClone(defaultProfile),confirmed:true,name:'Pessoa QA',email:'qa@example.test'};confirmCandidateDetails({profile:p} as any);
 try{
  const page=await context.newPage();
  // Keep a missing confirmation test bounded without changing the executor's production timeout.
  if(options.showConfirmation===false){const original=page.getByText.bind(page);vi.spyOn(page,'getByText').mockImplementation(((...args:any[])=>{const loc=original(...args as [any]);if(String(args[0]).includes('application'))vi.spyOn(loc,'first').mockImplementation(()=>{const first=original(...args as [any]).first();vi.spyOn(first,'waitFor').mockRejectedValue(new Error('Controlled missing confirmation'));return first;});return loc;}) as any);}
  const result=await executeQuickinForm(page,{applicationId:'controlled-only',job:{title:'Desenvolvedor',company:'Global TI',url:publication},destination:{id:'controlled',url,publicationUrl:publication,company:'Global TI',platform:'quickin',state:'verified',formFound:true,method:'browser',confidence:100,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidence:[]},profile:p,resume:{name:'qa.pdf',file:{name:'qa.pdf',mimeType:'application/pdf',data:resumePdf().toString('base64')}}});
  return{result,writes,body};
 }finally{await context.close();}
}
it.each([400,401,403,409,422,429,500,503])('HTTP %s records exact rejection and stays unknown without a receipt or retry',async status=>{
 const {result,writes,body}=await run(status);
 expect(writes).toEqual([`${api}/media/multipart`,`${api}/apply`]);
 expect(result).toMatchObject({status:'unknown',diagnostic:{httpStatus:status,fieldNames:['email'],responseSha256:createHash('sha256').update(body).digest('hex')}});
 expect(result.receipt).toBeUndefined();expect(result.retryable).toBeUndefined();expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
});
it.each([{uploadStatus:413},{media:{}},{invalidControl:true},{priorConfirmation:true}])('does not submit after blocked upload, malformed media, invalid controls or prior confirmation: %j',async options=>{
 const {result,writes}=await run(200,options);
 expect(result.status).toBe('action_required');expect(writes).not.toContain(`${api}/apply`);expect(result.receipt).toBeUndefined();
});
it('requires a visible destination confirmation after accepted HTTP',async()=>{
 const {result}=await run(201);
 expect(result).toMatchObject({status:'sent',diagnostic:{httpStatus:201,responseKind:'receipt_verified'}});
 expect(result.receipt).toMatch(/^Quickin: Candidatura enviada!/);
});
it('accepted HTTP without destination confirmation stays unknown',async()=>{
 const {result,writes}=await run(200,{showConfirmation:false});
 expect(writes).toContain(`${api}/apply`);expect(result.status).toBe('unknown');expect(result.receipt).toBeUndefined();expect(result.retryable).toBeUndefined();
 expect(result.diagnostic).toMatchObject({httpStatus:200,responseKind:'accepted_awaiting_confirmation'});
});
