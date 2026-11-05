import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {Sandbox} from '@vercel/sandbox';
import {operatorStore} from './operator-firestore';
import {eq} from '../server/storage-types';
import {portalSandboxName} from '../server/portal-cloud-policy';
const applicationId=process.argv.find(arg=>arg.startsWith('--application='))?.slice(14);
if(!applicationId||!/^[a-f0-9-]{36}$/.test(applicationId))throw Error('An application UUID is required');
const {store,operatorEmail}=await operatorStore();
let sandbox:Sandbox|undefined;
try{
 const [owner]=await store.select('users',{where:eq('email',operatorEmail),columns:['id','email']});
 if(!owner||owner.email!==operatorEmail)throw Error('Operator account required');
 const state=await store.submissionState(`${owner.id}:live`);
 if(state?.sending||(state?.verificationUntil||0)>Date.now())throw Error('Wait for the account worker to finish');
 const [row]=await store.select('workspaces',{where:eq('id',`${owner.id}:live`)});
 if(!row?.data.applications.some(a=>a.id===applicationId))throw Error('Application does not belong to operator');
 const env=parse(await readFile('.env.automation-current.local'));
 process.env.VERCEL_OIDC_TOKEN=env.VERCEL_OIDC_TOKEN;
 sandbox=await Sandbox.get({name:portalSandboxName(owner.id,'gupy')});
 const base=`/vercel/sandbox/portal-runtime/private/blocked-${applicationId}`;
 const journal=await sandbox.readFileToBuffer({path:`/vercel/sandbox/portal-runtime/private/attempt-${applicationId}.json`});
 if(journal){await writeFile(`.data/portal-journal-${applicationId}.json`,journal,{mode:0o600});console.log(JSON.stringify({applicationId,journal:JSON.parse(journal.toString())}));}
 const details=await sandbox.readFileToBuffer({path:base+'.json'});
 if(!details){console.log(JSON.stringify({applicationId,blockedScreenAvailable:false}));process.exitCode=journal?0:1;}
 else{
 await writeFile(`.data/portal-blocked-${applicationId}.json`,details,{mode:0o600});
 const screenshot=await sandbox.readFileToBuffer({path:base+'.png'});
 if(screenshot)await writeFile(`.data/portal-blocked-${applicationId}.png`,screenshot,{mode:0o600});
 console.log(JSON.stringify({applicationId,...JSON.parse(details.toString()),screenshotAvailable:!!screenshot}));
 }
}finally{await sandbox?.stop();await store.close();}
