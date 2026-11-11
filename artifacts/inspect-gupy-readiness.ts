import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client, GoogleAuth } from 'google-auth-library';
import { Firestore } from '@google-cloud/firestore';
import { firestoreStore } from '../server/storage-firestore';
import { eq } from '../server/storage-types';
const source = await readFile('C:/Users/geand/AppData/Local/npm-cache/_npx/ba4f1959e38407b5/node_modules/firebase-tools/lib/api.js','utf8');
const clientId = source.match(/const clientId[^\n]*FIREBASE_CLIENT_ID",\s*"([^"]+)"/)?.[1];
const clientSecret = source.match(/const clientSecret[^\n]*FIREBASE_CLIENT_SECRET",\s*"([^"]+)"/)?.[1];
if (!clientId || !clientSecret) throw Error('Firebase CLI configuration unavailable');
const config = JSON.parse(await readFile(join(homedir(),'.config/configstore/firebase-tools.json'),'utf8'));
const authClient = new OAuth2Client(clientId,clientSecret);
authClient.setCredentials({refresh_token:config.tokens.refresh_token});
const db = new Firestore({projectId:'curriculoautomatico-a15fa',preferRest:true,auth:new GoogleAuth({authClient,projectId:'curriculoautomatico-a15fa'})});
const store = firestoreStore(db);
try {
  const [user] = await store.select('users',{where:eq('email','geandk36@gmail.com'),limit:1});
  if (!user) throw Error('Requested user not found');
  const [row] = await store.select('workspaces',{where:eq('id',user.id+':live'),limit:1});
  if (!row) throw Error('Workspace unavailable');
  const w = row.data;
  const result = {
    at:new Date().toISOString(), routineEnabled:w.routine.enabled,
    profileConfirmed:w.profile.confirmed, candidateDetailsConfirmed:!!w.profile.candidateDetailsConfirmedAt,
    interviewCompleted:!!w.interview?.completed,
    selectedSites:w.interview?.answers.sites,
    resumes:w.resumes.map(r=>({id:r.id,name:r.name,approved:r.approved})),
    gupyConnection:w.infrastructure.portalConnections?.gupy || null,
    applications:w.applications.map(a=>({id:a.id,status:a.status,company:w.jobs.find(j=>j.id===a.jobId)?.company,title:w.jobs.find(j=>j.id===a.jobId)?.title,receipt:a.receipt})),
  };
  await writeFile('artifacts/gupy-real-account-readiness.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally { await db.terminate(); }
