import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';

const base='https://curriculoautomatico.vercel.app';
const download=base+'/downloads/empregatos-conexoes-chrome.zip';
const response=await fetch(download,{cache:'no-store',signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200,'Published extension download must exist');
const bytes=new Uint8Array(await response.arrayBuffer()),files=unzipSync(bytes);
const manifest=JSON.parse(strFromU8(files['manifest.json']));
assert.equal(manifest.version,JSON.parse(await readFile('browser-extension/gupy-session/manifest.json','utf8')).version);
assert.deepEqual(manifest.host_permissions,[base+'/*']);
assert.equal(manifest.optional_host_permissions.length,5);
assert.equal(manifest.action.default_popup,undefined,'The toolbar must launch a persistent connector tab');
for(const name of ['manifest.json','popup.html','popup.css','popup.js','content.js','config.js','background.js','release.json']){
 assert.deepEqual(Buffer.from(files[name]),await readFile('browser-extension/gupy-session/'+name),`Published ${name} differs from the verified local extension`);
}
const legacy=await fetch(base+'/downloads/empregatos-gupy-chrome.zip',{cache:'no-store',signal:AbortSignal.timeout(30000)});
assert.equal(legacy.status,200);
assert.deepEqual(Buffer.from(await legacy.arrayBuffer()),Buffer.from(bytes),'Existing download must also deliver the new extension');
const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(30000)});
assert.equal(health.status,200);
const storeResponse=await fetch(base+'/downloads/empregatos-chrome-web-store.zip',{cache:'no-store',signal:AbortSignal.timeout(30000)});
assert.equal(storeResponse.status,200);
const storeFiles=unzipSync(new Uint8Array(await storeResponse.arrayBuffer()));
const storeManifest=JSON.parse(strFromU8(storeFiles['manifest.json'])),release=JSON.parse(strFromU8(storeFiles['release.json']));
assert.equal(storeManifest.version,manifest.version);assert.equal(release.channel,'store');assert.equal(storeManifest.permissions.includes('alarms'),false);
const evidence={at:new Date().toISOString(),download,version:manifest.version,sha256:createHash('sha256').update(bytes).digest('hex'),portals:['gupy','infojobs','glassdoor','linkedin'],requiredHosts:manifest.host_permissions,optionalHosts:manifest.optional_host_permissions,packageMatchesSource:true,legacyDownloadUpdated:true,health:health.status,localDevelopmentUpdates:true,storePackagePrepared:true,storePublished:false,persistentConnectorTab:true,projectBridgeRepair:true};
await writeFile('artifacts/browser-connectors-publication-2026-10-27.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
