import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import type {AtsApplication} from './ats-application';
import type {ExecutionResult} from './application-verification';
import {WP_JOBS_EVIDENCE,wpJobsForm} from './company-board';
import {normalized,canonicalJobUrl} from './job-identity';
import {readPublicPage} from './public-web';
import {approvedFieldAnswer} from './approved-answers';
const success=/(?:candidatura|curr[ií]culo|application|mensagem).{0,70}(?:recebid[oa]|enviad[oa](?: com sucesso)?|submitted successfully|received|sent successfully)|(?:obrigad[oa]|thank you).{0,80}(?:candidat|curr[ií]culo|applying|application)/i;
export async function sendCompanyForm(input:AtsApplication,read=readPublicPage,post:typeof fetch=fetch):Promise<ExecutionResult> {
  let attempted=false;
  const pause=(message:string):ExecutionResult=>({status:'action_required',retryable:true,message});
  try {
    if(!input.destination.evidence.includes(WP_JOBS_EVIDENCE))return pause('O formulário da empresa precisa de um adaptador verificado.');
    const page=await read(input.destination.url),$=load(page.html),form=wpJobsForm(page);
    if(page.status<400 && $('[data-sitekey],.h-captcha,.g-recaptcha,input[name*="captcha"]').length)
      return pause('Este formulário exige verificação humana para liberar a submissão.');
    if(!form||canonicalJobUrl(page.url)!==canonicalJobUrl(input.destination.url)||normalized($('h1').first().text())!==normalized(input.job.title)||!normalized($('body').text()).includes(normalized(input.job.company)))return pause('O formulário não confirmou a vaga e a empresa autorizadas.');
    const existing=$('.wpjb-apply-form-wrapper,.wpjb-apply-form').text();
    if(success.test(existing))return pause('A página já contém confirmação; confira a candidatura existente.');
    const answers=new Map<string,string>(),missing:string[]=[],questionOptions:Record<string,string[]>={};
    for(const field of form.questions) {
      const answer=approvedFieldAnswer(field.label,input.profile,input.destination.url);
      const option=field.options.find(option=>normalized(option.label)===normalized(answer||''));
      if(field.options.length)questionOptions[field.label]=field.options.map(option=>option.label);
      const valid=answer!==undefined && (!field.options.length||!!option) &&
        (field.type!=='checkbox'||/^(true|false|sim|não|nao|yes|no)$/i.test(answer)) &&
        !(field.type==='checkbox'&&field.required&&!/^(true|sim|yes)$/i.test(answer));
      if(valid) {
        if(field.type!=='checkbox'||/^(true|sim|yes)$/i.test(answer!))answers.set(field.name,option?.value||answer!);
      } else if(field.required)missing.push(field.label);
    }
    if(missing.length)return {...pause('O formulário tem perguntas obrigatórias sem resposta válida.'),missingQuestions:[...new Set(missing)],questionOptions};
    if(input.inspectOnly)return {...pause('Formulário nativo validado antes do envio.'),preflightReady:true};
    const file=input.resume.file;
    if(!file||!input.profile.confirmed)return pause('Perfil confirmado e currículo original são obrigatórios.');
    const bytes=Buffer.from(file.data,'base64');
    if(!bytes.length||bytes.length>5*1024*1024||!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimeType))return pause('Arquivo de currículo inválido.');
    const body=new FormData();
    for(const field of form.fields) {
      if(form.questions.some(question=>question.name===field.name)) {
        if(answers.has(field.name))body.set(field.name,answers.get(field.name)!);
        continue;
      }
      if(field.name==='candidate-name')body.set(field.name,input.profile.name);
      else if(field.name==='candidate-email')body.set(field.name,input.profile.email);
      else if(field.name==='candidate-cv')body.set(field.name,new Blob([new Uint8Array(bytes)],{type:file.mimeType}),file.name);
      else if(field.name==='candidate-message')body.set(field.name,input.presentation||'Segue meu currículo para avaliação para esta oportunidade.');
      else body.set(field.name,field.value);
    }
    attempted=true;
    let response=await post(form.target,{method:'POST',body,redirect:'manual',headers:{Origin:new URL(page.url).origin,Referer:page.url},signal:AbortSignal.timeout(25000)});
    if([302,303].includes(response.status)&&response.headers.get('location')) {
      const confirmationUrl=new URL(response.headers.get('location')!,form.target);
      if(confirmationUrl.origin!==new URL(form.target).origin)return {status:'unknown',message:'O destino redirecionou após o envio; confira antes de repetir.'};
      response=await post(confirmationUrl.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)});
    }
    if(!response.ok)return {status:'unknown',message:`O formulário retornou HTTP ${response.status} após o envio. Confira antes de repetir.`};
    const html=await response.text(),after=load(html),beforeText=normalized($('body').text());
    // Plugins may render their receipt beside the form. Require a new positive
    // message from this POST response, never wording already in the vacancy.
    const messages=after('.wpjb-apply-form-wrapper,.wpjb-apply-form,.wpjb-success,.wpjb-message,.wpjb-alert,.wpjb-notice,p,div').toArray()
      .map(node=>after(node).clone().find('script,style,form').remove().end().text().replace(/\s+/g,' ').trim())
      .filter(value=>value.length>0&&value.length<=500);
    const phrase=messages.flatMap(message=>{
      if(/\b(?:não|nao|not|failed|falha|erro|recusad|invalid)/i.test(message))return [];
      const found=message.match(success)?.[0];
      return found&&!beforeText.includes(normalized(found))?[found]:[];
    })[0];
    if(!phrase)return {status:'unknown',message:'O formulário recebeu uma tentativa, mas não exibiu confirmação verificável. Não repetir automaticamente.'};
    return {status:'sent',receipt:`Formulário da empresa: ${phrase} [resposta ${createHash('sha256').update(html).digest('hex').slice(0,16)}]`,message:'O site oficial confirmou o recebimento após o envio do currículo.'};
  }catch{return attempted?{status:'unknown',message:'A resposta do formulário foi interrompida depois do envio. Confira antes de repetir.'}:pause('O formulário nativo não pôde ser revalidado.');}
}
