import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const qa=JSON.parse(await readFile('.data/queue-integration-private.json','utf8'));
const url=process.argv[2];if(!/^https:\/\/curriculoautomatico-[a-z0-9]+-geans-projects-da7db03c\.vercel\.app$/.test(url))throw Error('Dedicated deployment URL required');
const replay=process.argv.includes('--replay'),discovery=process.argv.includes('--discovery');
const args=['--yes','vercel','curl','/api/internal/queue-integration','--deployment',url,'--scope','team_bHYZKgxVXE5lhNnvsiDlLvyR','--','--silent','--show-error','--fail','-X','POST','-H','Content-Type: application/json','-H','X-Orbita-Request: 1','-H','Origin: https://curriculoautomatico.vercel.app','-H',`X-Queue-Integration-Key: ${qa.secret}`,'--data',JSON.stringify({replay,discovery})];
// Spawn the installed JS CLI directly: no Windows shell or secret-bearing
// command string. Its stdout contains only the resulting message ID.
import {readdir} from 'node:fs/promises';import{homedir}from'node:os';import{join}from'node:path';
const cache=join(homedir(),'AppData/Local/npm-cache/_npx');
let cli='';for(const entry of await readdir(cache)){try{const p=join(cache,entry,'node_modules/vercel/dist/index.js');await readFile(p);cli=p;break;}catch{}}
if(!cli)throw Error('Vercel CLI cache not found');
const child=spawn(process.execPath,[cli,...args.slice(2)],{windowsHide:true});let out='',err='';
child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);
const code=await new Promise(resolve=>child.on('exit',resolve));
if(code!==0){console.error(err.replaceAll(qa.secret,'[redacted]'));throw Error('Hosted queue publication failed');}
const value=JSON.parse(out);const path='artifacts/vercel-queues-integration-2026-10-23.json';let report={};try{report=JSON.parse(await readFile(path,'utf8'));}catch{}
report={...report,producerEnvironment:'production',producer:'dedicated hosted deployment',hostedPublications:[...(report.hostedPublications||[]),{at:new Date().toISOString(),replay,discovery,...value}]};
await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify(value));
