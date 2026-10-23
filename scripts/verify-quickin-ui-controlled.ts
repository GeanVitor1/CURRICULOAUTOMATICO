import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {executeQuickinForm} from '../server/quickin-form';
import {guardAtsPage,atsHostResolverRules} from '../server/ats-network';
import {defaultProfile} from '../shared/types';
import {confirmCandidateDetails} from '../tests/fixtures/candidate-details';
import {resumePdf} from '../tests/pdf-fixture';
const url='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0/apply';
const rejectUpload=process.argv.includes('--reject-upload'),rejectApplication=process.argv.includes('--reject-application');
const schema=JSON.parse(await readFile('artifacts/quickin-globalti-form-schema-2026-10-23.json','utf8'));
const profile={...structuredClone(defaultProfile),confirmed:true,name:'Pessoa QA Fictícia',email:'qa@example.test'};
confirmCandidateDetails({profile} as any);
profile.approvedAnswers=[{id:'qa-only',question:schema.at(-1).label,aliases:[],value:'52998224725',confirmedAt:new Date().toISOString(),destinationUrl:url}];
const browser=await chromium.launch({headless:true,args:[`--host-resolver-rules=${await atsHostResolverRules(url)}`]});
try{
 const context=await browser.newContext({serviceWorkers:'block'});await guardAtsPage(context,url);
 const intercepted:{method:string;path:string;bytes:number;fieldNames?:string[];syntheticIdentity?:boolean}[]=[];
 // Every write is intercepted before reaching the publisher. This validates
 // their current UI with fictional data, not a real employer application.
 await context.route('**/*',async route=>{
  const request=route.request();if(['GET','HEAD','OPTIONS'].includes(request.method()))return route.fallback();
  const target=new URL(request.url()),body=request.postDataBuffer();
  const record={method:request.method(),path:target.origin+target.pathname,bytes:body?.length||0};
  if(target.origin==='https://api.quickin.io'&&target.pathname==='/public/692a0e88fa9dcb00134dc379/media/multipart'){
   intercepted.push(record);return route.fulfill({status:rejectUpload?413:200,contentType:'application/json',body:JSON.stringify(rejectUpload?{error:'Controlled rejection'}:{_id:'qa-media',name:'qa.pdf',extension:'pdf',title:'qa.pdf'})});
  }
  if(target.origin==='https://api.quickin.io'&&target.pathname==='/public/692a0e88fa9dcb00134dc379/apply'){
   const data=JSON.parse(body?.toString()||'{}');intercepted.push({...record,fieldNames:Object.keys(data),syntheticIdentity:data.email==='qa@example.test'&&data.name==='Pessoa QA Fictícia'});
   return route.fulfill({status:rejectApplication?400:200,contentType:'application/json',body:rejectApplication?JSON.stringify({name:'ValidationError',errors:{email:{message:'PRIVATE_SENTINEL'}}}):'{}'});
  }
  intercepted.push(record);return route.abort();
 });
 const page=await context.newPage(),failedRequests:string[]=[];
 page.on('requestfailed',r=>{if(r.method()==='GET')failedRequests.push(r.url());});
 const result=await executeQuickinForm(page,{applicationId:'qa-only',job:{url:url.slice(0,-6),company:'Global TI',title:'Desenvolvedor Full Stack - PL/SR'},destination:{id:'qa',url,publicationUrl:url.slice(0,-6),company:'Global TI',platform:'quickin',state:'verified',formFound:true,method:'browser',confidence:100,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidence:[]},profile,resume:{name:'qa.pdf',file:{name:'qa.pdf',mimeType:'application/pdf',data:resumePdf().toString('base64')}}});
 const report={at:new Date().toISOString(),controlled:true,transport:'all writes intercepted and fulfilled locally; no employer submission',realCandidateDataUsed:false,result,intercepted,failedRequests,visibleText:(await page.locator('body').innerText()).slice(-2400)};
 const suffix=rejectUpload?'-upload-rejection':rejectApplication?'-application-rejection':'';
 // Rejection fixture text can include provider-echoed fictitious values;
 // only the sanitized executor result is retained in those fixtures.
 if(suffix)report.visibleText='omitted for rejection diagnostic privacy';
 await writeFile(`artifacts/quickin-ui-controlled${suffix}-2026-10-23.json`,JSON.stringify(report,null,2));
 if(rejectUpload&&(result.status!=='action_required'||intercepted.length!==1||!result.retryable))throw Error('Upload rejection must stop before application POST');
 if(rejectApplication&&(result.status!=='unknown'||result.retryable||!result.message.includes('HTTP 400')||JSON.stringify(result).includes('PRIVATE_SENTINEL')))throw Error('Application rejection must remain uncertain and redact provider values');
 if(!suffix&&result.status!=='sent')throw Error('Controlled happy path failed');
 console.log(JSON.stringify(report));
}finally{await browser.close();}
