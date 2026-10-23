import {readFile,writeFile,mkdir} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";
import {OAuth2Client} from "google-auth-library";

// Creates only the two missing recovery indexes. Never deletes indexes/documents.
const project="curriculoautomatico-a15fa";
const config=JSON.parse(await readFile(join(homedir(),".config/configstore/firebase-tools.json"),"utf8"));
if(!config.tokens?.access_token||config.tokens.expires_at<=Date.now())throw new Error("Exige autenticação Firebase CLI válida.");
const client=new OAuth2Client();client.setCredentials({access_token:config.tokens.access_token});
const root=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`;
const result:{at:string;apply:boolean;edition?:string;indexes:unknown[];error?:unknown}={at:new Date().toISOString(),apply:process.argv.includes("--apply"),indexes:[]};
try {
  const metadata=await client.request<{databaseEdition:string;type:string}>({url:root});
  result.edition=metadata.data.databaseEdition;
  if(metadata.data.databaseEdition!=="STANDARD")throw new Error("Unexpected database edition");
  for(const collection of ["discovery_tasks","resolution_tasks"]) {
    const url=`${root}/collectionGroups/${collection}/indexes`;
    const response=await client.request<{indexes?:{name:string;state:string;fields:{fieldPath:string;order:string}[]}[]}>({url});
    const existing=response.data.indexes?.find(index=>index.name.includes(`/collectionGroups/${collection}/indexes/`) && index.fields.filter(f=>f.fieldPath!=="__name__").length===2&&
      index.fields[0]?.fieldPath==="status"&&index.fields[0].order==="ASCENDING"&&index.fields[1]?.fieldPath==="leaseUntil"&&index.fields[1].order==="ASCENDING");
    if(existing) {result.indexes.push({collection,state:existing.state,name:existing.name,created:false});continue;}
    if(!result.apply) {result.indexes.push({collection,state:"MISSING",created:false});continue;}
    const created=await client.request<{name:string}>({url,method:"POST",data:{queryScope:"COLLECTION",fields:[{fieldPath:"status",order:"ASCENDING"},{fieldPath:"leaseUntil",order:"ASCENDING"}]}});
    result.indexes.push({collection,state:"CREATE_REQUESTED",operation:created.data.name,created:true});
  }
}catch(error) {
  const e=error as {code?:string;response?:{status:number}};
  result.error={code:e.code,status:e.response?.status,type:error instanceof Error?error.name:"UnknownError"};
  process.exitCode=1;
}
await mkdir("artifacts",{recursive:true});
await writeFile("artifacts/automation-indexes-2026-10-23.json",JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
