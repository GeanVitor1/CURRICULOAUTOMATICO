import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.env.EMPREGATOS_PREVIEW_ROOT;
if(!root?.endsWith('/empregatos-installation-preview'))throw Error('Missing fixture directory');
const html=await readFile(root+'/preview.html','utf8');
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='preview.empregatos.test'?route.fulfill({contentType:'text/html; charset=utf-8',body:html}):route.abort());
 const page=await context.newPage();await page.setViewportSize({width:1280,height:1000});
 await page.goto('https://preview.empregatos.test/');await page.getByRole('heading',{name:'Baixe e extraia a pasta'}).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:root+'/extension-installation-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Copiar endereço chrome://extensions'}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'chrome://extensions');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:root+'/extension-installation-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.getByRole('button',{name:'Verificar instalação',exact:true}).click();await page.getByRole('heading',{name:'Extensão do EmpreGatos detectada'}).waitFor();
 assert.equal(await page.getByText('Carregar sem compactação',{exact:true}).count(),0);
 await page.screenshot({path:root+'/extension-installation-detected.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.goto('https://preview.empregatos.test/?store=1');
 await page.getByRole('link',{name:'Instalar no Chrome',exact:true}).waitFor();
 assert.equal(await page.getByText('ainda não foi publicada',{exact:false}).count(),0);
 await page.screenshot({path:root+'/extension-store-installation-preview.png',fullPage:true});
 await context.close();
}finally{await browser.close();}
const base='https://curriculoautomatico.vercel.app',version=JSON.parse(await readFile(root+'/extension/manifest.json','utf8')).version;
const context=await chromium.launchPersistentContext(root+'/synthetic-profile',{channel:'chromium',headless:true,viewport:{width:1280,height:800},args:[`--disable-extensions-except=${root}/extension`,`--load-extension=${root}/extension`,'--proxy-server=http://127.0.0.1:9']});
try{
 await context.route('https://**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='www.linkedin.com')return route.fulfill({contentType:'text/html',body:'<a href="/messaging/">Mensagens</a><a href="/mynetwork/">Rede</a><button aria-expanded="false"><img alt="">Eu</button>'});
  if(url.origin===base&&url.pathname==='/app')return route.fulfill({contentType:'text/html',body:'<h1>EmpreGatos · ambiente de demonstração</h1>'});
  if(url.pathname==='/api/connections/browser-extension-context')return route.fulfill({json:{portal:'linkedin',available:true,mode:'local-browser',account:{id:'11111111-1111-4111-8111-111111111111',name:'Conta de demonstração',email:'demo@example.test'}}});
  if(url.pathname==='/api/connections/linkedin/local-browser')return route.fulfill({json:{portal:'linkedin',mode:'local-browser',automatic:false,localLogin:{observedAt:new Date().toISOString(),expiresAt:Date.now()+900000,extensionVersion:'2.0.9'}}});
  return route.abort();
 });
 const portal=await context.newPage();await portal.goto('https://www.linkedin.com/feed/');
 const project=await context.newPage();await project.goto(base+'/app?portal=linkedin');
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).hostname,popup=await context.newPage();
 await popup.goto(`chrome-extension://${extensionId}/popup.html?portal=linkedin`);
 await popup.getByText('Destino no EmpreGatos:',{exact:false}).waitFor();
 await popup.getByRole('checkbox').check();await popup.getByRole('button',{name:'2. Verificar LinkedIn no meu Chrome'}).click();
 await popup.getByRole('status').filter({hasText:'Verificação registrada'}).waitFor();
 await popup.screenshot({path:root+'/store-screenshot-1280x800.png'});
 console.log(JSON.stringify({manualGuide:true,clipboard:true,mobileNoOverflow:true,installedReplacesGuide:true,storeLinkPreviewOnly:true,actualExtensionFixture:true,version,liveProviderAccountsUsed:false}));
}finally{await context.close();}
