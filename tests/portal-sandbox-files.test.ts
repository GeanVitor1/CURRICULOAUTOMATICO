import {it,expect,vi}from'vitest';
import{mkdtemp,mkdir,writeFile,readFile,readdir,rm}from'node:fs/promises';
import{tmpdir}from'node:os';import{resolve,join,sep}from'node:path';
import{execFile}from'node:child_process';import{promisify}from'node:util';
import{portalSandboxLifecycle}from'../server/portal-sandbox-files';
const execute=promisify(execFile);
it('starts new account storage empty and preserves its own session when resuming',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'portal-account-files-')),root=resolve(temporary,'portal-runtime');
 if(!root.startsWith(resolve(temporary)+sep))throw Error('Fixture root escaped temporary workspace');
 try{
  await mkdir(join(root,'private'),{recursive:true});await mkdir(join(root,'requests'),{recursive:true});
  await writeFile(join(root,'private','session.enc'),'synthetic-image-session');await writeFile(join(root,'requests','stale.request'),'synthetic');await writeFile(join(root,'controller.key'),'synthetic-old-key');await writeFile(join(root,'runner.mjs'),'keep-runtime');
  const command=vi.fn(async({args}:{args:string[]})=>{await execute(process.execPath,args);return{exitCode:0};});
  const sandbox={runCommand:command}as any,provision=vi.fn(async()=>{}),lifecycle=portalSandboxLifecycle(provision,root);
  await lifecycle.onCreate(sandbox);
  expect(await readdir(join(root,'private'))).toEqual([]);expect(await readdir(join(root,'requests'))).toEqual([]);
  await expect(readFile(join(root,'controller.key'))).rejects.toThrow();expect(await readFile(join(root,'runner.mjs'),'utf8')).toBe('keep-runtime');
  await writeFile(join(root,'private','session.enc'),'synthetic-own-session');
  await lifecycle.onResume(sandbox);
  expect(command).toHaveBeenCalledOnce();expect(provision).toHaveBeenCalledTimes(2);expect(await readFile(join(root,'private','session.enc'),'utf8')).toBe('synthetic-own-session');
 }finally{if(resolve(temporary).startsWith(resolve(tmpdir())+sep)&&temporary.includes('portal-account-files-'))await rm(temporary,{recursive:true,force:true});}
});
it('does not provision a new account if its private storage could not be initialized',async()=>{
 const provision=vi.fn(async()=>{}),lifecycle=portalSandboxLifecycle(provision);
 const remove=vi.fn(async()=>{});
 await expect(lifecycle.onCreate({runCommand:async()=>({exitCode:1}),delete:remove}as any)).rejects.toThrow('sessão privada');expect(provision).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledOnce();
});
