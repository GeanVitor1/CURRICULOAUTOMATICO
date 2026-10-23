import {readFile} from 'node:fs/promises';
import {createCipheriv,randomBytes} from 'node:crypto';
import {operatorStore} from './operator-firestore';
import {resumePdf} from '../tests/pdf-fixture';
import {TARGETS_VERSION} from '../server/resume-targets';
import {and,eq} from '../server/storage-types';
const q=JSON.parse(await readFile('.data/queue-integration-private.json','utf8')),{store}=await operatorStore();
try{
 const [row]=await store.select('workspaces',{where:eq('id',q.workspaceId)});
 if(row.userId!==q.userId||row.data.profile.email!=='queues-qa@example.test'||row.data.applications.some(a=>a.attempts?.length||a.receipt))throw Error('Fixture is not an untouched synthetic workspace');
 const w=row.data,r=w.resumes[0],iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(q.encryptionKey,'base64'),iv);
 const bytes=Buffer.concat([cipher.update(resumePdf().toString('base64'),'utf8'),cipher.final()]);
 const ciphertext=[iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');
 await store.insert('resumeFiles',{workspaceId:q.workspaceId,resumeId:r.id,extension:'.pdf',ciphertext},{conflict:{extension:'.pdf',ciphertext}});
 delete r.storedFile;r.originalFileAvailable=true;r.targetsVersion=TARGETS_VERSION;r.targetsConfirmed=true;r.targetTitles=['Desenvolvedor React'];
 w.filters.titles=['Desenvolvedor React'];
 await store.update('workspaces',{data:w},eq('id',q.workspaceId));
 console.log(JSON.stringify({syntheticFixtureRepaired:true,realAccountsModified:0}));
}finally{await store.close();}
