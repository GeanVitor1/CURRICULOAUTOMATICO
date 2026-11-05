import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Visual interaction with the shipped popup and synthetic Chrome APIs. The
// VM regression suite separately executes the bridge and permission logic.
export async function verifyConnectorUi(context,base,output){
 const version=JSON.parse(await readFile('browser-extension/gupy-session/manifest.json','utf8')).version;
 const errors=[];
 await context.addInitScript(({version})=>{
  const portal=new URL(location.href).searchParams.get('portal')||'linkedin',canonical='https://curriculoautomatico.vercel.app';
  const domains={linkedin:'www.linkedin.com',infojobs:'www.infojobs.com.br',glassdoor:'www.glassdoor.com',gupy:'portal.gupy.io'};
  const state=window.__connectorQa={signedOut:true,finish:null,calls:[],permissions:0,reads:0};
  window.chrome={runtime:{getManifest:()=>({version})},storage:{local:{get:async()=>({selectedPortal:portal}),set:async()=>{}}},
   permissions:{request:async()=>{state.permissions++;return true;}},
   scripting:{executeScript:async input=>input.files?[]:[{result:portal==='linkedin'?{origin:'https://'+domains[portal],authenticated:true}:{origin:'https://'+domains[portal],localStorage:[{name:'authToken',value:'synthetic'}]}}]},
   cookies:{getAll:async()=>{state.reads++;return [{name:'candidate_session',value:'synthetic',domain:'.'+domains[portal].replace(/^(www|portal)\./,''),path:'/',secure:true,httpOnly:true,sameSite:'lax'}];}},
   tabs:{query:async q=>typeof q.url==='string'?[{id:1,url:canonical+'/app?portal='+portal}]:[{id:2,url:'https://'+domains[portal]+'/feed/'}],get:async()=>({id:1,url:canonical+'/app?portal='+portal}),create:async()=>({id:3}),update:async()=>{},
    sendMessage:async(id,message)=>{
     state.calls.push(message.type);
     if(message.type==='empregatos:connection-context')return state.signedOut?{error:'Entre na sua conta do EmpreGatos antes de conectar.'}:{ok:true,context:{portal,available:true,mode:portal==='linkedin'?'local-browser':'cloud-session',account:{id:'synthetic-owner',name:'Conta QA',email:'qa@example.test'}}};
     if(['empregatos:import-session','empregatos:verify-local-login'].includes(message.type))return new Promise(resolve=>{state.finish=resolve;});
     return {ok:true};
    }}};
 },{version});
 const page=await context.newPage();await page.setViewportSize({width:900,height:950});page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const portal of ['linkedin','gupy','infojobs','glassdoor']){
   await page.goto(base+'/qa-extension/popup.html?portal='+portal);
   await page.waitForFunction(()=>document.querySelector('#account').textContent.includes('Entre na sua conta'));
   assert.equal(await page.locator('#connect').isDisabled(),true);
   await page.evaluate(()=>{window.__connectorQa.signedOut=false;window.dispatchEvent(new Event('focus'));});
   await page.waitForFunction(()=>document.querySelector('#account').textContent.includes('qa@example.test'));
   await page.locator('#consent').check();await page.locator('#connect').click();
   await page.waitForFunction(()=>!!window.__connectorQa.finish);
   assert.equal(await page.locator('#status').getAttribute('aria-busy'),'true');
   assert.equal(await page.locator('#refresh-account').isDisabled(),true);
   assert.equal(await page.locator('#portal').isDisabled(),true);
   if(portal==='linkedin'){
    assert.equal(await page.evaluate(()=>window.__connectorQa.reads),0);
    await page.screenshot({path:output('qa-extension-verifying.png'),fullPage:true});
   }
   await page.evaluate(()=>window.__connectorQa.finish({ok:true}));
   await page.waitForFunction(()=>document.querySelector('#status').getAttribute('aria-busy')==='false');
   const text=await page.locator('#status').textContent();
   assert.match(text,portal==='linkedin'?/Verificação registrada/:/Confirme e salve/);
   assert.equal(await page.locator('#consent').isChecked(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.screenshot({path:output('qa-extension-verified.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  return {passed:true,version,portals:['linkedin','gupy','infojobs','glassdoor'],loginRecovery:true,busyStateVisible:true,explicitConsent:true,linkedInCookieReads:0,chromeApis:'synthetic',runtimeErrors:errors};
 }catch(error){
  await page.screenshot({path:output('qa-extension-error.png'),fullPage:true}).catch(()=>{});
  throw error;
 }finally{await page.close().catch(()=>{});}
}
