import {it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function launcher(contexts:unknown[]=[]){
 const handlers:Record<string,Function>={},create=vi.fn(async()=>({id:5})),update=vi.fn(async()=>{}),inject=vi.fn(async()=>[]);
 const api={runtime:{id:'fixture',getURL:(file:string)=>'chrome-extension://fixture/'+file,getContexts:async()=>contexts,getManifest:()=>({version:'2.0.3'}),onInstalled:{addListener:(f:Function)=>{handlers.install=f;}},onStartup:{addListener:()=>{}},onMessage:{addListener:(f:Function)=>{handlers.message=f;}}},action:{onClicked:{addListener:(f:Function)=>{handlers.click=f;}}},tabs:{create,update,query:async()=>[{id:1,url:'https://curriculoautomatico.vercel.app/app?portal=linkedin'},{id:2,url:'https://www.linkedin.com/feed/'}]},scripting:{executeScript:inject}};
 const source=await readFile('browser-extension/gupy-session/background.js','utf8');
 const vm={chrome:api,URL,fetch:async()=>({ok:true,json:async()=>({channel:'store'})})};
 const context=runInNewContext(source+'; ({openConnector,refreshProjectBridges})',vm);
 return{...context,handlers,create,update,inject};
}
it('opens a persistent connector tab rather than the provider when the toolbar action is clicked',async()=>{
 const p=await launcher();p.handlers.click();await vi.waitFor(()=>expect(p.create).toHaveBeenCalledWith({url:'chrome-extension://fixture/popup.html'}));
 const manifest=JSON.parse(await readFile('browser-extension/gupy-session/manifest.json','utf8'));expect(manifest.action.default_popup).toBeUndefined();
});
it('reuses the connector tab and selects the portal without opening LinkedIn',async()=>{
 const p=await launcher([{tabId:7,documentUrl:'chrome-extension://fixture/popup.html?portal=gupy'}]);
 await p.openConnector('linkedin');expect(p.update).toHaveBeenCalledWith(7,{active:true,url:'chrome-extension://fixture/popup.html?portal=linkedin'});expect(p.create).not.toHaveBeenCalled();
});
it('reinstalls the content bridge after update only into project pages',async()=>{
 const p=await launcher();await p.refreshProjectBridges();expect(p.inject).toHaveBeenCalledExactlyOnceWith({target:{tabId:1},files:['config.js','content.js']});
});
it('rejects requests from an unrelated site without opening the connector',async()=>{
 const p=await launcher(),reply=vi.fn();p.handlers.message({type:'empregatos:open-connector',portal:'linkedin'},{id:'fixture',tab:{url:'https://example.test/app'}},reply);
 expect(p.create).not.toHaveBeenCalled();expect(reply).not.toHaveBeenCalled();
});
it('binds the connector destination to the requesting project tab instead of a page-supplied tab ID',async()=>{
 const p=await launcher(),reply=vi.fn();
 p.handlers.message({type:'empregatos:open-connector',portal:'linkedin',tabId:999},{id:'fixture',tab:{id:42,url:'https://curriculoautomatico.vercel.app/app?portal=linkedin&flow=connections'}},reply);
 await vi.waitFor(()=>expect(reply).toHaveBeenCalledWith({ok:true}));
 expect(p.create).toHaveBeenCalledWith({url:'chrome-extension://fixture/popup.html?portal=linkedin&tab=42'});
});
it('focuses an already selected portal without reloading its ongoing connection',async()=>{
 const p=await launcher([{tabId:7,documentUrl:'chrome-extension://fixture/popup.html?portal=linkedin'}]);
 await p.openConnector('linkedin');expect(p.update).toHaveBeenCalledWith(7,{active:true});expect(p.create).not.toHaveBeenCalled();
});
it('recovers a connector tab closed between inventory and focus without showing a stale tab error',async()=>{
 const p=await launcher([{tabId:7,documentUrl:'chrome-extension://fixture/popup.html?portal=linkedin'}]);p.update.mockRejectedValueOnce(Error('No tab with id: 7.'));
 await p.openConnector('linkedin');expect(p.create).toHaveBeenCalledOnce();
});
