import{afterEach,expect,it,vi}from'vitest';
import{analyze,correctJobEvidence,matchesObjectiveFilters,eligibleForDestinationResearch}from'../server/engine';
import{mandatoryTechnicalSkills,mandatorySkillGroups}from'../server/mandatory-requirements';
import{searchWorkspaces,searchPlace}from'../server/search-scopes';
import{screenDiscovery}from'../server/discovery-quality';
import{discoverPublicPortal,clearPublicPortalCache}from'../server/public-portal-discovery';
import{withDiscoveryCandidates}from'../server/discovery-limits';
import{createWorkspace}from'../server/workspace';
import type{Job,Source}from'../shared/types';
const source:Source={id:'gupy-fixture',type:'portal',company:'Gupy',board:'gupy',enabled:true,discovery:true,application:false,status:''};
function fixture(){const w=createWorkspace('Pessoa QA','qa@example.test');w.profile={...w.profile,confirmed:true,skills:['C#','.NET','SQL Server'],headline:'Desenvolvedor .NET',level:'Pleno',years:3};w.filters={...w.filters,titles:['Desenvolvedor .NET'],modalities:['Remoto'],locations:['Ilhéus, BA'],remoteAnywhere:true};w.routine.minScore=70;return w;}
function job(overrides:Partial<Job>={}):Job{return{id:'qa',title:'Desenvolvedor .NET',company:'Empresa QA',url:'https://qa.gupy.io/jobs/1234567',description:'Requisitos e qualificações\nC#, .NET, SQL Server, AWS, React, Angular, Kubernetes, Azure.\nDiferenciais\nDocker e Python.',skills:['C#','.NET','SQL Server','AWS','React','Angular','Kubernetes','Azure'],requiredSkills:['AWS','React'],requiredYears:null,source:'Gupy',location:'São Paulo, SP, Brasil',modality:'Remoto',level:'Pleno',contract:'CLT',salaryMin:null,salaryMax:null,currency:'BRL',publishedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),origins:[{source:'portal',url:'https://qa.gupy.io/jobs/1234567',id:'1'}],saved:false,discarded:false,demo:false,match:{}as Job['match'],...overrides};}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();clearPublicPortalCache();});
it('allows a candidate with part of a non-mandatory skills list without a legacy numerical cutoff',()=>{
 const w=fixture(),j=job(),m=analyze(j,w.profile,w.filters);
 expect(correctJobEvidence(j).requiredSkills).toEqual([]);expect(m.blockers).toEqual([]);expect(m.missingSkills).toContain('AWS');expect(m.criteria).toEqual([]);
 expect(matchesObjectiveFilters(j,w.profile,w.filters)).toBe(true);
 expect(screenDiscovery(w,source,[j],new Date().toISOString()).productivity.compatible).toBe(1);
});
it('distinguishes optional lists, explicit mandatory clauses and accepted alternatives',()=>{
 expect(mandatoryTechnicalSkills('<h2>Requisitos e qualificações</h2><ul><li>Java, AWS e React</li></ul>')).toEqual([]);
 expect(mandatoryTechnicalSkills('<p>Obrigatório C# e .NET.</p><h2>Diferenciais</h2><p>AWS e React.</p>')).toEqual(['C#','.NET']);
 expect(mandatorySkillGroups('Requisitos obrigatórios\nJava ou .NET\nDiferenciais\nAWS')).toEqual([['.NET','Java']]);
 const w=fixture();expect(analyze(job({description:'Obrigatório: Java ou .NET.'}),w.profile,w.filters).blockers).toEqual([]);
 expect(analyze(job({description:'AWS obrigatório para esta vaga.'}),w.profile,w.filters).blockers.join()).toContain('AWS');
 expect(analyze(job({description:'Java ou Python são obrigatórios.'}),w.profile,w.filters).blockers.join()).toContain('ou');
 expect(analyze(job({description:'Obrigatório Java ou .NET e AWS.'}),w.profile,w.filters).blockers.join()).toContain('AWS');
 expect(analyze(job({description:'Obrigatório .NET, desejável AWS.'}),w.profile,w.filters).blockers).toEqual([]);
 expect(mandatoryTechnicalSkills('SQL Server required, React preferred.')).toEqual(['SQL Server']);
 expect(mandatoryTechnicalSkills('Requisitos obrigatórios\n.NET\nDiferenciais: AWS\nReact')).toEqual(['.NET']);
 expect(mandatoryTechnicalSkills('C#, .NET e React desejáveis.')).toEqual([]);
 expect(mandatoryTechnicalSkills('Requisitos obrigatórios\nC#, .NET e React desejáveis.')).toEqual([]);
});
it('preserves explicit education and licence requirements and allows optional qualifications',()=>{
 const w=fixture();w.profile.education='Ensino médio completo';
 expect(analyze(job({description:'Graduação obrigatória em Engenharia.'}),w.profile,w.filters).blockers.join()).toContain('Escolaridade obrigatória');
 expect(analyze(job({description:'Graduação desejável. CNH B desejável.'}),w.profile,w.filters).blockers).toEqual([]);
 expect(analyze(job({description:'CNH B obrigatória.'}),w.profile,w.filters).blockers.join()).toContain('Habilitação exigida');
});
it('uses modality and geography as pass/fail preferences rather than points',()=>{
 const w=fixture();expect(matchesObjectiveFilters(job(),w.profile,w.filters)).toBe(true);
 expect(matchesObjectiveFilters(job({modality:'Presencial'}),w.profile,w.filters)).toBe(false);
 expect(matchesObjectiveFilters(job({location:'United States'}),w.profile,w.filters)).toBe(false);
 const unknown=job({modality:'Não especificado',location:'Não informado'});expect(eligibleForDestinationResearch(unknown,w)).toBe(true);expect(matchesObjectiveFilters(unknown,w.profile,w.filters)).toBe(false);
});
it('creates separate remote-country and local-workplace queries',()=>{
 const w=fixture();w.filters.modalities=['Remoto','Presencial'];
 const scopes=searchWorkspaces(w);expect(scopes.map(s=>s.filters.modalities)).toEqual([['Remoto'],['Presencial']]);expect(scopes.map(s=>searchPlace(s.filters))).toEqual(['Brasil','Ilhéus, BA']);
});
it('requests only the selected remote scope and rejects wrong list metadata before consuming the candidate budget',async()=>{
 const w=fixture(),requests:URL[]=[];
 vi.stubGlobal('fetch',vi.fn(async(value:string)=>{requests.push(new URL(value));return new Response(JSON.stringify({data:[{id:1,name:'Desenvolvedor .NET',careerPageName:'QA',jobUrl:'https://qa.gupy.io/jobs/1234567',description:'Desenvolvimento de sistemas C# e .NET.',city:'São Paulo',state:'SP',workplaceType:'on-site'},{id:2,name:'Desenvolvedor .NET',careerPageName:'QA',jobUrl:'https://qa.gupy.io/jobs/1234568',description:'Desenvolvimento de sistemas C# e .NET.',city:'São Paulo',state:'SP',workplaceType:'remote'}],pagination:{total:2}}),{headers:{'content-type':'application/json'}});}));
 const result=await withDiscoveryCandidates(15,()=>discoverPublicPortal('gupy',w));expect(result.examined).toBe(1);expect(result.value.jobs).toHaveLength(1);expect(result.value.jobs[0].modality).toBe('Remoto');
 expect(requests[0].searchParams.get('workplaceType')).toBe('remote');expect(requests[0].searchParams.has('city')).toBe(false);
});
