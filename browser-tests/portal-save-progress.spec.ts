import {test,expect,type Page} from '@playwright/test';
import {createWorkspace} from '../server/workspace';
import {linkedinRetestNotice}from'../shared/session-transfer-policy';
import {linkedinLocalNotice}from'../shared/session-transfer-policy';

async function connection(page:Page,portal:string,onConfirm:Parameters<Page['route']>[1]){
 const w=createWorkspace('Pessoa de teste','fixture@example.test');
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/me')return route.fulfill({json:{id:'fixture',name:w.profile.name,email:w.profile.email}});
  if(path==='/api/workspace')return route.fulfill({json:w});
  if(path==='/api/connections/browser-extension-context')return route.fulfill({json:{available:true,sessionRetest:portal==='linkedin',notice:linkedinRetestNotice}});
  if(path.endsWith('/confirm'))return (onConfirm as Function)(route);
  return route.fulfill({json:{ok:true}});
 });
 await page.goto('/app?portal='+portal);
 await expect(page.getByRole('heading',{name:new RegExp('Conecte o')})).toBeVisible();
 if(portal==='linkedin'){
  await expect(page.getByRole('note').filter({hasText:'Conexão LinkedIn em teste'})).toBeVisible();
  await page.screenshot({path:'artifacts/linkedin-retest-enabled-2026-10-28.png'});
 }
 await page.evaluate(portal=>window.postMessage({type:'empregatos:browser-session',portal,frame:{
  viewerId:'11111111-1111-4111-8111-111111111111',authenticated:true,blocked:false,
  width:1024,height:720,address:'fixture.test/account',notice:'',
  image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
 }},location.origin),portal);
 await expect(page.getByRole('heading',{name:'Login confirmado',exact:true})).toBeVisible();
}

for(const portal of ['infojobs','gupy'])test(`shows progress and saved confirmation without duplicate transfers: ${portal}`,async({page})=>{
 let finish!:()=>void,confirms=0;
 const pending=new Promise<void>(resolve=>{finish=resolve;});
 await connection(page,portal,async route=>{
  confirms++;
  expect(route.request().postDataJSON()).toEqual({connectionOnly:true,authorizeAutomation:false,profileResumeId:null});
  await pending;await route.fulfill({json:{ok:true,automatic:false}});
 });
 await page.clock.install();
 const save=page.getByRole('button',{name:portal==='linkedin'?'Salvar conexão do LinkedIn':'Salvar conexão sem ativar envios',exact:true});
 // Two clicks within one event loop also exercise the synchronous request guard.
 await save.evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 await expect(page.getByRole('heading',{name:/Salvando conexão do/})).toBeVisible();
 await expect(page.getByRole('status')).toContainText('Aguarde nesta tela');
 await expect(page.locator('.remote-spinner')).toBeVisible();
 await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();
 for(const savingButton of await page.getByRole('button',{name:'Salvando conexão…',exact:true}).all())await expect(savingButton).toBeDisabled();
 await expect(page.locator('.remote-screen img')).toHaveCount(0);
 await expect.poll(()=>confirms).toBe(1);
 await page.clock.fastForward(13000);
 await expect(page.getByRole('status')).toContainText('Está levando mais tempo');
 if(portal==='infojobs'){
  await page.screenshot({path:'artifacts/infojobs-saving-desktop-2026-10-28.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/infojobs-saving-mobile-2026-10-28.png'});
 }
 if(portal==='linkedin'){
  await page.setViewportSize({width:390,height:667});
  const heading=page.getByRole('heading',{name:/Salvando conexão do/});await heading.scrollIntoViewIfNeeded();expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  const cancel=page.getByRole('button',{name:'Cancelar',exact:true});await cancel.scrollIntoViewIfNeeded();const box=(await cancel.boundingBox())!;expect(box.y+box.height).toBeLessThanOrEqual(667);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/linkedin-general-connection-loading-2026-10-28.png'});
 }
 finish();
 await expect(page.getByRole('heading',{name:'Conta conectada',exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toContainText(portal==='linkedin'?'confirmada e salva':'conexão foi salva');
 await expect(page.locator('.remote-spinner')).toHaveCount(0);
 expect(confirms).toBe(1);
 if(portal==='infojobs')await page.screenshot({path:'artifacts/infojobs-saved-mobile-2026-10-28.png'});
});

test('leaves the confirmation visible in an opened connector window until the person concludes',async({page})=>{
 await page.goto('/');
 const opened=page.waitForEvent('popup');
 await page.evaluate(()=>window.open('/app?portal=infojobs'));
 const popup=await opened;
 await connection(popup,'infojobs',route=>route.fulfill({json:{ok:true,automatic:false}}));
 await popup.getByRole('button',{name:'Salvar conexão sem ativar envios',exact:true}).click();
 await expect(popup.getByRole('heading',{name:'Conta conectada',exact:true})).toBeVisible();
 expect(popup.isClosed()).toBe(false);
});

test('clears saving progress and reports a refused save without claiming success or retrying',async({page})=>{
 let confirms=0;
 await connection(page,'infojobs',route=>{confirms++;return route.fulfill({status:400,json:{error:'O login expirou. Conclua a entrada novamente.'}});});
 await page.getByRole('button',{name:'Salvar conexão sem ativar envios',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('O login expirou');
 await expect(page.getByRole('heading',{name:'Conta conectada',exact:true})).toHaveCount(0);
 await expect(page.locator('.remote-save-progress')).toHaveCount(0);
 expect(confirms).toBe(1);
});
test('explains the LinkedIn suspension and ignores an obsolete authenticated-frame event',async({page})=>{
 const w=createWorkspace('Pessoa de teste','fixture@example.test');let transfers=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/me')return route.fulfill({json:{id:'fixture',name:w.profile.name,email:w.profile.email}});
  if(path==='/api/workspace')return route.fulfill({json:w});
  if(path.startsWith('/api/connections/linkedin/'))transfers++;
  return route.fulfill({json:{ok:true}});
 });
 await page.goto('/app?portal=linkedin');
 await expect(page.getByRole('heading',{name:'Conexão do LinkedIn em revisão'})).toBeVisible();
 await page.evaluate(()=>window.postMessage({type:'empregatos:browser-session',portal:'linkedin',frame:{viewerId:'11111111-1111-4111-8111-111111111111',authenticated:true,image:'data:image/png;base64,AA=='}},location.origin));
 await expect(page.getByRole('heading',{name:'Conexão do LinkedIn em revisão'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Salvar conexão do LinkedIn'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Usar login no navegador da nuvem'})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Abrir meu LinkedIn no Chrome'})).toHaveAttribute('href','https://www.linkedin.com/feed/');
 expect(transfers).toBe(0);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/linkedin-transfer-suspended-mobile-2026-10-28.png'});
});

test('shows local LinkedIn progress and a recorded observation without opening a cloud session',async({page})=>{
 const w=createWorkspace('Pessoa de teste','fixture@example.test');let observation:any=null,cloudCalls=0;
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/me')return route.fulfill({json:{id:'fixture',name:w.profile.name,email:w.profile.email}});
  if(path==='/api/workspace')return route.fulfill({json:w});
  if(path==='/api/connections/browser-extension-context')return route.fulfill({json:{available:true,mode:'local-browser',notice:linkedinLocalNotice,localLogin:observation}});
  if(path.startsWith('/api/connections/linkedin/'))cloudCalls++;
  return route.fulfill({json:{ok:true}});
 });
 await page.goto('/app?portal=linkedin');
 await expect(page.getByRole('heading',{name:'Verifique o LinkedIn no seu Chrome'})).toBeVisible();
 await expect(page.getByRole('status')).toContainText('Verificação do login pendente');
 await page.evaluate(()=>window.postMessage({type:'empregatos:connector-status',portal:'linkedin',version:'2.0.6',kind:'connecting',text:'Registrando a verificação…'},location.origin));
 await expect(page.locator('.remote-spinner')).toBeVisible();
 await page.evaluate(()=>window.postMessage({type:'empregatos:browser-session',portal:'linkedin',frame:{viewerId:'old',authenticated:true,image:'data:image/png;base64,AA=='}},location.origin));
 await expect(page.getByRole('heading',{name:'Login confirmado',exact:true})).toHaveCount(0);
 observation={observedAt:new Date().toISOString(),expiresAt:Date.now()+900000,extensionVersion:'2.0.6'};
 await page.evaluate(()=>{
  window.postMessage({type:'empregatos:connector-status',portal:'linkedin',version:'2.0.6',kind:'verified',text:'Verificação registrada.'},location.origin);
  window.postMessage({type:'empregatos:local-login-verified',portal:'linkedin'},location.origin);
 });
 await expect(page.getByRole('status')).toContainText('Login reconhecido no Chrome');
 await expect(page.getByRole('heading',{name:'Verificação do LinkedIn concluída',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Concluir e voltar ao painel',exact:true})).toHaveAttribute('href','/app#automacao');
 await expect(page.locator('.gupy-chrome-connection ol')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Abrir conector do Chrome',exact:true})).toHaveCount(0);
 await expect(page.getByText('Primeira instalação',{exact:true})).toHaveCount(0);
 await expect(page.locator('.remote-spinner')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Usar login no navegador da nuvem'})).toHaveCount(0);
 expect(cloudCalls).toBe(0);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/linkedin-local-verification-controlled-2026-10-28.png'});
 await page.reload();
 await expect(page.getByRole('heading',{name:'Verificação do LinkedIn concluída',exact:true})).toBeVisible();
 await expect(page.locator('.gupy-chrome-connection ol')).toHaveCount(0);
 expect(cloudCalls).toBe(0);
});
