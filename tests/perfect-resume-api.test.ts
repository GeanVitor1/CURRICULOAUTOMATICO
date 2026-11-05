import{afterAll,afterEach,beforeAll,beforeEach,expect,it,vi}from'vitest';
import{mkdtemp,rm}from'node:fs/promises';
import{join}from'node:path';
import{tmpdir}from'node:os';
import{randomUUID}from'node:crypto';
import type{FastifyInstance}from'fastify';
import{createWorkspace}from'../server/workspace';
import{perfectContent,baseResume,perfectProfile,perfectJob}from'./fixtures/perfect-resume';
import{perfectContentSchema}from'../server/perfect-resume';
let app:FastifyInstance,db:typeof import('../server/db'),intelligence:typeof import('../server/intelligence'),directory='',cookie='',owner='',foreignCookie='',testIp=10;
const request=(method:string,url:string,payload?:unknown,session=cookie)=>app.inject({method:method as any,url,remoteAddress:`127.0.0.${testIp}`,headers:{cookie:session,origin:'http://127.0.0.1:5173','x-orbita-request':'1'},payload:payload as any});
const input=()=>({requestId:randomUUID(),sourceResumeId:baseResume.id,job:perfectJob,template:'moderno',language:'pt-BR',additionalContext:''});
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'empregatos-perfect-'));vi.stubEnv('DATA_DIR',directory);vi.stubEnv('NODE_ENV','test');vi.stubEnv('DATABASE_PROVIDER','');vi.stubEnv('DATABASE_URL','');vi.stubEnv('REDIS_URL','');
 db=await import('../server/db');intelligence=await import('../server/intelligence');app=await(await import('../server/app')).buildApp();
 const register=async(email:string)=>{const r=await request('POST','/api/auth/register',{name:'Pessoa QA',email,password:'Controlled-perfect-123'},'');expect(r.statusCode).toBe(200);return{cookie:String(r.headers['set-cookie']).split(';')[0],id:r.json().id};};
 const first=await register('perfect-owner@example.test'),second=await register('perfect-foreign@example.test');cookie=first.cookie;owner=first.id+':live';foreignCookie=second.cookie;
},60000);
beforeEach(async()=>{testIp++;await db.mutateWorkspace(owner,w=>{delete w.processingSecurity;delete w.perfectResumes;Object.assign(w,createWorkspace('Pessoa Exemplo','pessoa@example.com'));w.profile=structuredClone(perfectProfile);w.resumes=[structuredClone(baseResume)];w.routine.enabled=true;w.routine.mode='automatic';w.routine.minScore=70;});});
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{await app?.close();await db?.closeDb();vi.unstubAllEnvs();if(directory.startsWith(join(tmpdir(),'empregatos-perfect-')))await rm(directory,{recursive:true,force:true});});
it('requires authentication, CSRF and the existing professional-data consent',async()=>{
 expect((await request('GET','/api/perfect-resumes',undefined,'')).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url:'/api/perfect-resumes',headers:{cookie},payload:input()})).statusCode).toBe(403);
 await expect(intelligence.generatePrivateDocument(owner.split(':')[0],'','',perfectContentSchema)).rejects.toThrow('Ative');
 expect((await request('POST','/api/perfect-resumes',input())).statusCode).toBe(400);
 expect((await db.readWorkspace(owner))!.perfectResumes).toBeUndefined();
});
it('creates a private independent version, preserves automation/profile/original, and deduplicates replay',async()=>{
 const generator=vi.spyOn(intelligence,'generatePrivateDocument').mockResolvedValue(perfectContent()),body=input(),before=(await db.readWorkspace(owner))!;
 const r=await request('POST','/api/perfect-resumes',body);expect(r.statusCode,r.body).toBe(200);const draft=r.json();
 expect(draft.content.headline).toContain('Frontend');expect(draft.contact.name).toBe(perfectProfile.name);
 const prompt=generator.mock.calls[0][1];expect(prompt).not.toContain(perfectProfile.email);expect(prompt).not.toContain(perfectProfile.name);expect(prompt).toContain(perfectJob.title);
 const after=(await db.readWorkspace(owner))!;expect(after.profile).toEqual(before.profile);expect(after.routine).toEqual(before.routine);expect(after.resumes).toEqual(before.resumes);expect(after.applications).toEqual([]);
 expect((await request('POST','/api/perfect-resumes',body)).json().id).toBe(draft.id);expect(generator).toHaveBeenCalledOnce();
 expect((await request('GET','/api/perfect-resumes')).json().items).toHaveLength(1);
 expect((await request('GET','/api/workspace?summary=true')).json().perfectResumes).toBeUndefined();
 expect((await request('GET','/api/perfect-resumes',undefined,foreignCookie)).json().items).toEqual([]);
 expect((await request('GET',`/api/perfect-resumes/${draft.id}/download`,undefined,foreignCookie)).statusCode).toBe(400);
 expect((await request('DELETE',`/api/perfect-resumes/${draft.id}`,undefined,foreignCookie)).statusCode).toBe(200);
 expect((await request('GET','/api/perfect-resumes')).json().items).toHaveLength(1);
});
it('exports a readable PDF and text, versions edits, rejects stale writes and keeps the letter separate',async()=>{
 vi.spyOn(intelligence,'generatePrivateDocument').mockResolvedValue(perfectContent());const created=(await request('POST','/api/perfect-resumes',input())).json();
 const update={revision:created.revision,content:{...created.content,summary:created.content.summary+' Atuação com TypeScript.'},template:'executivo'};
 const saved=await request('PUT',`/api/perfect-resumes/${created.id}`,update);expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().revision).toBe(2);
 expect((await request('PUT',`/api/perfect-resumes/${created.id}`,update)).statusCode).toBe(400);
 const pdf=await request('GET',`/api/perfect-resumes/${created.id}/download`);expect(pdf.statusCode).toBe(200);expect(pdf.headers['content-type']).toContain('application/pdf');expect(pdf.rawPayload.subarray(0,4).toString()).toBe('%PDF');expect(pdf.headers['cache-control']).toContain('no-store');
 const text=await request('GET',`/api/perfect-resumes/${created.id}/download?format=txt`);expect(text.body).toContain('Empresa Nuvem');expect(text.body).toContain('2024 - 2026');expect(text.body).not.toContain('Acrescente seus projetos');
 const letter=await request('GET',`/api/perfect-resumes/${created.id}/download?format=txt&kind=letter`);expect(letter.body).toContain('Olá, equipe');expect(letter.body).not.toContain('Empresa Nuvem');
 const malicious={...saved.json().content,summary:saved.json().content.summary+' Tenho 30 anos de experiência.'};expect((await request('PUT',`/api/perfect-resumes/${created.id}`,{revision:2,content:malicious,template:'moderno'})).statusCode).toBe(400);
 await request('DELETE',`/api/perfect-resumes/${created.id}`);expect((await request('GET','/api/perfect-resumes')).json().items).toEqual([]);
});
it('does not call the provider for a foreign source or an unsafe URL',async()=>{
 const generator=vi.spyOn(intelligence,'generatePrivateDocument').mockResolvedValue(perfectContent());
 expect((await request('POST','/api/perfect-resumes',{...input(),sourceResumeId:'not-owned'})).statusCode).toBe(400);
 expect((await request('POST','/api/perfect-resumes/inspect',{url:'https://127.0.0.1/secret',description:perfectJob.description})).statusCode).toBe(400);
 expect(generator).not.toHaveBeenCalled();
});
it('serializes concurrent generation across the account and rejects a stale source after generation',async()=>{
 let release!:(v:unknown)=>void;const generator=vi.spyOn(intelligence,'generatePrivateDocument').mockImplementation(()=>new Promise(r=>{release=r;}));
 const first=request('POST','/api/perfect-resumes',input()).then(r=>r);
 await vi.waitFor(()=>expect(generator).toHaveBeenCalledOnce());
 expect((await request('POST','/api/perfect-resumes',input())).statusCode).toBe(429);
 await db.mutateWorkspace(owner,w=>{w.profile.years=3;});release(perfectContent());
 const result=await first;expect(result.statusCode).toBe(400);expect(result.json().error).toContain('mudou durante');expect((await db.readWorkspace(owner))!.perfectResumes).toBeUndefined();
});
