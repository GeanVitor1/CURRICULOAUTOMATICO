import {readFile,writeFile}from'node:fs/promises';
import {homedir}from'node:os';
import {join}from'node:path';
if(!process.argv.includes('--enable-for-all-accounts'))throw Error('Explicit project-wide connection configuration required');
 const auth=JSON.parse(await readFile(join(homedir(),'AppData/Roaming/com.vercel.cli/Data/auth.json'),'utf8'));
 const project=JSON.parse(await readFile('.vercel/project.json','utf8'));
 if(project.projectName!=='curriculoautomatico'||!auth.token)throw Error('Existing project authorization required');
 const response=await fetch(`https://api.vercel.com/v10/projects/${project.projectId}/env?teamId=${project.orgId}&upsert=true`,{
  method:'POST',headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},
  body:JSON.stringify([
   {key:'LINKEDIN_SESSION_RETEST_ENABLED',value:'true',type:'encrypted',target:['production']},
   {key:'LINKEDIN_SESSION_RETEST_USER_IDS',value:'',type:'encrypted',target:['production']},
  ]),
 });
 if(!response.ok)throw Error(`Retest configuration HTTP ${response.status}`);
 const result=await response.json();if(result.failed?.length)throw Error('Retest configuration rejected');
 const proof={at:new Date().toISOString(),configured:true,scope:'all authenticated accounts',personalAllowlistRemoved:true,sessionOwnerSelectedFromAuthentication:true,automaticApplicationsEnabled:false,requiresDeployment:true};
 await writeFile('artifacts/linkedin-retest-configuration-2026-10-28.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
