import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Firestore} from '@google-cloud/firestore';
import {GoogleAuth,OAuth2Client} from 'google-auth-library';
import {firestoreStore} from '../server/storage-firestore';
export async function operatorStore(){
  const config=JSON.parse(await readFile(join(homedir(),'.config/configstore/firebase-tools.json'),'utf8'));
  if(!config.tokens?.access_token||config.tokens.expires_at<=Date.now())throw Error('Refresh existing Firebase CLI credential first');
  const auth=new OAuth2Client();auth.setCredentials({access_token:config.tokens.access_token});
  const projectId='curriculoautomatico-a15fa';
  return {store:firestoreStore(new Firestore({projectId,ignoreUndefinedProperties:true,auth:new GoogleAuth({projectId,authClient:auth})})),operatorEmail:config.user.email};
}
