import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {homedir} from 'node:os';
import {Sandbox} from '@vercel/sandbox';import dotenv from 'dotenv';
import {operatorStore} from './operator-firestore';import {and,eq} from '../server/storage-types';
import {configuredQuickinBoards,discoverQuickinBoard} from '../server/quickin-board';
const {store,operatorEmail}=await operatorStore();
let sandbox:Awaited<ReturnType<typeof Sandbox.create>>|undefined;
try{
 const [user]=await store.select('users',{where:eq('email',operatorEmail)});
 const [row]=await store.select('workspaces',{where:and(eq('userId',user.id),eq('demo',false))});
 process.env.DISCOVERY_QUICKIN_BOARDS='[{"company":"Global TI","board":"globalti"}]';
 const discovery=await discoverQuickinBoard(configuredQuickinBoards()[0],row.data);
 const job=discovery.jobs.find(j=>j.url==='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0');
 if(!job)throw Error('Eligible official posting was not found by the implemented discovery source');
 const auth=JSON.parse(await readFile(join(homedir(),'AppData/Roaming/com.vercel.cli/Data/auth.json'),'utf8')),p=JSON.parse(await readFile('.vercel/project.json','utf8')),cloud=dotenv.parse(await readFile('.env.portal-cloud.local'));
 sandbox=await Sandbox.create({token:auth.token,teamId:p.orgId,projectId:p.projectId,source:{type:'snapshot',snapshotId:cloud.PORTAL_CLOUD_SNAPSHOT_ID},persistent:false,resources:{vcpus:1},timeout:120000,networkPolicy:{allow:{'jobs.quickin.io':[],'api.quickin.io':[]},subnets:{deny:['10.0.0.0/8','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.168.0.0/16']}}});
 const root='/vercel/sandbox/portal-runtime/ats-execution';await sandbox.mkDir(root);
 const input={applicationId:'readonly-preflight',job:{title:job.title,company:job.company,url:job.destinations![0].url},destination:job.destinations![0],profile:row.data.profile,resume:{name:'No file loaded for read-only inspection'},inspectOnly:true};
 await sandbox.writeFiles([{path:`${root}/runner.mjs`,content:await readFile('dist-server/ats-browser-runner.mjs')},{path:`${root}/input.json`,content:Buffer.from(JSON.stringify(input)),mode:0o600}]);
 const run=await sandbox.runCommand({cmd:'node',args:[`${root}/runner.mjs`],cwd:root});
 if(run.exitCode!==0){console.log((await run.stderr()).slice(0,1600));throw Error('Read-only cloud preflight failed');}
 const result=JSON.parse((await sandbox.readFileToBuffer({path:`${root}/result.json`}))!.toString());
 const report={at:new Date().toISOString(),readOnly:true,fileLoaded:false,candidateFieldsFilled:false,score:job.match.score,discoveredCompatible:discovery.jobs.length,sourceMethod:discovery.method,result};
 await writeFile('artifacts/quickin-cloud-preflight-2026-10-23.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await sandbox?.stop().catch(()=>{});await store.close();}
