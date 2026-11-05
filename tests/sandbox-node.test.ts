import {expect,it,vi}from"vitest";
import {ensureSandboxNode,installSandboxNodeSource}from"../server/sandbox-node";
import {secureNodeVersion}from"../server/runtime-security";
it.each(["22.23.4","24.22.1","24.22.2","26.12.1"])("accepts patched runtime %s",version=>expect(secureNodeVersion(version)).toBe(true));
it.each(["22.23.3","24.15.0","26.12.0","24.22.1-malicious","23.0.0"])("rejects unsafe or malformed runtime %s",version=>expect(secureNodeVersion(version)).toBe(false));
it("upgrades an old VM before returning an executable and never accepts a failed upgrade",async()=>{
 let installed=false;
 const run=vi.fn(async({cmd,args}:{cmd:string;args:string[]})=>{
  if(args[0]==="-e"){installed=true;return{exitCode:0,stdout:async()=>""};}
  if(cmd==="node")return{exitCode:0,stdout:async()=>"v22.20.0\n"};
  return{exitCode:installed?0:1,stdout:async()=>installed?"v22.23.4\n":""};
 });
 const executable=await ensureSandboxNode({runCommand:run}as any);expect(executable).toContain("node-runtime/bin/node");
 expect(run.mock.calls.find(call=>call[0].args[0]==="-e")?.[0].args[1]).toBe(installSandboxNodeSource);
 expect(installSandboxNodeSource).toContain("https://nodejs.org/dist/v22.23.4/");expect(installSandboxNodeSource).toContain("SHASUMS256.txt");
 await expect(ensureSandboxNode({runCommand:async()=>({exitCode:1,stdout:async()=>""})}as any)).rejects.toThrow("atualização de segurança");
});
