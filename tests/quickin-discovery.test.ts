import {afterEach,describe,expect,it,vi} from 'vitest';
import {createWorkspace} from '../server/workspace';
import {discoverQuickinBoard,configuredQuickinBoards} from '../server/quickin-board';
import type {Source} from '../shared/types';
import type {PublicPage} from '../server/public-web';
import {withDiscoveryCandidates} from '../server/discovery-limits';
const source:Source={id:'quickin-board:employer',type:'manual',board:'employer',company:'Empresa de várias áreas',enabled:true,discovery:true,application:false,status:''};
const posting=(index:number)=>`https://jobs.quickin.io/employer/jobs/${index.toString(16).padStart(24,'0')}`;
function publication(index:number,title:string):PublicPage {
 const url=posting(index),record={'@type':'JobPosting',url,title,hiringOrganization:{name:source.company},
  description:'Contratação CLT. Atividades relacionadas ao cargo anunciado, atendimento da equipe e organização das tarefas diárias. Sem experiência obrigatória.',
  datePosted:new Date().toISOString(),employmentType:'FULL_TIME',jobLocation:{address:{addressLocality:'Ilhéus',addressRegion:'BA',addressCountry:'BR'}}};
 return {url,status:200,contentType:'text/html',html:`<script type="application/ld+json">${JSON.stringify(record)}</script><a href="${url}/apply">Candidatar-se</a>`};
}
function listing(url:string,docs:unknown[],page=1,pages=1):PublicPage {
 return {url,status:200,contentType:'application/json',html:JSON.stringify({docs,page,pages,limit:30,total:pages*30})};
}
function entry(index:number,title:string){return {title,career_url:posting(index),publicate:'published'};}
function workspace(title:string) {
 const w=createWorkspace('Perfil de teste','qa@example.test');w.profile.confirmed=true;
 w.filters.titles=[title];w.filters.modalities=[];w.filters.locations=[];w.filters.contracts=[];w.filters.ageDays=30;
 return w;
}
afterEach(()=>vi.unstubAllEnvs());
describe('Quickin discovery for every candidate profession',()=>{
 it('preserves the next offset when the global candidate budget interrupts a catalog page',async()=>{
  const title='Desenvolvedor Java',w=workspace(title),read=vi.fn(async(url:string)=>url.includes('api.quickin.io')?listing(url,[entry(1,title),entry(2,title),entry(3,title)]):publication(Number.parseInt(url.split('/').at(-1)!,16),title));
  const first=await withDiscoveryCandidates(2,()=>discoverQuickinBoard(source,w,read));
  expect(first.examined).toBe(2);expect(first.value.jobs).toHaveLength(2);
  expect(JSON.parse(first.value.checkpoint.cursor)).toMatchObject({page:1,offset:2});
  w.routine.discoveryCheckpoints={[source.id]:first.value.checkpoint};
  const second=await withDiscoveryCandidates(2,()=>discoverQuickinBoard(source,w,read));
  expect(second.value.jobs[0].url).toBe(posting(3));expect(second.value.checkpoint.pending).toBe(false);
 });
 it('expands the public catalog without replacing existing operator boards or duplicating them',()=>{
  vi.stubEnv('DISCOVERY_QUICKIN_BOARDS',JSON.stringify([{board:'employer',company:'Empresa original'}]));
  vi.stubEnv('DISCOVERY_QUICKIN_ADDITIONAL_BOARDS',JSON.stringify([{board:'retail',company:'Comércio'},{board:'employer',company:'Duplicada'}]));
  expect(configuredQuickinBoards().map(s=>s.board)).toEqual(['employer','retail']);
 });
 it.each(['Analista de Dados','Desenvolvedor Java','Analista de Suporte','Engenheiro de Software','QA Analyst','Desenvolvedor .NET'])(
  'retains the actual publication for %s',async title=>{
   const read=vi.fn(async(url:string)=>url.includes('api.quickin.io')?listing(url,[entry(1,title)]):publication(1,title));
   const result=await discoverQuickinBoard(source,workspace(title),read);
   expect(result.jobs.map(j=>j.title)).toEqual([title]);
   expect(result.checkpoint.pending).toBe(false);
   expect(read).toHaveBeenCalledTimes(2);
  });
 it('uses the publisher pages metadata even when the API caps the requested page size',async()=>{
  const title='Analista de Dados',read=vi.fn(async(url:string)=>{
   if(!url.includes('api.quickin.io'))return publication(2,title);
   return new URL(url).searchParams.get('page')==='1'?listing(url,[entry(1,'Engenheiro de software')],1,2):listing(url,[entry(2,title)],2,2);
  });
  const result=await discoverQuickinBoard(source,workspace(title),read);
  expect(result.jobs.map(j=>j.title)).toEqual([title]);
  expect(result.examined).toBe(2);expect(result.checkpoint.pending).toBe(false);
  expect(read.mock.calls.filter(([url])=>url.includes('api.quickin.io'))).toHaveLength(2);
 });
 it('resumes after the exact last inspected publication instead of repeating page one',async()=>{
  vi.stubEnv('QUICKIN_DISCOVERY_BATCH_SIZE','1');
  const title='Desenvolvedor Java',w=workspace(title),read=vi.fn(async(url:string)=>url.includes('api.quickin.io')?listing(url,[entry(1,title),entry(2,title)]):publication(Number.parseInt(url.split('/').at(-1)!,16),title));
  const first=await discoverQuickinBoard(source,w,read);
  expect(first.jobs[0].url).toBe(posting(1));expect(first.checkpoint.pending).toBe(true);
  w.routine.discoveryCheckpoints={[source.id]:first.checkpoint};
  const second=await discoverQuickinBoard(source,w,read);
  expect(second.jobs[0].url).toBe(posting(2));expect(second.checkpoint.pending).toBe(false);
 });
 it('keeps accounts with different professions separate and leaves their preferences intact',async()=>{
  const read=async(url:string)=>url.includes('api.quickin.io')?listing(url,[entry(1,'Desenvolvedor Java'),entry(2,'Analista de Dados')]):publication(url===posting(1)?1:2,url===posting(1)?'Desenvolvedor Java':'Analista de Dados');
  const accounts=Array.from({length:20},(_,i)=>workspace(i%2?'Desenvolvedor Java':'Analista de Dados'));
  const before=JSON.stringify(accounts);
  const results=await Promise.all(accounts.map(w=>discoverQuickinBoard(source,w,read)));
  results.forEach((r,i)=>expect(r.jobs.map(j=>j.title)).toEqual(accounts[i].filters.titles));
  expect(JSON.stringify(accounts)).toBe(before);
 });
});
