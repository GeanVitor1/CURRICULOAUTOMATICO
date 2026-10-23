import {it,expect,vi,afterEach} from 'vitest';
import {jobFromCompanyPage,discoverCompanyBoard,wpJobsForm} from '../server/company-board';
import {sendCompanyForm} from '../server/company-form';
import {destinationBrowserAllowed} from '../server/ats-registry';
import {submissionRoute} from '../server/submission-routing';
import {createWorkspace} from '../server/workspace';
import {matchesSelectedSites} from '../server/engine';
import type {PublicPage} from '../server/public-web';
import type {AtsApplication} from '../server/ats-application';
const url='https://empresa.example/jobs/desenvolvedor-net/';
const source={id:'company-board:empresa.example',board:'https://empresa.example/jobs/',type:'manual' as const,company:'Empresa Oficial',enabled:true,discovery:true,application:true,status:''};
const html=`<h1>Desenvolvedor .NET</h1><p>Empresa Oficial</p><script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'WebPage',url,datePublished:new Date().toISOString()}]})}</script><div class="elementor-widget-theme-post-content"><div class="wpjb-single-job-wrapper">Remoto Tipo: Home office Habilidades: C# .NET Angular APIs REST Git</div><p>Desenvolvimento e manutenção de APIs e aplicações. Trabalho remoto com revisão de código e testes, contratação CLT.</p><div class="wpjb-apply-form-wrapper"><div class="wpjb-apply-form"><form method="post" action="" enctype="multipart/form-data"><input name="candidate-name"><input type="email" name="candidate-email"><input type="file" name="candidate-cv"><textarea name="candidate-message"></textarea><input type="hidden" name="action" value="apply-for-job"><button>Enviar</button></form></div></div></div>`;
const page:PublicPage={url,status:200,html,contentType:'text/html'};
const job=()=>jobFromCompanyPage(source,page)!;
const input=():AtsApplication=>({applicationId:'qa-application',job:{title:job().title,url,company:source.company},destination:job().destinations![0],profile:{...createWorkspace('Pessoa','qa@example.test').profile,confirmed:true},resume:{name:'original.pdf',file:{name:'original.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-original-bytes').toString('base64')}}});
afterEach(()=>vi.unstubAllEnvs());
it('descobre vagas pela página da empresa, usa a data publicada e preserva a descrição completa',async()=>{
  const read=vi.fn(async(target:string)=>target===source.board?{...page,url:target,html:`<a href="${url}">Desenvolvedor .NET</a><a href="https://other.example/jobs/123">Outro</a>`}:page);
  const result=await discoverCompanyBoard(source,read);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0].description).toContain('Desenvolvimento e manutenção');
  expect(result.jobs[0].description).not.toContain('candidate-email');
  expect(result.jobs[0].destinations?.[0]).toMatchObject({platform:'company',state:'verified',formFound:true});
  vi.stubEnv('COMPANY_FORM_AUTHORIZED','empresa.example');
  const w=createWorkspace('Pessoa','qa@example.test');w.routine.destinationPolicy='official';w.jobs=result.jobs;
  expect(matchesSelectedSites(result.jobs[0],w)).toBe(true);
  expect(submissionRoute(w,result.jobs[0],[])?.method).toBe('ats_browser');
  expect(destinationBrowserAllowed({url:'https://other.example/jobs/123',platform:'company'})).toBe(false);
});
it('valida sem transmitir dados na preparação e envia os bytes originais uma única vez',async()=>{
  const post=vi.fn(async(_url:string,init?:RequestInit)=>{
    const data=init?.body as FormData;
    expect(data.get('candidate-email')).toBe('qa@example.test');
    expect(await (data.get('candidate-cv') as Blob).text()).toBe('%PDF-original-bytes');
    expect(data.get('action')).toBe('apply-for-job');
    return new Response('<div class="wpjb-apply-form-wrapper">Sua candidatura foi enviada com sucesso.</div>');
  });
  const inspected=await sendCompanyForm({...input(),inspectOnly:true},async()=>page,post as typeof fetch);
  expect(inspected.preflightReady).toBe(true);expect(post).not.toHaveBeenCalled();
  const sent=await sendCompanyForm(input(),async()=>page,post as typeof fetch);
  expect(sent.status).toBe('sent');expect(sent.receipt).toContain('enviada com sucesso');expect(post).toHaveBeenCalledTimes(1);
});
it('não converte resposta negativa, formulário repetido ou perda de resposta em recibo',async()=>{
  const refused=await sendCompanyForm(input(),async()=>page,vi.fn(async()=>new Response('<div class="wpjb-apply-form-wrapper">Sua candidatura não foi enviada.</div>')) as typeof fetch);
  expect(refused.status).toBe('unknown');expect(refused.receipt).toBeUndefined();
  const post=vi.fn(async()=>{throw new Error('response lost');});
  expect((await sendCompanyForm(input(),async()=>page,post as typeof fetch)).status).toBe('unknown');expect(post).toHaveBeenCalledTimes(1);
  const existing=await sendCompanyForm(input(),async()=>({...page,html:html.replace('<form','Sua candidatura foi enviada com sucesso.<form')}),post as typeof fetch);
  expect(existing.status).toBe('action_required');expect(post).toHaveBeenCalledTimes(1);
  expect((await sendCompanyForm(input(),async()=>page,vi.fn(async()=>new Response('<p>Seu currículo foi recebido com sucesso.</p>')) as typeof fetch)).status).toBe('sent');
  const repeated={...page,html:html+'<p>Seu currículo foi recebido com sucesso.</p>'};
  expect((await sendCompanyForm(input(),async()=>repeated,vi.fn(async()=>new Response(repeated.html)) as typeof fetch)).status).toBe('unknown');
});
it('recusa CAPTCHA, campo desconhecido e destino alterado antes do upload',async()=>{
  for(const modified of [html.replace('<form','<form data-sitekey="required"'),html.replace('</form>','<input required name="legal-consent"></form>'),html.replace('action=""','action="https://other.example/"')]) {
    expect(wpJobsForm({...page,html:modified})).toBeNull();
    const post=vi.fn();
    expect((await sendCompanyForm(input(),async()=>({...page,html:modified}),post)).status).toBe('action_required');expect(post).not.toHaveBeenCalled();
  }
});
it('mapeia perguntas adicionais e usa apenas respostas aprovadas para o destino',async()=>{
  const question='Quantos anos de experiência com C#?';
  const custom={...page,html:html.replace('</form>',`<label for="experience">${question}</label><input id="experience" name="experience" type="number" required></form>`)};
  const post=vi.fn(async(_url:string,init?:RequestInit)=>{
    expect((init?.body as FormData).get('experience')).toBe('4');
    return new Response('<p>Sua candidatura foi enviada com sucesso.</p>');
  });
  const data=input();
  const missing=await sendCompanyForm({...data,inspectOnly:true},async()=>custom,post as typeof fetch);
  expect(missing.missingQuestions).toEqual([question]);expect(post).not.toHaveBeenCalled();
  data.profile.approvedAnswers=[{id:'answer',question,aliases:[],value:'4',confirmedAt:new Date().toISOString(),destinationUrl:url}];
  expect((await sendCompanyForm(data,async()=>custom,post as typeof fetch)).status).toBe('sent');
  expect(post).toHaveBeenCalledOnce();
});
it('retoma os detalhes restantes e segue paginação sem depender do corte de doze',async()=>{
  vi.stubEnv('COMPANY_DISCOVERY_BATCH_SIZE','2');
  const urls=Array.from({length:3},(_,i)=>`${source.board}job-${i}/`);
  const read=vi.fn(async(target:string)=>target===source.board?{...page,url:target,html:urls.map(u=>`<a href="${u}">Vaga</a>`).join('')}:{...page,url:target,html:html.replaceAll(url,target)});
  const first=await discoverCompanyBoard(source,read);
  expect(first.jobs).toHaveLength(2);expect(first.checkpoint.pending).toBe(true);
  const second=await discoverCompanyBoard(source,read,first.checkpoint.cursor);
  expect(second.jobs).toHaveLength(1);expect(second.checkpoint.pending).toBe(false);
  expect(second.jobs[0].url).toBe(urls[2]);
});
