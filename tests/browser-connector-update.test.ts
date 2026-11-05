import {it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {unzipSync,strFromU8} from 'fflate';

async function updater(options:{next?:string;disk?:string;channel?:string;views?:unknown[];offline?:boolean}={}){
 const handlers:Record<string,Function>={},reload=vi.fn(),readCookies=vi.fn();
 const root='chrome-extension://synthetic-fixture/';
 const fetch=vi.fn(async(url:string)=>{
  expect(url.startsWith(root)).toBe(true);
  if(options.offline)throw Error('No local metadata');
  return {ok:true,json:async()=>url.endsWith('release.json')?{version:options.next||'2.0.3',channel:options.channel||'development'}:{version:options.disk||options.next||'2.0.3'}};
 });
 const create=vi.fn();
 const chrome={runtime:{id:'synthetic-fixture',getURL:(name:string)=>root+name,getManifest:()=>({version:'2.0.2'}),getContexts:vi.fn(async()=>options.views||[]),reload,
  onInstalled:{addListener:(fn:Function)=>{handlers.installed=fn;}},onStartup:{addListener:(fn:Function)=>{handlers.startup=fn;}}},
  alarms:{get:vi.fn(async()=>null),create,onAlarm:{addListener:(fn:Function)=>{handlers.alarm=fn;}}},cookies:{getAll:readCookies}};
 const source=await readFile('browser-extension/gupy-session/background.js','utf8');
 await runInNewContext(source+'; initializeUpdater()',{chrome,fetch});
 return{reload,readCookies,fetch,create,handlers};
}
it('automatically reloads a completed newer local release using only bundled metadata',async()=>{
 const p=await updater();expect(p.reload).toHaveBeenCalledOnce();
 expect(p.create).toHaveBeenCalledWith('empregatos-local-update',{periodInMinutes:1});
 expect(p.readCookies).not.toHaveBeenCalled();
 expect(p.fetch.mock.calls.every(([url])=>url.startsWith('chrome-extension://'))).toBe(true);
});
it.each([
 {next:'2.0.2'},{next:'2.0.1'},{next:'invalid'},{next:'99999.0'},
 {disk:'2.0.2'}, {views:[{contextType:'POPUP'}]},
 {views:[{contextType:'TAB',documentUrl:'chrome-extension://synthetic-fixture/popup.html?portal=linkedin'}]},
 {channel:'store'}, {offline:true},
])('never reloads unchanged, older, partial, unavailable or busy releases: %j',async options=>{
 const p=await updater(options);expect(p.reload).not.toHaveBeenCalled();expect(p.readCookies).not.toHaveBeenCalled();
 if(options.channel==='store')expect(p.create).not.toHaveBeenCalled();
});
it('does not treat a normal project page as an active connector',async()=>{
 const p=await updater({views:[{contextType:'TAB',documentUrl:'https://curriculoautomatico.vercel.app/app'}]});
 expect(p.reload).toHaveBeenCalledOnce();
});
it('checks again on the scheduled alarm after an active connector is closed',async()=>{
 const options={next:'2.0.3',views:[{contextType:'POPUP'}]};
 const p=await updater(options);expect(p.reload).not.toHaveBeenCalled();
 options.views=[];p.handlers.alarm({name:'empregatos-local-update'});
 await vi.waitFor(()=>expect(p.reload).toHaveBeenCalledOnce());
 expect(p.readCookies).not.toHaveBeenCalled();
});
it('prepares a separate store package that relies on Chrome updates without local polling permission',async()=>{
 const files=unzipSync(await readFile('public/downloads/empregatos-chrome-web-store.zip'));
 const manifest=JSON.parse(strFromU8(files['manifest.json'])),release=JSON.parse(strFromU8(files['release.json']));
 expect(release).toEqual({version:manifest.version,channel:'store'});
 expect(manifest.permissions).not.toContain('alarms');
 expect(manifest.host_permissions).toEqual(['https://curriculoautomatico.vercel.app/*']);
 expect(manifest.update_url).toBeUndefined();
});
