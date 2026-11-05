import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PortalBrowserService} from '../server/portal-browser-service';
import type {PortalApplication} from '../server/portal-application';
const mocks=vi.hoisted(()=>({inspect:vi.fn()}));
vi.mock('../server/gupy-draft-verification',()=>({inspectGupyDraft:mocks.inspect}));
const applicationId='11111111-1111-4111-8111-111111111111';
it.each(['verified','not_verified','other_resume'])('changes an unknown private journal only after matching portal proof: %s',async scenario=>{
 const dir=await mkdtemp(join(tmpdir(),'gupy-proof-test-'));
 const path=join(dir,`attempt-${applicationId}.json`),original=JSON.stringify({result:{status:'unknown',message:'Connection interrupted'}});
 await writeFile(path,original);
 const service=new PortalBrowserService('gupy',dir);
 const close=vi.fn(async()=>{}),save=vi.spyOn(service as any,'save').mockResolvedValue(undefined);
 vi.spyOn(service as any,'load').mockResolvedValue({profileResumeId:scenario==='other_resume'?'other':'resume',state:{}});
 vi.spyOn(service as any,'createContext').mockResolvedValue({newPage:async()=>({}),storageState:async()=>({cookies:[],origins:[]}),close});
 const proof={nativeApplicationId:'777',resumeId:'resume',destinationUrl:'https://fixture.gupy.io/jobs/12345',continuationUrl:'https://fixture.gupy.io/candidates/applications/777',observedAt:new Date().toISOString()};
 mocks.inspect.mockReset().mockResolvedValue(scenario==='verified'?proof:null);
 try{
  const result=await service.verifyDraft('resume',{applicationId,job:{title:'Analista administrativo',company:'Fixture',url:proof.destinationUrl},profile:{},resume:{name:'approved'}} as PortalApplication);
  const journal=JSON.parse(await readFile(path,'utf8'));
  if(scenario==='verified'){
   expect(result).toEqual(proof);expect(journal.priorResult.status).toBe('unknown');
   expect(journal.result).toMatchObject({status:'action_required',retryable:true,continuationUrl:proof.continuationUrl});
   expect(save).toHaveBeenCalledOnce();
  }else{
   expect(result).toBeNull();expect(await readFile(path,'utf8')).toBe(original);expect(save).not.toHaveBeenCalled();
   if(scenario==='other_resume')expect(mocks.inspect).not.toHaveBeenCalled();
  }
 }finally{
  vi.restoreAllMocks();
  if(dir.startsWith(join(tmpdir(),'gupy-proof-test-')))await rm(dir,{recursive:true,force:true});
 }
});
