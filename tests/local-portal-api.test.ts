import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {FastifyInstance} from 'fastify';

let app:FastifyInstance,db:typeof import('../server/db'),dir:string;
const origin='http://127.0.0.1:5173',url='/api/connections/linkedin/local-browser';
let users:{id:string;cookie:string}[]=[];
const headers=(user=users[0])=>({origin,'x-orbita-request':'1',cookie:user.cookie});
const payload=(user=users[0])=>({expectedUserId:user.id,authorizeLocalConnection:true,authenticated:true,extensionVersion:'2.0.6'});
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),'empregatos-local-login-'));
 process.env.DATA_DIR=dir;process.env.NODE_ENV='test';delete process.env.DATABASE_URL;delete process.env.REDIS_URL;
 const module=await import('../server/app');db=await import('../server/db');app=await module.buildApp();
 for(const index of [1,2]){
  const result=await app.inject({method:'POST',url:'/api/auth/register',remoteAddress:`127.0.0.${index}`,headers:{origin,'x-orbita-request':'1'},payload:{name:`Pessoa ${index}`,email:`local-${index}@example.test`,password:'Local-QA-password-123'}});
  expect(result.statusCode).toBe(200);users.push({id:result.json().id,cookie:String(result.headers['set-cookie']).split(';')[0]});
 }
},60000);
afterAll(async()=>{await app?.close();await db?.closeDb();if(dir?.startsWith(join(tmpdir(),'empregatos-local-login-')))await rm(dir,{recursive:true,force:true});});
it('requires authentication, CSRF protection, consent and the authenticated destination; refuses credentials',async()=>{
 expect((await app.inject({method:'POST',url,headers:{origin,'x-orbita-request':'1'},payload:payload()})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url,headers:{origin,cookie:users[0].cookie},payload:payload()})).statusCode).toBe(403);
 let ip=10;
 for(const body of [{...payload(),authorizeLocalConnection:false},{...payload(),expectedUserId:users[1].id},{...payload(),authenticated:false},{...payload(),state:{cookies:[{name:'session',value:'must-not-store'}]}}]){
  const result=await app.inject({method:'POST',url,headers:headers(),remoteAddress:`127.0.0.${ip++}`,payload:body});expect(result.statusCode).toBe(400);
 }
 const context=await app.inject({url:'/api/connections/browser-extension-context?portal=linkedin',headers:headers()});
 expect(context.json()).toMatchObject({mode:'local-browser',available:true,localLogin:null});
});
it('records two separate local observations without cloud calls or granting submission permission',async()=>{
 const cloud=await import('../server/portal-cloud'),run=vi.spyOn(cloud,'cloudPortalCommand');
 vi.stubEnv('PORTAL_CLOUD_ENABLED','false');vi.stubEnv('LINKEDIN_SESSION_RETEST_ENABLED','false');
 try{
  for(const [index,user] of users.entries()){
   const context=(await app.inject({url:'/api/connections/browser-extension-context?portal=linkedin',headers:headers(user)})).json();
   expect(context).toMatchObject({mode:'local-browser',available:true,account:{id:user.id},localLogin:null});
   const result=await app.inject({method:'POST',url,remoteAddress:`127.0.0.${20+index}`,headers:headers(user),payload:payload(user)});
   expect(result.statusCode).toBe(200);expect(result.headers['cache-control']).toBe('no-store');
   expect(result.json()).toMatchObject({mode:'local-browser',automatic:false,localLogin:{extensionVersion:'2.0.6'}});
   const cap=(await app.inject({url:'/api/automation/sites',headers:headers(user)})).json().find((s:any)=>s.id==='linkedin');
   expect(cap).toMatchObject({sessionState:'local_verified',localLoginVerified:true,connected:false,sessionSaved:false,submissionEnabled:false,automatic:false,connectable:true});
   expect(await (await import('../server/portal-sessions')).readyPortals(user.id,'resume')).not.toContain('linkedin');
  }
  expect(run).not.toHaveBeenCalled();
 }finally{run.mockRestore();vi.unstubAllEnvs();}
});
it('forgets only the current user observation, without contacting LinkedIn or the cloud browser',async()=>{
 const cloud=await import('../server/portal-cloud'),run=vi.spyOn(cloud,'cloudPortalCommand'),disconnect=vi.spyOn(cloud,'disconnectCloudPortal');
 try{
  expect((await app.inject({method:'DELETE',url:'/api/connections/linkedin',headers:headers()})).statusCode).toBe(200);
  expect((await app.inject({url:'/api/connections/browser-extension-context?portal=linkedin',headers:headers()})).json().localLogin).toBeNull();
  expect((await app.inject({url:'/api/connections/browser-extension-context?portal=linkedin',headers:headers(users[1])})).json().localLogin).not.toBeNull();
  expect(run).not.toHaveBeenCalled();expect(disconnect).not.toHaveBeenCalled();
 }finally{run.mockRestore();disconnect.mockRestore();}
});
it('keeps legacy cloud imports blocked even when every old rollout flag is enabled',async()=>{
 vi.stubEnv('LINKEDIN_SESSION_RETEST_ENABLED','true');vi.stubEnv('PORTAL_CLOUD_ENABLED','true');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','fixture');vi.stubEnv('PORTAL_CLOUD_ALL_USERS','true');vi.stubEnv('PORTAL_CLOUD_SESSION_PORTALS','linkedin');
 const cloud=await import('../server/portal-cloud'),run=vi.spyOn(cloud,'cloudPortalCommand');
 try{
  const result=await app.inject({method:'POST',url:'/api/connections/linkedin/browser-session',headers:headers(),payload:{authorizeSessionTransfer:true,state:{cookies:[],origins:[]}}});
  expect(result.statusCode).toBe(400);expect(result.json().error).toContain('temporariamente suspensa');expect(run).not.toHaveBeenCalled();
 }finally{run.mockRestore();vi.unstubAllEnvs();}
});
