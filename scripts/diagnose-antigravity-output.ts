import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {Sandbox} from '@vercel/sandbox';
import {parseAntigravitySearch} from '../server/antigravity-protocol';
import {JOB_SEARCH_POLICY,JOB_SEARCH_RESPONSE} from '../server/job-search-policy';
import {antigravityJobsSchema} from '../server/antigravity-protocol';
import {z} from 'zod';
const env=parse(await readFile('.env.automation-current.local'));
process.env.VERCEL_OIDC_TOKEN=env.VERCEL_OIDC_TOKEN;
const s=await Sandbox.get({name:'empregatos-antigravity'});
try{
 const c=JSON.parse((await s.readFileToBuffer({path:'/vercel/sandbox/antigravity-control.json'}))!.toString());
 if(!c.connected||c.busyUntil>Date.now())throw Error('Search unavailable or already in use');
 const r=await s.runCommand({cmd:'/vercel/sandbox/run-antigravity.sh',args:['-p',`${JOB_SEARCH_POLICY}\nExecute Google Search: site:jobs.quickin.io "Desenvolvedor .NET" remoto Brasil. Hoje é 27/10/2026. Faça uma busca e retorne até 3 anúncios individuais. ${JOB_SEARCH_RESPONSE}`,'--output-format','stream-json','--disable-slash-commands',...(c.model?['--model',c.model]:[]),'--effort','low',...(process.argv.includes('--schema')?['--json-schema',JSON.stringify(z.toJSONSchema(antigravityJobsSchema))]:[]),'--print-timeout','55s'],detached:true});
 const done=await r.wait({signal:AbortSignal.timeout(65000)}),output=await done.stdout();
 await writeFile('.data/antigravity-search-output.txt',output,{mode:0o600});
 const lines=output.split(/\r?\n/).filter(l=>l.trim()),shape=lines.map((l,i)=>{try{const e=JSON.parse(l);return {i,keys:Object.keys(e),event:e.event,result:e.result?{keys:Object.keys(e.result),status:e.result.status,responseType:typeof e.result.response,responseLength:e.result.response?.length,structuredType:typeof e.result.structured_output}:undefined};}catch{return {i,nonJson:true,length:l.length,prefix:l.slice(0,80)};}});
 let parsed;try{const p=parseAntigravitySearch(output);parsed={jobs:p.jobs.length,searchPerformed:p.searchPerformed};}catch(e){parsed={error:e instanceof Error?e.message:'Parsing failed'};}
 console.log(JSON.stringify({exitCode:done.exitCode,length:output.length,shape:shape.filter(s=>s.nonJson||s.event==='result'),parsed}));
}finally{await s.stop();}
