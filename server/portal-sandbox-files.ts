import type {Sandbox} from '@vercel/sandbox';

// Only on creation of a NEW account sandbox. Resume must retain that account's
// own encrypted session. A reusable image must never supply another session.
export const initializeNewPortalFiles = `
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(process.argv[1]);
 if(path.basename(root)!=='portal-runtime')throw Error('Unexpected portal runtime directory');
 for(const name of ['private','requests','controller.key']){
  const target=path.resolve(root,name);
  if(path.dirname(target)!==root)throw Error('Runtime target escaped its directory');
  await fs.rm(target,{force:true,recursive:name!=='controller.key'});
 }
 await fs.mkdir(path.join(root,'private'),{recursive:true,mode:0o700});
 await fs.mkdir(path.join(root,'requests'),{recursive:true,mode:0o700});
})().catch(()=>{process.exitCode=1;});`;

export function portalSandboxLifecycle(provision:(sandbox:Sandbox)=>Promise<void>,root='/vercel/sandbox/portal-runtime'){
 return {
  onCreate:async(sandbox:Sandbox)=>{
   try{
    const result=await sandbox.runCommand({cmd:'node',args:['-e',initializeNewPortalFiles,root]});
    if(result.exitCode!==0)throw Error('Não foi possível inicializar a sessão privada desta conta.');
    await provision(sandbox);
   }catch(error){
    // No user session has been uploaded at this point. Remove only this failed
    // new sandbox; never delete the shared image or another account's runtime.
    await sandbox.delete().catch(()=>{});
    throw error;
   }
  },
  onResume:provision,
 };
}
