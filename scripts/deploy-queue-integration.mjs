import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const qa=JSON.parse(await readFile('.data/queue-integration-private.json','utf8'));
if(!qa.applicationId||!new URL(qa.origin).hostname.endsWith('.vercel.run'))throw Error('Seed isolated integration first');
const manifest=JSON.parse(await readFile('.vercel/project.json','utf8'));
const cli='C:/Users/geand/AppData/Local/npm-cache/_npx';
// npx uses existing CLI authentication; secrets are inherited, never placed in
// command arguments or persisted in the deployment transcript.
const args=['--yes','vercel','deploy','--prod','--skip-domain','--yes','--scope',manifest.orgId];
for(const key of ['ENCRYPTION_KEY','COMPANY_FORM_AUTHORIZED','QUEUE_INTEGRATION_WORKSPACE','QUEUE_INTEGRATION_APPLICATION','QUEUE_INTEGRATION_KEY','QUEUE_INTEGRATION_RECEIVER','QUEUE_INTEGRATION_DISCOVERY_WORKSPACE','OFFICIAL_CAREERS_DISCOVERY_ENABLED','ABLER_EMAIL_DISCOVERY_ENABLED','DISCOVERY_COMPANY_BOARDS','DISCOVERY_ATS_BOARDS'])args.push('--env',key);
const env={...process.env,ENCRYPTION_KEY:qa.encryptionKey,COMPANY_FORM_AUTHORIZED:new URL(qa.origin).hostname,QUEUE_INTEGRATION_WORKSPACE:qa.workspaceId,QUEUE_INTEGRATION_APPLICATION:qa.applicationId,QUEUE_INTEGRATION_KEY:qa.secret,QUEUE_INTEGRATION_RECEIVER:qa.origin,QUEUE_INTEGRATION_DISCOVERY_WORKSPACE:qa.discoveryWorkspaceId,OFFICIAL_CAREERS_DISCOVERY_ENABLED:'false',ABLER_EMAIL_DISCOVERY_ENABLED:'false',DISCOVERY_COMPANY_BOARDS:'[]',DISCOVERY_ATS_BOARDS:'[]'};
const command=spawn('npx.cmd',args,{env,shell:true,windowsHide:true});
let output='';command.stdout.on('data',v=>{output+=v;process.stdout.write(v);});command.stderr.on('data',v=>{output+=v;process.stderr.write(v);});
const code=await new Promise(resolve=>command.on('exit',resolve));
await writeFile('.data/queue-integration-deploy.txt',output);process.exitCode=code||0;
