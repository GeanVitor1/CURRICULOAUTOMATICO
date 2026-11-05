import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {createWorkspace} from '../server/workspace';
import type {Workspace,Job} from '../shared/types';
const mocks=vi.hoisted(()=>({load:vi.fn(),limit:vi.fn(),usage:vi.fn(),read:vi.fn(),mutate:vi.fn(),select:vi.fn()}));
vi.mock('../server/db',()=>({store:{select:mocks.select,submissionState:vi.fn(async()=>null)},mutateWorkspace:mocks.mutate,readWorkspace:mocks.read,dataDir:'.data/controlled-discovery-unit',readResumeArchive:vi.fn()}));
vi.mock('../server/intelligence',()=>({getIntelligence:vi.fn()}));
vi.mock('../server/gmail-connection',()=>({gmailConnection:vi.fn(async()=>({connected:false}))}));
vi.mock('../server/source-catalog',()=>({discoverCachedSource:mocks.load,discoverCachedPublicQuery:mocks.load}));
vi.mock('../server/billing',()=>({workspaceDailyLimit:mocks.limit,reserveApplication:vi.fn(),releasePausedReservations:vi.fn()}));
vi.mock('../server/portal-sessions',()=>({readyPortals:vi.fn(async()=>[]),connectedPortals:vi.fn(async()=>[]),sendNativeApplication:vi.fn()}));
import {discover,automaticSend} from '../server/operations';
import {SOURCE_POLICY_MESSAGE} from '../shared/job-source-policy';
import {researchAllowance,needsResearch} from '../server/resolution-queue';
let w:Workspace;
function job(index:number):Job{
 const url=`https://jobs.lever.co/employer/${index.toString(16).padStart(8,'0')}-0000-4000-8000-000000000000`;
 return {id:String(index),title:'Desenvolvedor .NET',company:'Empresa',url,source:'Lever',description:'Desenvolvimento de APIs REST e aplicações com C# .NET Angular e Git. Trabalho remoto no Brasil, contrato CLT.',location:'Brasil',modality:'Remoto',contract:'CLT',level:'Não informado',salaryMin:null,salaryMax:null,currency:'BRL',skills:['C#','.NET','Angular','Git'],requiredSkills:[],requiredYears:null,publishedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,origins:[{source:'lever',id:`employer:${index}`,url}],match:{} as Job['match']};
}
beforeEach(()=>{
 vi.clearAllMocks();
 for(const key of ['OFFICIAL_CAREERS_DISCOVERY_ENABLED','ABLER_EMAIL_DISCOVERY_ENABLED'])vi.stubEnv(key,'false');
 for(const key of ['DISCOVERY_ATS_BOARDS','DISCOVERY_QUICKIN_BOARDS','DISCOVERY_QUICKIN_ADDITIONAL_BOARDS','DISCOVERY_COMPANY_BOARDS'])vi.stubEnv(key,'[]');
 w=createWorkspace('Pessoa','qa@example.test');w.routine.enabled=true;w.routine.mode='automatic';w.routine.dailyLimit=5;w.routine.minScore=0;
 w.profile={...w.profile,confirmed:true,skills:['C#','.NET','Angular','Git'],experience:'Desenvolvimento de APIs REST e aplicações com C# .NET Angular.',years:3};
 w.filters={...w.filters,titles:['Desenvolvedor .NET'],locations:[],contracts:[],modalities:['Remoto'],dateKnownOnly:true};
 w.sources=['first','second'].map(board=>({id:board,type:'lever',board,company:board,enabled:true,discovery:true,application:false,status:''}));
 mocks.select.mockResolvedValue([{userId:'owner'}]);mocks.usage.mockResolvedValue(0);mocks.limit.mockResolvedValue(5);
 mocks.read.mockImplementation(async()=>w);
 mocks.mutate.mockImplementation(async(_id,fn)=>fn(w,{count:mocks.usage}));
 mocks.load.mockResolvedValue({jobs:Array.from({length:400},(_,i)=>job(i+1)),checkedAt:new Date().toISOString(),cached:false});
});
afterEach(()=>vi.unstubAllEnvs());
it('stops after a bounded first source and shares the daily cap with later runs',async()=>{
 const first=await discover('owner:live');
 expect(mocks.load).toHaveBeenCalledTimes(1);
 expect(first.discoveryBudget).toMatchObject({target:5,remaining:5,limit:15,examined:15});
 expect(w.jobs.length).toBeLessThanOrEqual(15);
 expect(w.routine.discoveryBudget?.examined).toBe(15);
 await discover('owner:live');
 expect(mocks.load).toHaveBeenCalledTimes(1);
 expect(w.runs[0].discoveryBudget?.limit).toBe(0);
});
it('does no external discovery after the account quota has been used',async()=>{
 mocks.usage.mockResolvedValue(5);
 const result=await discover('owner:live');
 expect(mocks.load).not.toHaveBeenCalled();expect(result.discoveryBudget).toMatchObject({remaining:0,limit:0,examined:0});
});
it('does not query a removed board or retain its records from an older shared cache',async()=>{
 w.sources.unshift({id:'quickin-board:globalti',type:'manual',board:'globalti',company:'Global TI',enabled:true,discovery:true,application:true,status:''});
 mocks.load.mockResolvedValue({jobs:[{...job(1),company:'Global TI'},job(2)],checkedAt:new Date().toISOString(),cached:true});
 await discover('owner:live');
 expect(w.sources[0].enabled).toBe(false);
 expect(w.jobs.some(j=>j.company==='Global TI')).toBe(false);
 expect(mocks.load.mock.calls.every(([source])=>source.board!=='globalti')).toBe(true);
});
it('uses an already compatible pool with a working channel before querying another source',async()=>{
 vi.stubEnv('ATS_PUBLIC_FORM_PLATFORMS','lever');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','controlled-fixture-only');
 w.jobs=Array.from({length:5},(_,i)=>job(i+1));
 for(const j of w.jobs)j.destinations=[{id:j.id,url:j.url,publicationUrl:j.url,company:j.company,platform:'lever',state:'verified',formFound:true,method:'browser',verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),confidence:100,evidence:['Publicação verificada']}];
 await discover('owner:live');expect(mocks.load).not.toHaveBeenCalled();
});
it('caps actual destination research at fifteen and preserves the remaining pool',()=>{
 w.jobs=Array.from({length:25},(_,i)=>job(i+1));
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 w.routine.researchBudget={day,used:14};
 expect(researchAllowance(w,5)).toBe(1);
 w.routine.researchBudget.used=15;
 expect(researchAllowance(w,5)).toBe(0);
 expect(w.jobs).toHaveLength(25);expect(needsResearch(w.jobs[0],w)).toBe(true);
});
it('does not let an old larger plan or a removed job expand destination research',()=>{
 w.routine.dailyLimit=100;w.jobs=Array.from({length:25},(_,i)=>job(i+1));
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 w.routine.discoveryBudget={day,target:100,examined:0};w.routine.researchBudget={day,used:15};
 expect(researchAllowance(w,5)).toBe(0);
 expect(needsResearch({...job(99),company:'Global TI'},w)).toBe(false);
});
it('blocks an old queued application to the removed employer before any transmission and preserves its history',async()=>{
 vi.stubEnv('ATS_PUBLIC_FORM_PLATFORMS','quickin');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','controlled-fixture-only');
 w.jobs=[{...job(99),company:'Global TI',url:'https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0'}];
 w.applications=[{id:'old',jobId:'99',status:'Aguardando aprovação',history:[{at:new Date().toISOString(),actor:'Sistema',message:'Candidatura preparada.'}],receipt:null} as any];
 const before=JSON.stringify(w.applications),fetcher=vi.fn();
 await expect(automaticSend('owner:live','old',fetcher)).rejects.toThrow(SOURCE_POLICY_MESSAGE);
 expect(fetcher).not.toHaveBeenCalled();expect(JSON.stringify(w.applications)).toBe(before);
});
