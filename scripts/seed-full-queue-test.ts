import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {operatorStore} from './operator-firestore';
import {and,eq} from '../server/storage-types';
const qa=JSON.parse(await readFile('.data/queue-integration-private.json','utf8'));
const {store}=await operatorStore();
try{
 const [row]=await store.select('workspaces',{where:eq('id',qa.workspaceId)});
 if(row.data.profile.email!=='queues-qa@example.test')throw Error('Synthetic baseline required');
 const w=structuredClone(row.data),userId=randomUUID(),workspaceId=`${userId}:live`;
 const original=w.jobs.find(j=>j.url.endsWith('/job/0'))!;
 original.id=randomUUID();original.company='Empregatos Queues QA';original.companyDomain=qa.origin;
 delete original.destinations;delete original.resolution;delete original.automation;
 w.jobs=[original];w.applications=[];w.runs=[];w.notices=[];w.submissionExclusions=[];
 w.routine={...w.routine,enabled:true,mode:'automatic',nextRun:null,lastRun:null,progress:undefined,researchBudget:undefined,discoveryContinuation:undefined,discoveryCheckpoints:undefined};
 w.sources=[{id:'company-board:queue-integration',type:'manual',company:'Empregatos Queues QA',board:`${qa.origin}/${qa.secret}/`,enabled:true,discovery:true,application:true,status:'Somente receptor controlado'}];
 await store.insert('users',{id:userId,email:`queues-discovery-${userId}@example.test`,name:'Pessoa Discovery QA Fictícia'});
 await store.insert('workspaces',{id:workspaceId,userId,data:w});
 const [file]=await store.select('resumeFiles',{where:and(eq('workspaceId',qa.workspaceId),eq('resumeId',w.resumes[0].id))});
 await store.insert('resumeFiles',{workspaceId,resumeId:w.resumes[0].id,extension:file.extension,ciphertext:file.ciphertext});
 qa.discoveryWorkspaceId=workspaceId;qa.discoveryUserId=userId;await writeFile('.data/queue-integration-private.json',JSON.stringify(qa));
 console.log(JSON.stringify({seeded:true,workspaceId,realAccountsModified:0}));
}finally{await store.close();}
