import {it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as config from '../shared/browser-connectors';
const base='https://curriculoautomatico.vercel.app',owner='11111111-1111-4111-8111-111111111111';
async function popup(portal:config.BrowserSessionPortal,options:{deny?:boolean;swap?:boolean;missingBridge?:boolean;unavailable?:boolean;unavailableReason?:string;legacyServer?:boolean;rejectLocal?:boolean;signedOut?:boolean;malformedContext?:boolean;tabHint?:number;hintWrongOrigin?:boolean}={}){
 const handlers:Record<string,Function>={};
 const elements=Object.fromEntries(['portal','consent','connect','status','account','login','project','refresh-account','consent-label','limitation','version'].map(id=>[id,{value:id==='portal'?portal:'',checked:false,disabled:false,textContent:'',addEventListener:(event:string,fn:Function)=>{handlers[id+':'+event]=fn;}}]));
 const provider=config.browserConnectors[portal],url=provider.accountUrl;let contexts=0;
 let missing=options.missingBridge;
 const send=vi.fn(async(_id:number,message:any)=>{
  if(missing){missing=false;throw Error('Could not establish connection. Receiving end does not exist.');}
  if(message.type==='empregatos:connection-context'&&options.signedOut)return {error:'Entre na sua conta do EmpreGatos antes de conectar.'};
  if(message.type==='empregatos:connection-context'&&options.malformedContext)return {ok:true,context:{}};
  if(message.type==='empregatos:verify-local-login'&&options.rejectLocal)return {error:'Falha ao registrar a verificação.'};
  return message.type==='empregatos:connection-context'?{ok:true,context:{portal,available:!options.unavailable,mode:options.legacyServer?'cloud-session':config.browserConnectionMode(portal),...(options.unavailableReason?{unavailableReason:options.unavailableReason}:{}),account:{id:options.swap&&++contexts>1?'other-account':owner,name:'QA',email:'qa@example.test'}}}:{ok:true};
 });
 const getAll=vi.fn(async()=>[{name:'session',value:'synthetic',domain:'.'+provider.domains[0],path:'/',secure:true,httpOnly:true,sameSite:'lax'},{name:'google',value:'never-export',domain:'.google.com',path:'/',secure:true,httpOnly:true}]);
 const execute=vi.fn(async(input:any)=>input.files?[]:[{result:input.func(...input.args)}]);
 const request=vi.fn(async()=>!options.deny);
 const vm={EmpreGatosPortals:config,URL,Map,Promise,setTimeout,location:{origin:new URL(url).origin,href:'chrome-extension://fixture/popup.html?portal='+portal+(options.tabHint?'&tab='+options.tabHint:'')},window:{addEventListener:(event:string,fn:Function)=>{handlers['window:'+event]=fn;}},
  document:{querySelector:(selector:string)=>selector===provider.signedSelector?{}:selector.startsWith('#')?elements[selector.slice(1)]:null,querySelectorAll:()=>[]},
  localStorage:{get length(){if(portal==='linkedin')throw Error('LinkedIn credentials must never be read');return 2;},key:(i:number)=>i===0?'authToken':'unrelatedPreference',getItem:()=> 'synthetic'},
  chrome:{runtime:{getManifest:()=>({version:'2.0.6'})},storage:{local:{get:async()=>({selectedPortal:portal}),set:vi.fn()}},permissions:{request},
   tabs:{get:async(id:number)=>({id,url:options.hintWrongOrigin?'https://other.example/app?portal='+portal:base+'/app?portal='+portal+'&flow=connections'}),query:async({url:query}:any)=>typeof query==='string'?[{id:1,url:base+'/app?portal='+portal}]:[{id:2,url},{id:3,url:'https://accounts.google.com/'}],sendMessage:send,create:vi.fn(),update:vi.fn()},
   cookies:{getAll},scripting:{executeScript:execute}}};
 runInNewContext(await readFile('browser-extension/gupy-session/popup.js','utf8'),vm);
 await vi.waitFor(()=>expect(elements.account.textContent).toContain(options.signedOut?'Entre na sua conta':options.malformedContext?'confirmar a conta':'qa@example.test'));
 return {handlers,elements,send,getAll,execute,request,api:vm.chrome,updateTab:vm.chrome.tabs.update,createTab:vm.chrome.tabs.create};
}
async function connect(p:Awaited<ReturnType<typeof popup>>){p.elements.consent.checked=true;p.handlers['consent:change']();await p.handlers['connect:click']();}
it('returns to the exact initiating project tab even when an older portal tab is also open',async()=>{
 const p=await popup('linkedin',{tabHint:42});await connect(p);
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:verify-local-login').map(([id])=>id)).toEqual([42]);
 expect(p.updateTab).toHaveBeenCalledWith(42,{active:true});
});
it('refuses a destination hint that no longer points to this project and portal',async()=>{
 const p=await popup('linkedin',{tabHint:42,hintWrongOrigin:true});
 expect(p.send.mock.calls.some(([id])=>id===42)).toBe(false);expect(p.send.mock.calls[0][0]).toBe(1);
});
it('does not request permissions or read any provider state when the server suspends LinkedIn transfers',async()=>{
 const reason='Transferência suspensa para esta conta.';
 const p=await popup('linkedin',{unavailable:true,unavailableReason:reason});await connect(p);
 expect(p.elements.status.textContent).toBe(reason);
 expect(p.elements.connect.disabled).toBe(true);
 expect(p.request).not.toHaveBeenCalled();expect(p.execute).not.toHaveBeenCalled();expect(p.getAll).not.toHaveBeenCalled();
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:import-session')).toHaveLength(0);
});
it.each(['gupy','infojobs','glassdoor'] as config.BrowserSessionPortal[])('exports only the chosen %s session, after consent and matching project-account verification',async portal=>{
 const p=await popup(portal);
 await p.handlers['connect:click']();expect(p.execute).not.toHaveBeenCalled();
 p.elements.consent.checked=true;p.handlers['consent:change']();await p.handlers['connect:click']();
 expect(p.request).toHaveBeenCalledWith({origins:config.browserConnectors[portal].domains.map(domain=>`https://*.${domain}/*`)});
 expect(p.execute).toHaveBeenCalledOnce();
 const sent=p.send.mock.calls.find(([,message])=>message.type==='empregatos:import-session')![1];
 expect(sent.portal).toBe(portal);expect(sent.expectedUserId).toBe(owner);
 expect(sent.state.cookies.map((c:any)=>c.name)).toEqual(['session']);
 expect(sent.state.origins[0].localStorage).toEqual([{name:'authToken',value:'synthetic'}]);
 expect(JSON.stringify(sent)).not.toContain('never-export');
 expect(p.elements.status.textContent).toContain('verificada');expect(p.elements.consent.checked).toBe(false);
 expect(p.updateTab).toHaveBeenCalledWith(1,{active:true});
 expect(p.createTab).not.toHaveBeenCalled();
});
it('recognizes LinkedIn locally without reading cookies or authentication storage or importing a session',async()=>{
 const p=await popup('linkedin');await connect(p);
 expect(p.getAll).not.toHaveBeenCalled();
 const local=p.send.mock.calls.filter(([,m])=>m.type==='empregatos:verify-local-login');expect(local).toHaveLength(1);
 expect(local[0][1]).toEqual({type:'empregatos:verify-local-login',portal:'linkedin',expectedUserId:owner,authenticated:true,authorizeLocalConnection:true,extensionVersion:'2.0.6'});
 expect(p.send.mock.calls.some(([,m])=>m.type==='empregatos:import-session')).toBe(false);
 expect(p.elements.status.textContent).toContain('permaneceram no navegador');
 expect(p.elements.status.textContent).toContain('envio automático pelo LinkedIn continua indisponível');
});
it('does not mark a refused local LinkedIn observation as saved',async()=>{
 const p=await popup('linkedin',{rejectLocal:true});await connect(p);
 expect(p.elements.status.textContent).toBe('Falha ao registrar a verificação.');expect(p.getAll).not.toHaveBeenCalled();
});
it('rejects an old server before reading LinkedIn login state',async()=>{
 const p=await popup('linkedin',{legacyServer:true});await connect(p);
 expect(p.elements.status.textContent).toContain('servidor precisa ser atualizado');expect(p.execute).not.toHaveBeenCalled();expect(p.getAll).not.toHaveBeenCalled();
});
it('repairs a project tab whose content bridge disappeared after an extension update before collecting credentials',async()=>{
 const p=await popup('infojobs',{missingBridge:true});
 expect(p.execute).toHaveBeenCalledWith({target:{tabId:1},files:['config.js','content.js']});
 expect(p.getAll).not.toHaveBeenCalled();
 p.elements.consent.checked=true;p.handlers['consent:change']();await p.handlers['connect:click']();
 expect(p.send.mock.calls.filter(([,message])=>message.type==='empregatos:import-session')).toHaveLength(1);
 expect(p.elements.status.textContent).toContain('verificada');
});
it.each([{deny:true},{swap:true}])('does not read browser credentials when permission or destination account validation fails: %j',async options=>{
 const p=await popup('infojobs',options);p.elements.consent.checked=true;p.handlers['consent:change']();await p.handlers['connect:click']();
 expect(p.execute).not.toHaveBeenCalled();expect(p.getAll).not.toHaveBeenCalled();
 expect(p.send.mock.calls.some(([,message])=>message.type==='empregatos:import-session')).toBe(false);
});
it('finds the replacement project tab after the Chrome permission prompt instead of using its cached ID',async()=>{
 const p=await popup('infojobs');
 const original=p.api.tabs.query;
 p.request.mockImplementation(async()=>{p.api.tabs.query=async query=>typeof query.url==='string'?[{id:4,url:base+'/app?portal=infojobs'}]:original(query);return true;});
 const send=p.send.getMockImplementation()!;
 p.send.mockImplementation(async(id,message)=>{if(id===1)throw Error('No tab with id: 1.');return send(id,message);});
 await connect(p);
 expect(p.elements.status.textContent).toContain('verificada');
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:import-session').map(([id])=>id)).toEqual([4]);
 expect(p.updateTab).toHaveBeenCalledWith(4,{active:true});
});
it('recovers when a project tab disappears between discovery and account verification',async()=>{
 const p=await popup('infojobs'),original=p.api.tabs.query;let stale=true;
 p.api.tabs.query=async query=>typeof query.url==='string'?[{id:stale?1:4,url:base+'/app?portal=infojobs'}]:original(query);
 const send=p.send.getMockImplementation()!;
 p.send.mockImplementation(async(id,message)=>{if(id===1){stale=false;throw Error('No tab with id: 1007628461.');}return send(id,message);});
 await connect(p);
 expect(p.elements.status.textContent).toContain('verificada');
 expect(p.getAll).toHaveBeenCalledOnce();expect(p.updateTab).toHaveBeenCalledWith(4,{active:true});
});
it('skips a vanished portal tab and inspects the remaining authenticated tab',async()=>{
 const p=await popup('infojobs'),original=p.api.tabs.query;
 p.api.tabs.query=async query=>typeof query.url==='string'?original(query):[{id:2,url:config.browserConnectors.infojobs.accountUrl},{id:4,url:config.browserConnectors.infojobs.accountUrl}];
 p.execute.mockRejectedValueOnce(Error('No tab with id: 1007628461.'));
 await connect(p);
 expect(p.execute).toHaveBeenCalledTimes(2);expect(p.elements.status.textContent).toContain('verificada');
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:import-session')).toHaveLength(1);
});
it('rediscovers portal tabs once when the only authenticated tab vanished during inspection',async()=>{
 const p=await popup('infojobs');p.execute.mockRejectedValueOnce(Error('No tab with id: 2.'));
 await connect(p);
 expect(p.execute).toHaveBeenCalledTimes(2);expect(p.elements.status.textContent).toContain('verificada');
});
it('revalidates the owner before retrying a transfer that Chrome definitively did not deliver',async()=>{
 const p=await popup('infojobs'),original=p.api.tabs.query;let stale=true,delivered=0;
 p.api.tabs.query=async query=>typeof query.url==='string'?[{id:stale?1:4,url:base+'/app?portal=infojobs'}]:original(query);
 const send=p.send.getMockImplementation()!;
 p.send.mockImplementation(async(id,message)=>{if(message.type==='empregatos:import-session'){if(id===1){stale=false;throw Error('No tab with id: 1.');}delivered++;}return send(id,message);});
 await connect(p);
 expect(delivered).toBe(1);expect(p.elements.status.textContent).toContain('verificada');
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:connection-context').at(-1)?.[0]).toBe(4);
});
it('does not read credentials if the replacement project tab belongs to another account',async()=>{
 const p=await popup('infojobs'),original=p.api.tabs.query;
 p.api.tabs.query=async query=>typeof query.url==='string'?[{id:4,url:base+'/app?portal=infojobs'}]:original(query);
 const send=p.send.getMockImplementation()!;
 p.send.mockImplementation(async(id,message)=>message.type==='empregatos:connection-context'?{ok:true,context:{portal:'infojobs',available:true,mode:'cloud-session',account:{id:'other',name:'Other',email:'other@example.test'}}}:send(id,message));
 await connect(p);
 expect(p.elements.status.textContent).toContain('conta do EmpreGatos mudou');
 expect(p.getAll).not.toHaveBeenCalled();expect(p.execute).not.toHaveBeenCalled();
});
it('does not replay a transfer after the message port closed with an uncertain server outcome',async()=>{
 const p=await popup('infojobs'),send=p.send.getMockImplementation()!;
 p.send.mockImplementation(async(id,message)=>{if(message.type==='empregatos:import-session')throw Error('The message port closed before a response was received.');return send(id,message);});
 await connect(p);
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:import-session')).toHaveLength(1);
 expect(p.elements.status.textContent).toContain('Confira a aba do EmpreGatos antes de repetir');
});
it('refreshes a destination after logging into the project in another tab',async()=>{
 const options={signedOut:true},p=await popup('linkedin',options);
 expect(p.elements.connect.disabled).toBe(true);options.signedOut=false;
 p.handlers['window:focus']();await vi.waitFor(()=>expect(p.elements.account.textContent).toContain('qa@example.test'));
 expect(p.elements.consent.checked).toBe(false);expect(p.getAll).not.toHaveBeenCalled();expect(p.execute).not.toHaveBeenCalled();
 await connect(p);expect(p.elements.status.textContent).toContain('Verificação registrada');
});
it('offers an explicit account refresh and clears previous consent',async()=>{
 const p=await popup('infojobs');p.elements.consent.checked=true;p.handlers['consent:change']();
 p.handlers['refresh-account:click']();await vi.waitFor(()=>expect(p.elements.consent.checked).toBe(false));
 expect(p.getAll).not.toHaveBeenCalled();expect(p.execute).not.toHaveBeenCalled();
});
it('does not replay a local verification after an uncertain message-port failure',async()=>{
 const p=await popup('linkedin'),send=p.send.getMockImplementation()!;
 p.send.mockImplementation(async(id,message)=>{if(message.type==='empregatos:verify-local-login')throw Error('The message port closed before a response was received.');return send(id,message);});
 await connect(p);expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:verify-local-login')).toHaveLength(1);
 expect(p.elements.status.textContent).toContain('Confira a aba do EmpreGatos');
});
it('rejects malformed destination data without exposing an internal error',async()=>{
 const p=await popup('linkedin',{malformedContext:true});await connect(p);
 expect(p.elements.connect.disabled).toBe(true);expect(p.request).not.toHaveBeenCalled();expect(p.elements.account.textContent).toContain('Atualizar conta');
});
it('does not refresh the destination while permissions are being granted',async()=>{
 const p=await popup('linkedin');
 p.request.mockImplementation(async()=>{p.handlers['window:focus']();return true;});
 await connect(p);expect(p.elements.status.textContent).toContain('Verificação registrada');
 expect(p.send.mock.calls.filter(([,m])=>m.type==='empregatos:connection-context')).toHaveLength(3);
});
