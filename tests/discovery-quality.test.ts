import {describe,it,expect,vi,afterEach} from 'vitest';
import {createWorkspace} from '../server/workspace';
import {screenDiscovery,learnOfficialBoards,learnedDiscoverySources,sourceProductivity,sourceDue} from '../server/discovery-quality';
import {quickinMandatorySkills} from '../server/quickin-board';
import {analyze} from '../server/engine';
import {defaultProfile,type Job,type Source} from '../shared/types';
const source:Source={id:'catalog:lever:public',type:'lever',board:'public',company:'Public',enabled:true,discovery:true,application:false,status:''};
function workspace(){const w=createWorkspace('QA','qa@example.test');w.profile={...structuredClone(defaultProfile),confirmed:true,skills:['C#','.NET','Angular','Git'],experience:'Desenvolvimento de APIs REST e aplicações com C# .NET Angular.',years:3};w.filters={...w.filters,titles:['Desenvolvedor .NET'],locations:['Ilhéus, BA'],modalities:['Remoto'],contracts:[],ageDays:14,dateKnownOnly:true,salaryOnly:false,skills:[],levels:[],requiredSkills:[]};w.routine.minScore=70;return w;}
function job(changes:Partial<Job>={}):Job{return {id:'j1',title:'Desenvolvedor .NET',company:'Public',url:'https://jobs.lever.co/public/12345678-1234-1234-1234-123456789012',source:'Lever',description:'Desenvolvimento de aplicações .NET com C#, Angular e Git, integração de sistemas e manutenção de APIs.',location:'Brasil',modality:'Remoto',contract:'CLT',level:'Não informado',salaryMin:null,salaryMax:null,currency:'BRL',skills:['C#','.NET','Angular','Git'],requiredSkills:[],requiredYears:null,publishedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,origins:[{source:'lever',id:'public:1',url:'https://jobs.lever.co/public/12345678-1234-1234-1234-123456789012'}],match:{} as Job['match'],...changes};}
afterEach(()=>vi.useRealTimers());
describe('Discovery aimed at submit-ready opportunities',()=>{
 it('requires a positive exact-destination declaration for affirmative PcD vacancies without inferring it from accessibility or open-to-all notices',()=>{
  const w=workspace(),j=job({title:'Desenvolvedor .NET - vaga para pessoas PCD'});
  expect(analyze(j,w.profile,w.filters).blockers.join()).toContain('Elegibilidade obrigatória');
  w.profile.approvedAnswers=[{id:'scoped',question:'Você é PcD?',value:'Sim',aliases:[],confirmedAt:new Date().toISOString(),destinationUrl:j.url+'/different'}];
  expect(analyze(j,w.profile,w.filters).blockers.join()).toContain('Elegibilidade obrigatória');
  w.profile.approvedAnswers[0].destinationUrl=j.url;
  expect(analyze(j,w.profile,w.filters).blockers.join()).not.toContain('Elegibilidade obrigatória');
  w.profile.approvedAnswers=[];j.title='Desenvolvedor .NET';j.description+=' Todas as vagas são abertas a pessoas com deficiência.';
  expect(analyze(j,w.profile,w.filters).blockers.join()).not.toContain('Elegibilidade obrigatória');
 });
 it('does not assert unconfirmed seniority for an automatic application',()=>{
  const w=workspace();w.profile.level='Não especificado';
  expect(screenDiscovery(w,source,[job({level:'Sênior'})],new Date().toISOString()).productivity.compatible).toBe(0);
 });
 it('does not equate a generic Technology title or negated coding skills with a software role',()=>{
  const w=workspace(),j=job({title:'Form Builder - Technology',description:'The tool does not require HTML, CSS, SQL, or APIs. Build custom forms with a no-code tool.'});
  expect(screenDiscovery(w,source,[j],new Date().toISOString()).jobs).toEqual([]);
 });
 it('pauses a zero-yield board until the next normal window and re-evaluates a changed preference',()=>{
  const w=workspace();w.routine.discoveryProductivity={[source.id]:screenDiscovery(w,source,[],new Date().toISOString()).productivity};
  expect(sourceDue(w,source)).toBe(false);w.filters.ageDays=7;expect(sourceDue(w,source)).toBe(true);
 });
 it('excludes known old/foreign/hybrid postings without modifying shared records or filters',()=>{
  const w=workspace(),before=JSON.stringify(w.filters),jobs=[job({publishedAt:'2020-01-01'}),job({id:'j2',location:'United States'}),job({id:'j3',modality:'Híbrido'})],copy=JSON.stringify(jobs);
  const r=screenDiscovery(w,source,jobs,new Date().toISOString());expect(r.jobs).toEqual([]);expect(r.productivity.examined).toBe(3);expect(r.productivity.retained).toBe(0);expect(JSON.stringify(jobs)).toBe(copy);expect(JSON.stringify(w.filters)).toBe(before);
 });
 it('preserves incomplete fields for public research without declaring the job compatible',()=>{
  const w=workspace(),r=screenDiscovery(w,source,[job({publishedAt:null,modality:'Não informado',location:'Não informado'})],new Date().toISOString());expect(r.jobs).toHaveLength(1);expect(r.productivity.compatible).toBe(0);expect(r.productivity.channelVerified).toBe(0);
 });
 it('skips the equivalent uncertain application and leaves its attempt untouched',()=>{
  const w=workspace();w.jobs=[job()];w.applications=[{jobId:'j1',status:'Resultado desconhecido',attempts:[{id:'uncertain',outcome:'unknown'}]} as any];const prior=JSON.stringify(w.applications);
  expect(screenDiscovery(w,source,[job({id:'new-id'})],new Date().toISOString()).jobs).toEqual([]);expect(JSON.stringify(w.applications)).toBe(prior);
 });
 it('extracts explicit mandatory technologies, excluding optional and negated experience',()=>{
  expect(quickinMandatorySkills('<h2>Requisitos Obrigatórios</h2><p>Experiência sólida com .NET e Next.js.</p><p>Experiência com AWS e Dynamo db.</p><p>Não é necessário Python.</p><h3>Diferenciais</h3><p>Angular e Node.js</p>')).toEqual(expect.arrayContaining(['.NET','Next.js','AWS','DynamoDB']));
  expect(quickinMandatorySkills('<h2>Requisitos Obrigatórios</h2><p>.NET</p><h3>Diferenciais</h3><p>Angular</p>')).not.toContain('Angular');expect(quickinMandatorySkills('<p>Conhecimentos em .NET</p>')).toEqual([]);
 });
 it('does not retain jobs missing mandatory AWS/Next experience',()=>{const w=workspace(),r=screenDiscovery(w,source,[job({requiredSkills:['Next.js','AWS']})],new Date().toISOString());expect(r.jobs).toHaveLength(0);expect(r.productivity.compatible).toBe(0);expect(Object.values(r.productivity.excluded).reduce((a,b)=>a+b,0)).toBe(1);});
 it('learns a verified public board without granting submission or fabricating a receipt',()=>{
  const w=workspace();learnOfficialBoards(w,[job()],new Date().toISOString());expect(learnedDiscoverySources(w)[0]).toMatchObject({board:'public',type:'lever',application:false});
  const r=screenDiscovery(w,source,[job()],new Date().toISOString());w.jobs=r.jobs;w.routine.discoveryProductivity={[source.id]:r.productivity};expect(sourceProductivity(w)[0]).toMatchObject({examined:1,retained:1,channelVerified:0,prepared:0,transmissionsStarted:0,confirmed:0});
 });
});
