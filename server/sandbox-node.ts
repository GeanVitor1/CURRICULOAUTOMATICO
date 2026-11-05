import type { Sandbox } from "@vercel/sandbox";
import { secureNodeVersion } from "./runtime-security";

const root = "/vercel/sandbox/portal-runtime/node-runtime";
/** Fixed vendor release; no candidate input, credentials or session data enter this command. */
export const installSandboxNodeSource = `
const fs=require('node:fs/promises'),https=require('node:https'),crypto=require('node:crypto'),cp=require('node:child_process'),util=require('node:util');
const root=${JSON.stringify(root)},base='https://nodejs.org/dist/v22.23.4/',archive='node-v22.23.4-linux-x64.tar.xz';
const download=url=>new Promise((resolve,reject)=>{const parts=[];let size=0;const req=https.get(url,{headers:{'Accept-Encoding':'identity'},timeout:30000},res=>{if(res.statusCode!==200){res.resume();reject(Error('Vendor download failed'));return;}res.on('data',part=>{size+=part.length;if(size>80000000){res.destroy(Error('Download limit'));return;}parts.push(part);});res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(parts)));});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Download timeout')));});
(async()=>{
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('Unsupported sandbox runtime');
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const lock=root+'/install.lock';let acquired=false;
 for(let i=0;i<300;i++){try{await fs.mkdir(lock);acquired=true;break;}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(r=>setTimeout(r,200));}}
 if(!acquired)throw Error('Runtime installation busy');
 let temporary;
 try{
  const version=await util.promisify(cp.execFile)(root+'/bin/node',['--version']).catch(()=>null);
  if(version&&/^v22\\.(?:2[4-9]|[3-9][0-9])\\.|^v22\\.23\\.(?:[4-9]|[1-9][0-9]+)/.test(version.stdout.trim()))return;
  temporary=await fs.mkdtemp(root+'/install-');
  const sums=(await download(base+'SHASUMS256.txt')).toString('utf8');
  const line=sums.split('\\n').find(line=>line.trim().endsWith(' '+archive));
  if(!line||!/^([a-f0-9]{64})\\s/.test(line))throw Error('Missing vendor checksum');
  const bytes=await download(base+archive);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==line.split(/\\s/)[0])throw Error('Runtime checksum mismatch');
  await fs.writeFile(temporary+'/'+archive,bytes,{mode:0o600});
  await util.promisify(cp.execFile)('tar',['-xJf',temporary+'/'+archive,'-C',temporary],{timeout:30000});
  const unpacked=temporary+'/node-v22.23.4-linux-x64';
  await fs.mkdir(root+'/bin',{recursive:true,mode:0o700});
  await fs.rename(unpacked+'/bin/node',root+'/bin/node');
 }finally{if(temporary&&temporary.startsWith(root+'/install-'))await fs.rm(temporary,{recursive:true,force:true});await fs.rmdir(lock);}
})().catch(()=>{console.error('Sandbox Node security update failed');process.exitCode=1;});`;

export async function ensureSandboxNode(sandbox: Sandbox): Promise<string> {
  const version = async (cmd: string) => {
    try {
      const result = await sandbox.runCommand({cmd,args:["--version"]});
      if (result.exitCode !== 0) return false;
      return secureNodeVersion((await result.stdout()).trim());
    } catch { return false; }
  };
  if (await version("node")) return "node";
  const executable = `${root}/bin/node`;
  if (await version(executable)) return executable;
  const result = await sandbox.runCommand({cmd:"node",args:["-e",installSandboxNodeSource]});
  if (result.exitCode !== 0 || !await version(executable)) throw new Error("O Node do navegador precisa da atualização de segurança; nenhum documento foi processado.");
  return executable;
}
