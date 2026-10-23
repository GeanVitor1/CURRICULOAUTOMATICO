import {readFile,readdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
// Run using `vercel env run -e production`; preserve the existing non-sensitive
// catalog and add only official boards supported by the deployed adapter.
const previous=JSON.parse(process.env.DISCOVERY_ATS_BOARDS||'null');
if(!Array.isArray(previous)||!previous.some(s=>s.board==='ciandt')||!previous.some(s=>s.board==='gympass'))throw Error('Verified existing production catalog required');
const additions=[{type:'greenhouse',company:'Zup Innovation',board:'zupinnovation'},{type:'greenhouse',company:'CodeRoad',board:'coderoad'}];
const next=[...previous];for(const s of additions)if(!next.some(n=>n.type===s.type&&n.board===s.board))next.push(s);
let cli;for(const dir of await readdir(join(homedir(),'AppData/Local/npm-cache/_npx'))){try{const root=join(homedir(),'AppData/Local/npm-cache/_npx',dir,'node_modules/vercel'),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));if(pkg.version==='65.2.0'){cli=join(root,pkg.bin.vercel);break;}}catch{}}
if(!cli)throw Error('Authenticated CLI unavailable');
const child=spawn(process.execPath,[cli,'env','update','DISCOVERY_ATS_BOARDS','--environment','production','--value',JSON.stringify(next),'--yes'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',s=>stderr+=s);const code=await new Promise(resolve=>child.on('exit',resolve));
if(code!==0)throw Error(`Production catalog update failed (${code})`);
const report={at:new Date().toISOString(),previous,next,changedVariable:'DISCOVERY_ATS_BOARDS',filtersChanged:false,existingGrantsChanged:false,requiresDeployment:true};
await writeFile('artifacts/submittable-expansion-config-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
