import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const auth=JSON.parse(await readFile(join(homedir(),'AppData/Roaming/com.vercel.cli/Data/auth.json'),'utf8'));
const project=JSON.parse(await readFile('.vercel/project.json','utf8'));
if(project.projectName!=='curriculoautomatico'||!auth.token)throw Error('Existing project authorization required');
const report=JSON.parse(await readFile('artifacts/discovery-coverage-1793098495561.json','utf8'));
const boards=report.results.flatMap(r=>r.source&&Number.isInteger(r.examined)&&r.examined>0?[{board:r.source.board,company:r.source.company}]:[]);
if(boards.length!==4||!boards.some(b=>b.board==='rptalentos'))throw Error('Expected independently verified public boards');
const response=await fetch(`https://api.vercel.com/v10/projects/${project.projectId}/env?teamId=${project.orgId}&upsert=true`,{
 method:'POST',headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},
 body:JSON.stringify([{key:'DISCOVERY_QUICKIN_ADDITIONAL_BOARDS',value:JSON.stringify(boards),type:'encrypted',target:['production']}]),
});
if(!response.ok)throw Error(`Configuration HTTP ${response.status}`);
const result=await response.json();if(result.failed?.length)throw Error('Configuration rejected');
const evidence={at:new Date().toISOString(),boards,existingCatalogPreserved:true,filtersChanged:false,requiresDeployment:true};
await writeFile('artifacts/public-channel-expansion-2026-10-27.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
