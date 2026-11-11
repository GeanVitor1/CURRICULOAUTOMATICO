import {expect,it} from 'vitest';
import {chromium} from 'playwright';
import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {browserConnectors,browserConnectionMode,type BrowserSessionPortal} from '../shared/browser-connectors';
const base='https://curriculoautomatico.vercel.app',owner='11111111-1111-4111-8111-111111111111';
const scenarios=[...(Object.keys(browserConnectors) as BrowserSessionPortal[]).map(portal=>({portal,repair:false,reject:false,replaceApp:false})),{portal:'linkedin' as const,repair:true,reject:false,replaceApp:false},{portal:'linkedin' as const,repair:false,reject:true,replaceApp:false},{portal:'linkedin' as const,repair:false,reject:false,replaceApp:true}];
it.each(scenarios)('real Chrome extension handles $portal (repair stale bridge: $repair; server rejects: $reject; closed destination: $replaceApp)',async({portal,repair,reject,replaceApp})=>{
 const directory=await mkdtemp(join(tmpdir(),'portal-extension-test-')),extension=join(directory,'extension'),provider=browserConnectors[portal];
 const local=portal==='linkedin',connectLabel=local?'Verificar LinkedIn':'Conectar conta';
 await cp(resolve('browser-extension/gupy-session'),extension,{recursive:true});
 const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
 // Isolated fixture simulates the user granting only the selected optional
 // hosts. The production manifest remains optional and is asserted separately.
 manifest.host_permissions.push(...provider.domains.map(domain=>`https://*.${domain}/*`));
 await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(join(directory,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--proxy-server=http://127.0.0.1:9']});
 context.setDefaultTimeout(8000);let received:any,imports=0;
 try{
  await context.route('https://**/*',async route=>{
   const url=new URL(route.request().url());
   if(provider.domains.some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain))){
    const signed=portal==='gupy'?'<button aria-label="Abrir menu de usuário">Menu</button>':portal==='linkedin'?'<a href="/messaging/">Mensagens</a><a href="/mynetwork/">Rede</a><button aria-expanded="false"><img width="20" height="20" alt="">Eu</button>':'<a href="/logout">Sair</a>';
    return route.fulfill({contentType:'text/html; charset=utf-8',body:signed+'<script>localStorage.setItem("authToken","synthetic-'+portal+'");localStorage.setItem("unrelatedPreference","not-exported")</script>'});
   }
   if(url.origin===base&&url.pathname==='/app')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>EmpreGatos fixture</p><div id="result"></div><div id="extension-status"></div><script>addEventListener("message",e=>{if(e.data.type==="empregatos:connector-status")document.getElementById("extension-status").textContent=e.data.text;if(e.data.type==="empregatos:browser-session"||e.data.type==="empregatos:gupy-browser-session"||e.data.type==="empregatos:local-login-verified")document.getElementById("result").textContent=e.data.portal||"gupy"})</script>'});
   if(url.pathname==='/api/connections/browser-extension-context')return route.fulfill({contentType:'application/json',body:JSON.stringify({portal:url.searchParams.get('portal'),available:true,mode:browserConnectionMode(portal),account:{id:owner,name:'QA',email:'qa@example.test'}})});
   if(url.pathname===`/api/connections/${portal}/${local?'local-browser':'browser-session'}`){
    imports++;received={body:route.request().postDataJSON(),headers:await route.request().allHeaders()};
    if(reject)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'O login do Chrome não foi aceito pelo LinkedIn.'})});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(local?{portal:'linkedin',mode:'local-browser',automatic:false,localLogin:{observedAt:new Date().toISOString(),expiresAt:Date.now()+900000,extensionVersion:manifest.version}}:{viewerId:'fixture',authenticated:true,image:'data:image/png;base64,AA=='})});
   }
   return route.abort();
  });
  await context.addCookies([
   {name:'candidate_session',value:'synthetic-cookie',domain:'.'+provider.domains[0],path:'/',httpOnly:true,secure:true,sameSite:'Lax'},
   {name:'google_session',value:'never-export-google',domain:'.google.com',path:'/',httpOnly:true,secure:true,sameSite:'Lax'},
   {name:'app_session',value:'synthetic-app-cookie',domain:'curriculoautomatico.vercel.app',path:'/',httpOnly:true,secure:true,sameSite:'Lax'},
  ]);
  const candidate=await context.newPage();await candidate.goto(provider.accountUrl);
  let app=await context.newPage();await app.goto(base+'/app?portal='+portal);
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:5000}),id=new URL(worker.url()).hostname;
  if(repair)await worker.evaluate(async url=>{
   const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url});
   await api.scripting.executeScript({target:{tabId:tab.id},files:['config.js','content.js']});
   await api.scripting.executeScript({target:{tabId:tab.id},files:['config.js','content.js']});
   await api.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const old=(globalThis as any).__empregatosConnectorBridge;
    (globalThis as any).chrome.runtime.onMessage.removeListener(old.message);
   }});
  },base+'/app?portal='+portal);
  const opening=context.waitForEvent('page');
  await worker.evaluate('openConnector('+JSON.stringify(portal)+')');
  const popup=await opening;await popup.waitForURL(`chrome-extension://${id}/popup.html?portal=${portal}`);
  // Exercise the user's portal selector instead of pre-setting browser storage.  await popup.locator('#portal').selectOption(portal);
  await popup.locator('#account').filter({hasText:'qa@example.test'}).waitFor();
  // Login opens a different tab and closes a real popup. Reopening must retain
  // the chosen portal while requiring fresh consent.
  await popup.reload();
  await popup.locator('#account').filter({hasText:'qa@example.test'}).waitFor();
  expect(await popup.locator('#portal').inputValue()).toBe(portal);
  expect(await popup.locator('#consent-label').innerText()).toContain(provider.name);  // Nothing is read or sent before the single explicit click.
  expect(await popup.getByRole('button',{name:connectLabel}).isEnabled()).toBe(true);expect(received).toBeUndefined();
  if(replaceApp){
   // Exact user failure: the popup holds a tab ID that no longer exists when
   // consent is granted. The replacement must be discovered and owner checked.
   await app.close();app=await context.newPage();await app.goto(base+'/app?portal='+portal);
  }
  if(portal==='linkedin'&&!repair&&!reject){   // The user is already signed in to the portal in another tab: the single
   // click must recognize it without opening a new login tab.
   const loginTab=await context.newPage();
   await loginTab.goto(provider.accountUrl);
   expect(popup.isClosed()).toBe(false);
   expect(popup.url()).toContain('/popup.html');expect(received).toBeUndefined();
  }
  const pagesBefore=context.pages().length;  await popup.getByRole('button',{name:connectLabel}).click();
  if(reject){
   await expect.poll(()=>popup.getByRole('status').innerText(),{timeout:10000}).toContain('não foi aceito');
   expect(await app.locator('#extension-status').innerText()).toContain('não foi aceito');
   expect(await app.locator('#result').innerText()).toBe('');expect(imports).toBe(1);return;
  }
  await expect.poll(()=>popup.getByRole('status').innerText(),{timeout:10000}).toContain(local?'Verificação registrada':'verificada.');
  expect(context.pages()).toHaveLength(pagesBefore);
  expect(await app.locator('#result').innerText()).toBe(portal);
  expect(received.body.expectedUserId).toBe(owner);
  expect(imports).toBe(1);
  expect(received.headers['x-orbita-request']).toBe('1');expect(received.headers.cookie).toContain('app_session=synthetic-app-cookie');
  if(local){
   expect(received.body).toEqual({authorizeLocalConnection:true,expectedUserId:owner,authenticated:true,extensionVersion:manifest.version});
   expect((await context.cookies(provider.accountUrl)).find(c=>c.name==='candidate_session')?.value).toBe('synthetic-cookie');
   expect(candidate.url()).toBe(provider.accountUrl);
  }else{
   expect(received.body.authorizeSessionTransfer).toBe(true);
   expect(received.body.state.cookies.map((c:any)=>c.name)).toEqual(['candidate_session']);
   expect(received.body.state.origins).toEqual([{origin:new URL(provider.accountUrl).origin,localStorage:[{name:'authToken',value:'synthetic-'+portal}]}]);
  }
  expect(JSON.stringify(received.body)).not.toContain('never-export-google');expect(JSON.stringify(received.body)).not.toContain('synthetic-app-cookie');
 }finally{
  await context.close();
  if(directory.startsWith(join(tmpdir(),'portal-extension-test-')))await rm(directory,{recursive:true,force:true});
 }
},30000);
