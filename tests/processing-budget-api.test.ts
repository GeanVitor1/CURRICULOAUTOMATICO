import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {FastifyInstance} from "fastify";
import {claimResumeProcessing,releaseResumeProcessing} from "../server/processing-budget";
let first:FastifyInstance,second:FastifyInstance,db:typeof import("../server/db"),directory="",cookie="",id="";
const headers=()=>({cookie,origin:"http://127.0.0.1:5173","x-orbita-request":"1"});
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"empregatos-budget-"));
 for(const [key,value]of Object.entries({DATA_DIR:directory,NODE_ENV:"test",DATABASE_PROVIDER:"",DATABASE_URL:"",REDIS_URL:"",VERCEL:"",API_PROXY_SECRET:"",APP_ORIGIN:"http://127.0.0.1:5173",PORTAL_CLOUD_ENABLED:"false",PORTAL_CONNECTIONS_ENABLED:"false",GEMINI_API_KEY:""}))vi.stubEnv(key,value);
 const {buildApp}=await import("../server/app");db=await import("../server/db");
 first=await buildApp({serveStatic:false});second=await buildApp({serveStatic:false});
 const registered=await first.inject({method:"POST",url:"/api/auth/register",headers:headers(),payload:{name:"Synthetic account",email:"budget@example.test",password:"Synthetic-password-123"}});
 expect(registered.statusCode).toBe(200);id=registered.json().id+":live";cookie=String(registered.headers["set-cookie"]).split(";")[0];
},60000);
afterAll(async()=>{await first?.close();await second?.close();await db?.closeDb();if(directory.startsWith(join(tmpdir(),"empregatos-budget-")))await rm(directory,{recursive:true,force:true});vi.unstubAllEnvs();});
it("shares the account budget across independent API instances and changing IPs",async()=>{
 for(let i=0;i<6;i++){
  const app=i%2?second:first;
  const result=await app.inject({method:"POST",url:"/api/resumes/build",headers:headers(),remoteAddress:`127.0.1.${i+1}`,payload:{}});
  expect(result.statusCode,result.body).toBe(i<5?400:429);
  if(i===5)expect(Number(result.headers["retry-after"])).toBeGreaterThan(0);
 }
 expect((await db.readWorkspace(id))!.processingSecurity?.lease).toBeUndefined();
 const visible=await first.inject({url:"/api/workspace",headers:headers()});
 expect(visible.statusCode).toBe(200);expect(visible.json()).not.toHaveProperty("processingSecurity");
 const exported=await first.inject({url:"/api/export",headers:headers()});expect(exported.body).not.toContain("processingSecurity");
});
it("atomically grants only one in-flight lease and recovers a crashed lease without an old release erasing it",async()=>{
 const attempts=await Promise.allSettled(["one","two"].map(token=>db.mutateWorkspace(id,w=>claimResumeProcessing(w,"upload",token))));
 expect(attempts.filter(a=>a.status==="fulfilled")).toHaveLength(1);
 expect(attempts.filter(a=>a.status==="rejected")).toHaveLength(1);
 const current=(await db.readWorkspace(id))!.processingSecurity!.lease!.token;
 await db.mutateWorkspace(id,w=>{releaseResumeProcessing(w,current);claimResumeProcessing(w,"upload","replacement");releaseResumeProcessing(w,current);});
 expect((await db.readWorkspace(id))!.processingSecurity?.lease?.token).toBe("replacement");
});
