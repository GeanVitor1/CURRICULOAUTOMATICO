import {it,expect} from 'vitest';
import {chromium} from 'playwright';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

it('real Chrome detects a completed newer local release and executes runtime.reload without a ZIP',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'empregatos-local-update-')),extension=join(directory,'extension');
 await cp(resolve('browser-extension/gupy-session'),extension,{recursive:true});
 const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
 // Match an unpacked development installation, inside this disposable profile.
 await mkdir(join(directory,'profile','Default'),{recursive:true});
 await writeFile(join(directory,'profile','Default','Preferences'),JSON.stringify({extensions:{ui:{developer_mode:true}}}));
 const context=await chromium.launchPersistentContext(join(directory,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await expect.poll(()=>worker.evaluate(async()=>!!await(globalThis as any).chrome.alarms.get('empregatos-local-update')),{timeout:5000}).toBe(true);
  await worker.evaluate('initializeUpdater()');
  const parts=manifest.version.split('.').map(Number);parts[parts.length-1]=(parts.at(-1)||0)+1;
  const next=parts.join('.');
  await writeFile(join(extension,'manifest.json'),JSON.stringify({...manifest,version:next}));
  await writeFile(join(extension,'release.json'),JSON.stringify({version:next,channel:'development'}));
  const disk=await worker.evaluate(async()=>{
   const api=(globalThis as any).chrome;
   return{running:api.runtime.getManifest().version,views:await api.runtime.getContexts({contextTypes:['POPUP','TAB']}),release:await(await fetch(api.runtime.getURL('release.json'),{cache:'no-store'})).json(),manifest:await(await fetch(api.runtime.getURL('manifest.json'),{cache:'no-store'})).json()};
  });
  expect(disk.running).toBe(manifest.version);expect(disk.views).toEqual([]);
  expect(disk.release.version).toBe(next);expect(disk.manifest.version).toBe(next);
  // Exercise the alarm's actual handler without depending on Chrome's alarm
  // scheduling minimum or spending a minute waiting during this test.
  const result=await worker.evaluate('checkLocalUpdate()').catch(error=>{if(!/closed|destroyed|terminated/i.test(String(error)))throw error;return{status:'reloading'};});
  expect(result).toMatchObject({status:'reloading'});
  // Headless/CDP-loaded extensions unload on runtime.reload without restarting
  // automatically. Assert the real unload here; VM cases cover alarm wiring,
  // deferral and scheduling, while normal Chrome performs the subsequent load.
  await expect.poll(()=>context.serviceWorkers().includes(worker),{timeout:5000}).toBe(false);
  expect(context.pages().some(page=>/^https:\/\/(?:www\.)?(?:linkedin|gupy|glassdoor|infojobs)\./.test(page.url()))).toBe(false);
 }finally{
  await context.close();
  if(directory.startsWith(join(tmpdir(),'empregatos-local-update-')))await rm(directory,{recursive:true,force:true});
 }
},30000);
