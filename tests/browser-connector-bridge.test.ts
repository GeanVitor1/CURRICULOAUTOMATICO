import {expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import * as config from '../shared/browser-connectors';
const base='https://curriculoautomatico.vercel.app';
const frame={viewerId:'controlled-viewer',authenticated:true,image:'data:image/png;base64,AA=='};
async function bridge(portal='infojobs',result:unknown=frame,options:{status?:number;invalidJson?:boolean;timeout?:boolean}={}){
 let listener:Function=()=>{};
 const postMessage=vi.fn(),timeout=vi.fn((milliseconds:number)=>({milliseconds}));
 const fetcher=vi.fn(async()=>{
  if(options.timeout)throw Object.assign(Error('Internal browser timeout'),{name:'TimeoutError'});
  return {ok:(options.status||200)<400,status:options.status||200,json:async()=>{if(options.invalidJson)throw SyntaxError('Unexpected token <html>');return result;}};
 });
 const win={postMessage,addEventListener:vi.fn(),removeEventListener:vi.fn()};
 runInNewContext(await readFile('browser-extension/gupy-session/content.js','utf8'),{window:win,location:{origin:base,pathname:'/app',href:base+'/app?portal='+portal},URL,AbortSignal:{timeout},fetch:fetcher,EmpreGatosPortals:config,chrome:{runtime:{id:'fixture',getManifest:()=>({version:'2.0.8'}),onMessage:{addListener:(fn:Function)=>{listener=fn;},removeListener:vi.fn()}}}});
 return {fetcher,timeout,postMessage,send:async(type:string,body:Record<string,unknown>={})=>{
  const reply=vi.fn();listener({type,portal,...body},{id:'fixture'},reply);await vi.waitFor(()=>expect(reply).toHaveBeenCalled());return reply.mock.calls[0][0];
 }};
}
it('bounds a cloud session import instead of leaving the connector waiting forever',async()=>{
 const p=await bridge();expect(await p.send('empregatos:import-session',{state:{cookies:[],origins:[]}})).toEqual({ok:true});
 const options=(p.fetcher.mock.calls[0] as any[])[1];expect(options.signal).toBeDefined();expect(options.signal.milliseconds).toBeGreaterThan(0);expect(options.signal.milliseconds).toBeLessThanOrEqual(90000);
});
it.each([{},null,{...frame,authenticated:false},{...frame,image:''}])('does not report a verified session for an unusable server response: %j',async response=>{
 const p=await bridge('infojobs',response),reply=await p.send('empregatos:import-session');expect(reply.ok).not.toBe(true);expect(reply.error).toBeTruthy();
 expect(p.postMessage.mock.calls.some(([message])=>message.type==='empregatos:browser-session')).toBe(false);
});
it('explains a timeout without treating it as success or replaying the transfer',async()=>{
 const p=await bridge('gupy',undefined,{timeout:true}),reply=await p.send('empregatos:import-session');
 expect(reply.error).toMatch(/demorou|tempo/i);expect(p.fetcher).toHaveBeenCalledOnce();
});
it('gives a readable server error when a proxy returns HTML rather than JSON',async()=>{
 const p=await bridge('gupy',undefined,{status:502,invalidJson:true}),reply=await p.send('empregatos:import-session');
 expect(reply.error).not.toContain('<html>');expect(reply.error).not.toContain('Unexpected token');expect(reply.ok).not.toBe(true);
});
it('does not confirm a LinkedIn observation without a recorded local verification',async()=>{
 const p=await bridge('linkedin',{}),reply=await p.send('empregatos:verify-local-login');expect(reply.ok).not.toBe(true);
 expect(p.postMessage.mock.calls.some(([message])=>message.type==='empregatos:local-login-verified')).toBe(false);
});
it('accepts the server record of local LinkedIn verification without transferring a browser session',async()=>{
 const p=await bridge('linkedin',{portal:'linkedin',mode:'local-browser',automatic:false,localLogin:{observedAt:new Date().toISOString()}});
 expect(await p.send('empregatos:verify-local-login',{expectedUserId:'owner',authenticated:true,authorizeLocalConnection:true,extensionVersion:'2.0.8'})).toEqual({ok:true});
 const [url,options]=(p.fetcher.mock.calls[0] as any[]);expect(url).toContain('/local-browser');expect(options.body).not.toContain('cookies');expect(options.body).not.toContain('origins');
});
