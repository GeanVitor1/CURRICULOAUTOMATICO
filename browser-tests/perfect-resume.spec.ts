import{test,expect,type Page}from'@playwright/test';
import{createWorkspace}from'../server/workspace';
import{buildPerfectResume}from'../server/perfect-resume';
import{createPerfectResumePdf}from'../server/perfect-resume-pdf';
import{baseResume,perfectContent,perfectProfile,perfectJob}from'../tests/fixtures/perfect-resume';
import type{PerfectResume}from'../shared/perfect-resume';
async function fixture(page:Page,{empty=false,enabled=true,readFailure=false,generateFailure=false}={}){
 const w=createWorkspace('Pessoa Exemplo','pessoa@example.com');w.profile=structuredClone(perfectProfile);w.resumes=empty?[]:[structuredClone(baseResume)];w.intelligence={provider:'gemini',model:'gemini-2.5-flash',enabled,keyConfigured:true,consent:enabled,geminiConfigured:true};
 const drafts:PerfectResume[]=[],calls:{path:string;method:string;body:any}[]=[];let reads=0;
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method(),body=request.postData()?request.postDataJSON():undefined;
  if(method!=='GET')calls.push({path,method,body});
  if(path==='/api/auth/me')return route.fulfill({json:{id:'perfect-owner',name:w.profile.name,email:w.profile.email}});
  if(path==='/api/workspace')return route.fulfill({json:w});
  if(path==='/api/workspace/version')return route.fulfill({json:{revision:'fixture'}});
  if(path==='/api/perfect-resumes/inspect'){
   reads++;if(readFailure&&!body.description)return route.fulfill({status:400,json:{error:'Não conseguimos ler esse anúncio. Cole a descrição da vaga abaixo para continuar.'}});
   return route.fulfill({json:{...perfectJob,source:body.description?'pasted':'link'}});
  }
  if(path==='/api/perfect-resumes'&&method==='GET')return route.fulfill({json:{items:drafts}});
  if(path==='/api/perfect-resumes'&&method==='POST'){
   if(generateFailure)return route.fulfill({status:400,json:{error:'A IA está indisponível. Tente novamente em instantes.'}});
   const draft=buildPerfectResume(body,baseResume,perfectProfile,perfectContent());drafts.unshift(draft);return route.fulfill({json:draft});
  }
  if(path.match(/^\/api\/perfect-resumes\/[^/]+$/)&&method==='PUT'){
   const index=drafts.findIndex(d=>d.id===path.split('/').pop());drafts[index]={...drafts[index],...body,revision:drafts[index].revision+1};return route.fulfill({json:drafts[index]});
  }
  if(path.endsWith('/download')){const draft=drafts.find(d=>d.id===path.split('/')[3])!;return route.fulfill({body:await createPerfectResumePdf(draft,url.searchParams.get('kind')==='letter'),headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="curriculo-perfeito.pdf"'}});}
  return route.fulfill({json:{}});
 });
 return{calls,drafts,reads:()=>reads};
}
test('generates, edits, switches templates and exports without changing the source or starting applications',async({page})=>{
 const f=await fixture(page);await page.addInitScript(()=>localStorage.setItem('orbita-theme','light'));await page.goto('/app#curriculo-perfeito');
 await expect(page.getByRole('heading',{name:'Currículo Perfeito',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Criar Currículo Perfeito',exact:true})).toBeDisabled();
 await page.getByRole('textbox',{name:'Link da vaga',exact:true}).fill(perfectJob.url);await page.getByRole('button',{name:'Ler vaga',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Cargo da vaga'})).toHaveValue(perfectJob.title);
 await page.screenshot({path:'artifacts/perfect-resume-setup-light.png',fullPage:true});
 await page.getByRole('button',{name:'Criar Currículo Perfeito',exact:true}).click();
 await expect(page.getByRole('article',{name:'Prévia do currículo'})).toContainText('Empresa Nuvem');
 await expect(page.getByRole('article',{name:'Prévia do currículo'})).not.toContainText(/\/100|30 anos|currículo adaptado/i);
 await page.getByRole('textbox',{name:'Resumo profissional',exact:true}).fill(perfectContent().summary+' Atuação com TypeScript.');
 await page.getByRole('radio',{name:/Executivo/}).check();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PDF',exact:true}).click();await expect.poll(async()=>(await download).suggestedFilename()).toBe('curriculo-perfeito.pdf');
 expect(f.calls.some(c=>c.method==='PUT')).toBe(true);await expect(page.getByText('Versão salva na sua conta',{exact:false})).toBeVisible();
 await page.screenshot({path:'artifacts/perfect-resume-editor-light.png',fullPage:true});
 await page.getByRole('tab',{name:'Carta de apresentação',exact:true}).click();await expect(page.getByRole('article',{name:'Prévia da carta de apresentação'})).toContainText('Olá, equipe');
 await page.getByRole('tab',{name:'O que mudou',exact:true}).click();await expect(page.getByRole('heading',{name:'O que esta versão destaca'})).toBeVisible();
 await page.getByRole('tab',{name:'Currículo',exact:true}).click();await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'artifacts/perfect-resume-editor-dark.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/perfect-resume-editor-mobile.png',fullPage:true});
 expect(f.drafts).toHaveLength(1);expect(f.calls.every(c=>c.path.startsWith('/api/perfect-resumes'))).toBe(true);
});
test('supports portals that require login through an explicit pasted-description fallback',async({page})=>{
 const f=await fixture(page,{readFailure:true});await page.goto('/app#curriculo-perfeito');await page.getByRole('textbox',{name:'Link da vaga',exact:true}).fill(perfectJob.url);await page.getByRole('button',{name:'Ler vaga',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Cole a descrição');await page.getByRole('textbox',{name:'Descrição da vaga',exact:true}).fill(perfectJob.description);await page.getByRole('button',{name:'Ler vaga',exact:true}).click();
 await expect(page.getByRole('button',{name:'Criar Currículo Perfeito',exact:true})).toBeEnabled();expect(f.reads()).toBe(2);
});
test('keeps the current draft inputs after provider errors',async({page})=>{
 const f=await fixture(page,{generateFailure:true});await page.goto('/app#curriculo-perfeito');await page.getByRole('textbox',{name:'Link da vaga',exact:true}).fill(perfectJob.url);await page.getByRole('button',{name:'Ler vaga',exact:true}).click();
 await page.getByRole('button',{name:'Criar Currículo Perfeito',exact:true}).click();await expect(page.getByRole('alert')).toContainText('IA está indisponível');await expect(page.getByRole('textbox',{name:'Link da vaga',exact:true})).toHaveValue(perfectJob.url);expect(f.drafts).toHaveLength(0);
});
test('uses a job deep link only as input and waits for a click before reading it',async({page})=>{
 const f=await fixture(page);await page.goto(`/app?vaga=${encodeURIComponent(perfectJob.url)}#curriculo-perfeito`);await expect(page.getByRole('textbox',{name:'Link da vaga',exact:true})).toHaveValue(perfectJob.url);expect(f.reads()).toBe(0);
});
test('guides a person without a resume to the existing upload and creation flow',async({page})=>{
 await fixture(page,{empty:true});await page.goto('/app#curriculo-perfeito');await expect(page.getByRole('heading',{name:'Adicione seu currículo para começar'})).toBeVisible();await page.getByRole('button',{name:'Adicionar meu currículo',exact:false}).click();await expect(page).toHaveURL(/#curriculo$/);
});
test('requires professional-data consent before generation',async({page})=>{
 const f=await fixture(page,{enabled:false});await page.goto('/app#curriculo-perfeito');await expect(page.getByLabel('Permitir análise dos dados profissionais por IA')).not.toBeChecked();await expect(page.getByRole('button',{name:'Criar Currículo Perfeito',exact:true})).toBeDisabled();expect(f.calls).toEqual([]);
});
