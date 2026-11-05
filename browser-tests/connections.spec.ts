import{test,expect,type Page}from'@playwright/test';
import{createWorkspace}from'../server/workspace';

async function fixture(page:Page,{error=false,connected=false,reject=false}={}){
 const w=createWorkspace('Pessoa de teste','fixture@example.test'),verified=new Set(connected?['linkedin','gupy']:[]);let confirms=0;
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==='/api/auth/me')return route.fulfill({json:{id:'fixture',name:w.profile.name,email:w.profile.email}});
  if(path==='/api/workspace')return route.fulfill({json:w});
  if(path==='/api/workspace/version')return route.fulfill({json:{revision:'fixture'}});
  if(path==='/api/automation/sites')return error?route.fulfill({status:503,json:{error:'Falha controlada de conexão.'}}):route.fulfill({json:['linkedin','gupy','infojobs','glassdoor'].map(id=>({id,connectable:true,connected:verified.has(id),sessionState:verified.has(id)?(id==='linkedin'?'local_verified':'verified'):'disconnected',connectedAt:new Date().toISOString(),connectionMode:id==='linkedin'?'local-browser':undefined}))});
  if(path==='/api/connections/browser-extension-context')return route.fulfill({json:{portal:url.searchParams.get('portal'),available:true,mode:url.searchParams.get('portal')==='linkedin'?'local-browser':'cloud-session',localLogin:verified.has('linkedin')?{observedAt:new Date().toISOString(),expiresAt:Date.now()+60000}:null}});
  if(path.endsWith('/confirm')){
   confirms++;expect(route.request().postDataJSON()).toEqual({connectionOnly:true,authorizeAutomation:false,profileResumeId:null});
   expect(route.request().headers()['x-portal-viewer']).toBe('11111111-1111-4111-8111-111111111111');
   if(reject)return route.fulfill({status:400,json:{error:'O portal não confirmou o login.'}});
   verified.add(path.split('/')[3]);return route.fulfill({json:{ok:true,automatic:false}});
  }
  if(route.request().method()==='DELETE'){verified.delete(path.split('/')[3]);return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:{}});
 });
 return{verify:()=>{verified.add('linkedin');},confirms:()=>confirms};
}
async function connector(page:Page){
 await page.evaluate(()=>{
  (window as any).connectorOpens=0;
  window.addEventListener('message',event=>{
   if(event.data?.type==='empregatos:request-open-connector')(window as any).connectorOpens++;
   if(event.data?.type==='empregatos:request-connector-status')window.postMessage({type:'empregatos:connector-status',portal:event.data.portal,version:'2.0.10',text:'Extensão pronta',kind:'ready'},location.origin);
  });
  const portal=new URL(location.href).searchParams.get('portal');window.postMessage({type:'empregatos:connector-status',portal,version:'2.0.10',text:'Extensão pronta',kind:'ready'},location.origin);
 });
 await expect.poll(()=>page.evaluate(()=>(window as any).connectorOpens)).toBe(1);
}
test('shows all four accounts, truthful confirmation, and a responsive light and dark design',async({page})=>{
 await fixture(page,{connected:true});await page.addInitScript(()=>localStorage.setItem('orbita-theme','light'));
 await page.goto('/app#conexoes');await expect(page.locator('.connections-provider')).toHaveCount(4);
 await expect(page.locator('.connections-total')).toContainText('2');
 await expect(page.getByRole('button',{name:'Conexões',exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/connections-desktop-light.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(async()=>{const box=await page.locator('#app-navigation').boundingBox();return box?box.x+box.width:0;}).toBeLessThanOrEqual(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/connections-mobile-light.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.screenshot({path:'artifacts/connections-desktop-dark.png',fullPage:true});
 await page.getByRole('button',{name:'Desconectar LinkedIn',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await expect(page.locator('.connections-total')).toContainText('2');
});
test('opens the connector and returns to Connections after the server confirms a local LinkedIn verification',async({page})=>{
 const f=await fixture(page);await page.goto('/app#conexoes');await page.getByRole('link',{name:'Conectar LinkedIn',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Conecte sua conta/})).toBeVisible();await connector(page);
 f.verify();await page.evaluate(()=>window.postMessage({type:'empregatos:local-login-verified',portal:'linkedin'},location.origin));
 await expect(page).toHaveURL(/#conexoes$/);await expect(page.getByRole('status').filter({hasText:'LinkedIn conectado com sucesso'})).toBeVisible();
 expect(f.confirms()).toBe(0);
});
for(const [portal,name]of[['gupy','Gupy'],['infojobs','InfoJobs'],['glassdoor','Glassdoor']])test(`saves ${name} once without enabling applications and returns to the accounts page`,async({page})=>{
 const f=await fixture(page);await page.goto(`/app?portal=${portal}&flow=connections`);await connector(page);
 if(portal==='gupy'){await expect(page.getByRole('heading',{name:'Continue na aba da extensão'})).toBeVisible();await page.screenshot({path:'artifacts/connections-extension-flow.png',fullPage:true});}
 await page.evaluate(portal=>{for(let i=0;i<2;i++)window.postMessage({type:portal==='gupy'?'empregatos:gupy-browser-session':'empregatos:browser-session',portal,frame:{authenticated:true,viewerId:'11111111-1111-4111-8111-111111111111'}},location.origin);},portal);
 await expect(page).toHaveURL(/#conexoes$/);await expect(page.getByRole('status').filter({hasText:`${name} conectado com sucesso`})).toBeVisible();expect(f.confirms()).toBe(1);
});
test('does not claim connection or replay a rejected save',async({page})=>{
 const f=await fixture(page,{reject:true});await page.goto('/app?portal=infojobs&flow=connections');await connector(page);
 await page.evaluate(()=>window.postMessage({type:'empregatos:browser-session',portal:'infojobs',frame:{authenticated:true,viewerId:'11111111-1111-4111-8111-111111111111'}},location.origin));
 await expect(page.getByRole('alert')).toContainText('O portal não confirmou o login');
 await page.evaluate(()=>window.postMessage({type:'empregatos:browser-session',portal:'infojobs',frame:{authenticated:true,viewerId:'11111111-1111-4111-8111-111111111111'}},location.origin));
 expect(f.confirms()).toBe(1);await expect(page).toHaveURL(/flow=connections/);
});
test('does not treat a return parameter or a failed status request as proof of connection',async({page})=>{
 await fixture(page,{error:true});await page.goto('/app?connected=linkedin#conexoes');
 await expect(page.getByRole('alert')).toContainText('Não conseguimos conferir');await expect(page.locator('.connections-success')).toHaveCount(0);
 await expect(page.locator('.connections-provider .connections-state.is-connected')).toHaveCount(0);
});
test('requires a server observation before accepting a LinkedIn success notification',async({page})=>{
 await fixture(page);await page.goto('/app?portal=linkedin&flow=connections');await connector(page);
 await page.evaluate(()=>window.postMessage({type:'empregatos:local-login-verified',portal:'linkedin'},location.origin));
 await expect(page.getByRole('alert')).toContainText('O servidor ainda não confirmou');await expect(page).toHaveURL(/flow=connections/);
});
