import {readFile,writeFile} from 'node:fs/promises';
import {operatorStore} from './operator-firestore';
import {eq} from '../server/storage-types';
const qa=JSON.parse(await readFile('.data/queue-integration-private.json','utf8'));
const {store}=await operatorStore();
try{
 const report=await store.transaction(async tx=>{
  const removed=[];
  for(const id of [...new Set([qa.userId,qa.discoveryUserId,'00cba8ba-310a-44a2-a2d0-b318f9ebf219'].filter(Boolean))]){
   const [u]=await tx.select('users',{where:eq('id',id)});if(!u)continue;
   if(!(u.email==='queues-qa@example.test'||u.email===`queues-discovery-${id}@example.test`))throw Error('Refusing non-synthetic account');
   await tx.delete('users',eq('id',id));removed.push(id);
  }
  const catalog=await tx.select('opportunityCatalog');let removedPublicFixtures=0;
  for(const row of catalog){if(row.job?.url?.startsWith(`${qa.origin}/${qa.secret}/`)){await tx.delete('opportunityCatalog',eq('key',row.key));removedPublicFixtures++;}}
  let removedSourceFixtures=0;
  for(const source of await tx.select('sourceCatalog')){
   if(source.board.startsWith(`${qa.origin}/${qa.secret}/`)&&source.jobs.every(j=>j.url.startsWith(`${qa.origin}/${qa.secret}/`))){await tx.delete('sourceCatalog',eq('key',source.key));removedSourceFixtures++;}
  }
  const expected=['00cba8ba-310a-44a2-a2d0-b318f9ebf219','4b736a47-e026-47f0-8af1-993c608ca93d'];
  const absent=await Promise.all(expected.map(async id=>(await tx.select('users',{where:eq('id',id)})).length===0));
  return {at:new Date().toISOString(),syntheticAccountsRemovedThisRun:removed.length,syntheticAccountsVerifiedAbsent:absent.filter(Boolean).length,removedPublicFixtures,removedSourceFixtures,realAccountsModified:0};
 });
 await writeFile('artifacts/vercel-queues-isolation-cleanup-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
