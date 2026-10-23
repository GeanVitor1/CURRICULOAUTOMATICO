import type {Page,Locator} from 'playwright';
import type {Profile,SubmissionDiagnostic} from '../shared/types';
import type {AtsApplication} from './ats-application';
import type {ExecutionResult} from './application-verification';
import {approvedFieldAnswer} from './approved-answers';
import {normalized} from './job-identity';
import {detectAts} from './ats-registry';
import {readPublicPage} from './public-web';
import {createHash} from 'node:crypto';
import {structuredJobs} from './destination-page';
export type QuickinField={name:string;type:string;label:string;required?:boolean;gdpr?:boolean;options?:{value:string;label:string}[];validation?:{minLength?:number;maxLength?:number;minimum?:number;maximum?:number}};
const supported=['short_text','long_text','number','email','date','single_choice','boolean'];
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function valueFor(field:QuickinField,profile:Profile,url:string){
 const explicit=approvedFieldAnswer(field.label,profile,url);
 if(explicit!==undefined)return explicit;
 if(field.name==='experience_level'&&profile.confirmed)return profile.level||undefined;
 return undefined;
}
export function quickinFieldPlan(fields:QuickinField[],profile:Profile,url:string){
 const missing:string[]=[],answers:{field:QuickinField;value:string}[]=[];
 const names=new Set<string>();
 for(const f of fields){
  if(!f||typeof f.name!=='string'||typeof f.label!=='string'||names.has(f.name)){missing.push('Estrutura de formulário ambígua');continue;}names.add(f.name);
  // Informational messages contain no control or checkbox. Never manufacture
  // consent from them. Actual mandatory declarations still need a scoped answer.
  if(f.type==='message')continue;
  if(f.name==='resume_media_id'&&f.type==='media')continue;
  if(f.name==='phones'&&f.type==='array'){
   const phone=approvedFieldAnswer('Telefone',profile,url)?.replace(/\D/g,'');
   if(!phone||!/^(?:55)?\d{10,11}$/.test(phone)){if(f.required)missing.push(f.label);}else answers.push({field:f,value:phone.length<=11?`+55${phone}`:`+${phone}`});continue;
  }
  if(!supported.includes(f.type)){if(f.required)missing.push(f.label);continue;}
  let answer=valueFor(f,profile,url);
  if(answer===undefined||!answer.trim()){if(f.required)missing.push(f.label);continue;}
  if((f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer))||
    (f.type==='boolean'&&!/^(sim|n[aã]o|true|false|yes|no)$/i.test(answer))){if(f.required)missing.push(f.label);continue;}
  const options=f.options||[];
  if(options.length&&!options.some(o=>normalized(o.label)===normalized(answer!))){if(f.required)missing.push(f.label);continue;}
  const v=f.validation;
  if((v?.minLength!==undefined&&answer.length<v.minLength)||(v?.maxLength!==undefined&&answer.length>v.maxLength)||
    (f.type==='number'&&(!Number.isFinite(Number(answer))||(v?.minimum!==undefined&&Number(answer)<v.minimum)||(v?.maximum!==undefined&&Number(answer)>v.maximum)))){if(f.required)missing.push(f.label);continue;}
  if(/\bcpf\b/i.test(f.label)){
   answer=answer.replace(/\D/g,'');
   const valid=/^\d{11}$/.test(answer)&&!/^([0-9])\1{10}$/.test(answer)&&[9,10].every(n=>{const sum=answer!.slice(0,n).split('').reduce((s,d,i)=>s+Number(d)*(n+1-i),0);return ((sum*10)%11)%10===Number(answer![n]);});
   if(!valid){if(f.required)missing.push(f.label);continue;}
  }
  answers.push({field:f,value:answer});
 }
 return {missing:[...new Set(missing)],answers};
}
/** Preserve diagnostic facts, never echoed candidate values or provider prose. */
export function quickinResponseFailure(status:number,payload:unknown,fields:QuickinField[]):ExecutionResult{
 const body=payload&&typeof payload==='object'?payload as Record<string,unknown>:{};
 const allowedCodes=['ValidationError','AlreadyApplied','CandidateExists','Forbidden','TooManyRequests'] as const;
 const code=allowedCodes.find(code=>code===body.name);
 // The publisher's public ApplyForm catches HTTP 400 and displays
 // e.data.errors ?? e.data. That proves a validation response, not absence
 // of side effects on the destination. No HTTP status enables a retry.
 const errorMap=body.errors&&typeof body.errors==='object'?body.errors:body;
 const errors=Object.keys(errorMap);
 const labels=[...new Set(errors.flatMap(key=>fields.filter(f=>f.name===key||key.startsWith(`${f.name}.`)).map(f=>f.label)))];
 return {status:'unknown',diagnostic:{provider:'quickin',phase:'application_response',responseKind:status===400&&labels.length?'validation_rejection':'http_rejection',...(Number.isInteger(status)&&status>=100&&status<=599?{httpStatus:status}:{}),...(code?{providerCode:code}:{}),fieldNames:fields.filter(f=>errors.some(key=>f.name===key||key.startsWith(`${f.name}.`))).map(f=>f.name)},message:`A Quickin não confirmou o recebimento (HTTP ${Number.isInteger(status)&&status>=100&&status<=599?status:'não identificado'}${code?`; ${code}`:''})${labels.length?`; campos indicados pelo destino: ${labels.join('; ')}`:''}. Confira o resultado antes de repetir.`};
}
export function quickinMediaReference(payload:unknown):string|undefined{
 const value=typeof payload==='string'?payload:payload&&typeof payload==='object'&&!Array.isArray(payload)?(payload as Record<string,unknown>)._id:undefined;
 return typeof value==='string'&&value.trim()&&value.length<=200?value:undefined;
}
async function control(form:Locator,label:string){
 const pattern=new RegExp(`^${escape(label)}\\s*\\*?\\s*$`,'i');
 const accessible=form.getByLabel(pattern);
 if(await accessible.count())return accessible;
 // The publisher renders some labels without `for`. Bind the exact visible
 // label to its own field wrapper, never to a neighbouring question.
 return form.locator('label').filter({hasText:pattern}).locator('..').locator('..')
  .locator('input:not([type="hidden"]),textarea:not([aria-hidden="true"])');
}
/** Normal public UI, with a schema preflight before any field or file mutation.
 * No private API, candidate login, invented endpoints or CAPTCHA execution. */
export async function executeQuickinForm(page:Page,input:AtsApplication):Promise<ExecutionResult>{
 let submitted=false,uploaded=false,phase='leitura do formulário';
 let diagnostic:SubmissionDiagnostic|undefined;
 const pause=(message:string,missingQuestions?:string[]):ExecutionResult=>({status:'action_required',...(!submitted?{retryable:true as const}:{}),...(diagnostic?{diagnostic}:{}),message,missingQuestions});
 try{
  const ats=detectAts(input.destination.url);
  if(ats?.platform!=='quickin'||!ats.board||!ats.postingId)return pause('Destino Quickin inválido.');
  // This configuration URL and schema are also used by the publisher's own UI.
  const site=await readPublicPage(`https://api.quickin.io/public/careersites/${ats.board}`);
  if(site.status!==200)return pause('A configuração pública do formulário não respondeu.');
  const config=JSON.parse(site.html);
  if(config.slug!==ats.board||normalized(config.name||'')!==normalized(input.destination.company)||!/^[a-f0-9]{24}$/.test(config.account_id||''))return pause('A página não confirmou a empresa do formulário.');
  const schemaPage=await readPublicPage(`https://api.quickin.io/public/${config.account_id}/apply-form-schema?job_id=${ats.postingId}&origin=applied`);
  if(schemaPage.status!==200)return pause('As perguntas públicas do formulário não responderam.');
  const fields=JSON.parse(schemaPage.html);
  if(!Array.isArray(fields)||fields.length>100)return pause('Estrutura do formulário não suportada.');
  const plan=quickinFieldPlan(fields,input.profile,input.destination.url);
  const response=await page.goto(input.destination.url,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response||response.status()>=400)return pause('O formulário não está disponível.');
  await page.getByRole('button',{name:/^enviar candidatura$/i}).waitFor({state:'visible',timeout:20000});
  const text=await page.locator('body').innerText();
  const postings=structuredJobs(await page.content());
  const publication=detectAts(input.destination.publicationUrl);
  if(publication?.platform!=='quickin'||publication.board!==ats.board||publication.postingId!==ats.postingId||page.url()!==input.destination.url||!normalized(text).includes(normalized(input.job.title))||postings.length!==1||postings[0].url!==input.destination.publicationUrl||normalized(postings[0].title||'')!==normalized(input.job.title)||normalized(postings[0].hiringOrganization?.name||'')!==normalized(input.destination.company))return pause('O formulário não confirmou a vaga e a empresa.');
  if(/captcha|verify you are human|access denied/i.test(text)||await page.locator('[data-sitekey],iframe[src*="captcha"],.h-captcha,.g-recaptcha').count())return pause('Este formulário exige verificação humana.');
  const form=page.locator('form');if(await form.count()!==1)return pause('Não foi possível identificar um único formulário Quickin.');
  if(await page.getByText(/^candidatura enviada!$/i).count())return pause('Já há confirmação nesta página. Confira a candidatura existente antes de continuar.');
  if(plan.missing.length)return {...pause('Há campos obrigatórios sem dados aprovados. Nenhum arquivo foi transmitido.',plan.missing),questionOptions:Object.fromEntries(fields.filter(f=>f.options?.length).map(f=>[f.label,f.options.map((o:any)=>o.label)]))};
  if(await form.locator('input[type="file"]').count()!==1)return pause('O formulário não oferece um único campo de currículo.');
  for(const {field:f} of plan.answers){
   if(f.name==='phones'){if(await form.locator('input[type="tel"]').count()!==1)return pause('Telefone obrigatório não identificado.');continue;}
   if(await (await control(form,f.label)).count()!==1)return pause('Um campo do formulário não corresponde à pergunta publicada.',[f.label]);
  }
  phase='inicialização do telefone';
  await form.locator('.iti__selected-country').waitFor({state:'visible',timeout:15000});
  if(input.inspectOnly)return {...pause('Formulário Quickin e dados obrigatórios conferidos antes de qualquer transmissão.'),preflightReady:true};
  if(!input.resume.file)return pause('O currículo original aprovado não está disponível.');
  const fill=async()=>{for(const {field:f,value} of plan.answers){
   phase=`preenchimento de ${f.label}`;
   if(f.name==='phones'){
    const country=form.locator('.iti__selected-country');
    if(await country.count()!==1)throw Error('Phone country control unavailable');
    if(!/\(\+55\)/.test(await country.getAttribute('aria-label')||'')){
      await country.click();await page.locator('[role="option"][data-iso2="br"]').click();
    }
    if(!/\(\+55\)/.test(await country.getAttribute('aria-label')||''))throw Error('Phone country mismatch');
    const phone=form.locator('input[type="tel"]');await phone.fill(value.slice(3));
    if((await phone.inputValue()).replace(/\D/g,'')!==value.slice(3))throw Error('Phone value mismatch');
    continue;
   }
   const field=await control(form,f.label);
   if(f.type==='single_choice'){
    await field.click();await page.getByRole('option',{name:new RegExp(`^${escape(value)}$`,'i')}).click();
   }else if(f.type==='boolean')await field.setChecked(/^(sim|true|yes)$/i.test(value));
   else await field.fill(value);
  }};
  await fill();
  if(!await form.evaluate((node:HTMLFormElement)=>node.checkValidity()))return pause('Os campos obrigatórios não passaram na validação do formulário. Nenhum arquivo foi transmitido.');
  // Upload uses the publisher's own control. Only the two verified Quickin
  // origins are reachable; unsupported storage hosts fail closed.
  phase='carregamento do currículo';
  const upload=page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===`https://api.quickin.io/public/${config.account_id}/media/multipart`,{timeout:25000});
  uploaded=true;
  const [,uploadResponse]=await Promise.all([form.locator('input[type="file"]').setInputFiles({name:input.resume.file.name,mimeType:input.resume.file.mimeType,buffer:Buffer.from(input.resume.file.data,'base64')}),upload]);
  diagnostic={provider:'quickin',phase:'upload_response',httpStatus:uploadResponse.status()};
  if(!uploadResponse.ok())return pause(`O upload do currículo recebeu HTTP ${uploadResponse.status()}. A candidatura não foi submetida.`);
  const media=await uploadResponse.json().catch(()=>null);
  if(!quickinMediaReference(media))return pause('O upload não retornou referência válida ao currículo. A candidatura não foi submetida.');
  await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
  await fill();
  if(!await form.evaluate((node:HTMLFormElement)=>node.checkValidity()))return pause('Os campos obrigatórios não passaram na validação após o upload. A candidatura não foi submetida.');
  if(await form.locator('input[type="checkbox"]:checked').count() > plan.answers.filter(a=>a.field.type==='boolean'&&/^(sim|true|yes)$/i.test(a.value)).length)
    return pause('O formulário marcou uma declaração não aprovada; candidatura não concluída.');
  const submit=page.getByRole('button',{name:/^enviar candidatura$/i});
  if(!await submit.isEnabled())return pause('O formulário não liberou a conclusão após o arquivo.');
  const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===`https://api.quickin.io/public/${config.account_id}/apply`,{timeout:25000});
  diagnostic={provider:'quickin',phase:'application_response'};
  submitted=true;
  const [,applicationResponse]=await Promise.all([submit.click(),accepted]);
  diagnostic={provider:'quickin',phase:'application_response',httpStatus:applicationResponse.status(),responseKind:applicationResponse.ok()?'accepted_awaiting_confirmation':'http_rejection'};
  const body=await applicationResponse.body().catch(()=>null);
  if(body)diagnostic.responseSha256=createHash('sha256').update(body).digest('hex');
  if(!applicationResponse.ok()){
   let payload:unknown;try{payload=body?JSON.parse(body.toString()):null;}catch{payload=null;}
   const failure=quickinResponseFailure(applicationResponse.status(),payload,fields);
   return {...failure,diagnostic:{...diagnostic,...failure.diagnostic}};
  }
  diagnostic.phase='confirmation';
  const success=page.getByText(/^candidatura enviada!$|candidatura (?:enviada|recebida|realizada) com sucesso|inscri[cç][aã]o (?:realizada|enviada) com sucesso|application (?:submitted|received) successfully/i).first();
  await success.waitFor({state:'visible',timeout:20000});
  const phrase=await success.innerText();
  if(/n[aã]o|erro|failed|not/i.test(phrase))return {status:'unknown',diagnostic,message:'O destino não confirmou a conclusão. Confira antes de repetir.'};
  diagnostic.responseKind='receipt_verified';
  return {status:'sent',diagnostic,receipt:`Quickin: ${phrase.slice(0,200)} [resposta ${createHash('sha256').update(await page.content()).digest('hex').slice(0,16)}]`,message:'O formulário público confirmou a candidatura após a submissão.'};
 }catch{return submitted?{status:'unknown',diagnostic,message:'A confirmação Quickin não foi recuperada após o envio. Não repetir automaticamente.'}:pause(uploaded?`A candidatura parou durante ${phase}, após selecionar o arquivo. Revise antes de repetir.`:`A preparação Quickin parou durante ${phase}. Nenhum arquivo foi transmitido.`);}
}
