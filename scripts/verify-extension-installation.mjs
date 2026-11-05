// Render project fixtures in a fresh cloud VM; never attach to a user's Chrome.
import {Sandbox} from '@vercel/sandbox';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {unzipSync} from 'fflate';

const auth=JSON.parse(await readFile(join(homedir(),'AppData/Roaming/com.vercel.cli/Data/auth.json'),'utf8'));
const project=JSON.parse(await readFile('.vercel/project.json','utf8'));
if(project.projectName!=='curriculoautomatico'||!auth.token)throw Error('Existing project authorization required');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Installation from'./src/ChromeExtensionInstallation';import'./src/RemotePortalLogin.css';function Preview(){const params=new URLSearchParams(location.search),[installed,setInstalled]=useState(params.has('installed')?'2.0.7':undefined);return <section className="gupy-chrome-connection"><div className="chrome-connection-shell"><header className="chrome-connection-hero"><h1>Conecte seus portais pelo Chrome</h1><p>Uma extensão para Gupy, InfoJobs, Glassdoor e LinkedIn.</p></header><Installation installedVersion={installed} storeUrl={params.has('store')?'https://chromewebstore.google.com/detail/empregatos/'+ 'a'.repeat(32):''} onOpenConnector={()=>{}} onCheckInstallation={()=>setInstalled('2.0.7')}/></div></section>}createRoot(document.getElementById('root')).render(<Preview/>);`;
const compiled=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'preview',format:'iife',minify:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env.VITE_CHROME_WEB_STORE_URL':'undefined'},platform:'browser'});
const js=compiled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css')).text;
const fontDirectory='node_modules/@fontsource-variable/inter/files',font=(await readdir(fontDirectory)).find(f=>f==='inter-latin-wght-normal.woff2');
const fontData=font?(await readFile(join(fontDirectory,font))).toString('base64'):'';
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}@font-face{font-family:Inter;src:url(data:font/woff2;base64,${fontData}) format('woff2');font-weight:100 900}body{margin:0;font-family:Inter,system-ui}.gupy-chrome-connection{height:auto;min-height:100vh;overflow:visible}</style><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></html>`;
const remote=await readFile('scripts/verify-extension-installation-remote.mjs');
let root,sandbox;
try{
 sandbox=await Sandbox.create({token:auth.token,teamId:project.orgId,projectId:project.projectId,image:'vercel/sandbox/universal',resources:{vcpus:1},timeout:8*60000,tags:{purpose:'extension-installation-fixtures'}});
 console.log(JSON.stringify({stage:'created',sandboxId:sandbox.sandboxId,productionSessionsUsed:false}));
 const location=await sandbox.runCommand({cmd:'pwd',args:[]});const base=(await location.stdout()).trim();
 if(location.exitCode!==0||!/^\/[a-zA-Z0-9_./-]+$/.test(base)||base.includes('..'))throw Error('Unexpected fresh sandbox directory');
 root=base.replace(/\/$/,'')+'/empregatos-installation-preview';
 await sandbox.mkDir(root);
 await sandbox.mkDir(root+'/extension');
 const files=unzipSync(await readFile('public/downloads/empregatos-chrome-web-store.zip'));
 const manifest=JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));
 manifest.host_permissions.push('https://*.linkedin.com/*'); // Synthetic fixture permission only.
 files['manifest.json']=Buffer.from(JSON.stringify(manifest));
 await sandbox.writeFiles([{path:root+'/preview.html',content:Buffer.from(html)},{path:root+'/verify.mjs',content:remote},...Object.entries(files).map(([name,content])=>{if(!/^[a-z0-9.-]+$/i.test(name))throw Error('Unexpected package path');return{path:root+'/extension/'+name,content};})]);
 async function run(stage,cmd,args,extra={}){
  console.log(JSON.stringify({stage}));const result=await sandbox.runCommand({cmd,args,cwd:root,env:{PLAYWRIGHT_BROWSERS_PATH:root+'/browsers',EMPREGATOS_PREVIEW_ROOT:root,NODE_OPTIONS:'--max-old-space-size=512'},...extra});
  if(result.exitCode!==0)throw Error(stage+': '+(await result.stderr()).slice(-2000));
  return result;
 }
 await run('install-playwright','npm',['install','--no-audit','--no-fund','playwright@1.64.0']);
 await run('install-browser','npx',['--no-install','playwright','install','--with-deps','chromium'],{sudo:true});
 const result=await run('visual-and-extension-checks','node',['verify.mjs']);
 console.log(await result.stdout());
 await mkdir('artifacts/chrome-web-store',{recursive:true});
 for(const name of ['extension-installation-desktop.png','extension-installation-mobile.png','extension-installation-detected.png','extension-store-installation-preview.png']){
  const image=await sandbox.readFileToBuffer({path:root+'/'+name});if(!image)throw Error('Missing screenshot '+name);await writeFile('artifacts/'+name,image);
 }
 const screenshot=await sandbox.readFileToBuffer({path:root+'/store-screenshot-1280x800.png'});if(!screenshot)throw Error('Missing store screenshot');
 await writeFile('artifacts/chrome-web-store/screenshot-1280x800.png',screenshot);
}finally{
 if(sandbox){let stopped=false,deleted=false;await sandbox.stop().then(()=>{stopped=true;}).catch(()=>{});await sandbox.delete().then(()=>{deleted=true;}).catch(()=>{});console.log(JSON.stringify({stage:'cleanup',sandboxId:sandbox.sandboxId,stopped,deleted}));}
}
