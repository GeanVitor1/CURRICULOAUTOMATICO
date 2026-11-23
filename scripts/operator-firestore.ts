import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Firestore} from '@google-cloud/firestore';
import {GoogleAuth,OAuth2Client} from 'google-auth-library';
import { firebaseCliClient } from "./firebase-cli-auth";
import {firestoreStore} from '../server/storage-firestore';
export async function operatorStore(){
  const config=JSON.parse(await readFile(join(homedir(),'.config/configstore/firebase-tools.json'),'utf8'));
  if(!config.tokens?.refresh_token)throw Error('Refresh existing Firebase CLI credential first');
  const auth=firebaseCliClient();
  const projectId='curriculoautomatico-a15fa';
  return {store:firestoreStore(new Firestore({projectId,preferRest:true,ignoreUndefinedProperties:true,auth:new GoogleAuth({projectId,authClient:auth})})),operatorEmail:config.user.email};
}
