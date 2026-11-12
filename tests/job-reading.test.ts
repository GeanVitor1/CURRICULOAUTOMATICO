import {describe,expect,it,vi} from 'vitest';
vi.mock('../server/db',()=>({store:{select:async()=>[],insert:async()=>undefined}}));
import {readJobsBatch,jobReadingKey} from '../server/job-reading';
import {aiStackCompatible,matchesObjectiveFilters} from '../server/engine';
import {defaultFilters,defaultProfile,type Job} from '../shared/types';
const dotnet={skills:['C#','.NET','Angular'],experience:'APIs em C# e .NET',headline:'Desenvolvedor .NET'};
describe('leitura de vagas por IA',()=>{
 it('lê 10 vagas em uma chamada e ignora ids desconhecidos',async()=>{
  const ask=vi.fn(async()=>({text:JSON.stringify({items:[{id:'0',category:'backend',internship:false,seniority:'pleno',primaryStack:['Java'],mandatory:['Java']},{id:'99',category:'qa',internship:false,seniority:'pleno',primaryStack:[],mandatory:[]}]}),tokens:900,grounding:undefined}));
  const r=await readJobsBatch(Array.from({length:10},(_,i)=>({id:String(i),title:'Dev '+i,description:'x'})),ask as any);
  expect(ask).toHaveBeenCalledTimes(1);expect(r.readings.map(x=>x.id)).toEqual(['0']);
 });
 it('mesma vaga gera a mesma chave para todas as contas',()=>{
  expect(jobReadingKey({title:'Dev Java',description:'<p>Java</p>'})).toBe(jobReadingKey({title:'dev java',description:'<p>Java</p>'}));
 });
 it('stack lido pela IA decide a compatibilidade',()=>{
  expect(aiStackCompatible(['Java','Spring'],dotnet)).toBe(false);
  expect(aiStackCompatible(['C#','ASP.NET Core'],dotnet)).toBe(true);
  expect(aiStackCompatible(['.NET'],{...dotnet,skills:['C#']})).toBe(true);
 });
 it('categoria not-it da IA exclui mesmo com título de TI',()=>{
  const job={id:'1',title:'Desenvolvedor de Fornecedores',description:'compras',company:'X',url:'https://x.y/1',source:'Gupy',location:'Brasil',modality:'Remoto',contract:'CLT',level:'Não especificado',salaryMin:null,salaryMax:null,currency:'',skills:[],requiredSkills:[],requiredYears:null,publishedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),saved:false,discarded:false,demo:false,origins:[],match:{} as any,aiReading:{category:'not-it',internship:false,seniority:'pleno',primaryStack:[],mandatory:[]}} as Job;
  expect(matchesObjectiveFilters(job,{...defaultProfile,...dotnet,confirmed:true},{...defaultFilters,modalities:[],locations:[],contracts:[]})).toBe(false);
 });
});
