import {readFile,writeFile} from 'node:fs/promises';
import {readPublicPage} from '../server/public-web';
const inspection=JSON.parse(await readFile('artifacts/quickin-globalti-form-inspection-2026-10-23.json','utf8'))[0];
const urls=[...new Set<string>(inspection.requests.filter((u:string)=>u.endsWith('.js')))];
const results=[];
for(const url of urls){const r=await readPublicPage(url);const matches=[...r.html.matchAll(/.{0,260}(?:on_media_submit|onMediaSubmit|onSubmit|\.success|candidatura.{0,50}|media\/multipart|modelValue|media_id|application_sent).{0,450}/gi)].map(m=>m[0]);if(matches.length)results.push({url,matches});}
await writeFile('.data/quickin-client-inspection.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
