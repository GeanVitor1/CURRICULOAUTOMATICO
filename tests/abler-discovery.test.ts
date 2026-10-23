import {afterEach,expect,it,vi} from 'vitest';
import {nuxtPublicData} from '../server/nuxt-public-data';
import {ablerSource,ablerPublication,jobFromAblerPage,discoverAblerJobs} from '../server/abler-discovery';
import {verifyEmailDestination} from '../server/email-destination';
import {createWorkspace} from '../server/workspace';
import type {PublicPage} from '../server/public-web';
const url='https://candidatos.abler.com.br/vagas/desenvolvedor-net-123456';
const vacancy={id:'456789',identifier:'abler-456789',provider:'abler',slug:'desenvolvedor-net-123456',title:'Desenvolvedor .NET',companyName:'Empresa Oficial',released:true,hideCompany:false,status:'Em andamento',publishedAt:new Date().toISOString(),candidatureEmailAddress:'vaga-456789@vagas.abler.in',workTypes:[{id:'remoto'}],contractingRegime:'clt',salaryValue:5000,address:{cityName:'São Paulo',stateAbbr:'SP',country:'Brasil'},allDescriptions:'<p>Desenvolvimento com C#, .NET, Angular, SQL Server e APIs REST. Trabalho remoto no Brasil em projetos com revisão de código e testes.</p>'};
const page=(v:Record<string,any>=vacancy):PublicPage=>({url,status:200,contentType:'text/html',html:`<script>window.__NUXT__=(function(a,b){return {state:{candidate:{vacancy:{vacancy:${JSON.stringify(v)}}}},error:a,serverRendered:b}}(null,true));</script>`});
afterEach(()=>vi.unstubAllEnvs());
it('decodifica somente dados; chamadas, propriedades calculadas e comandos não são executados',()=>{
  expect(nuxtPublicData(page().html)?.state.candidate.vacancy.vacancy.id).toBe('456789');
  for(const code of ['process.exit()','globalThis.fetch("https://attacker.example")','({["key"]:1})','new Date()'])
    expect(nuxtPublicData(`<script>window.__NUXT__=(function(){return ${code}}());</script>`)).toBeNull();
});
it('usa data, modalidade e destinatário publicados; não deriva o e-mail de um ID',async()=>{
  const job=jobFromAblerPage(page())!;
  expect(job).toMatchObject({title:'Desenvolvedor .NET',company:'Empresa Oficial',modality:'Remoto',contract:'CLT',salaryMin:5000,emailDestination:{email:'vaga-456789@vagas.abler.in'}});
  const read=vi.fn(async()=>page());
  expect((await verifyEmailDestination(job,undefined,read)).email).toBe('vaga-456789@vagas.abler.in');
  expect(read).toHaveBeenCalledTimes(1);
  for(const patch of [{candidatureEmailAddress:''},{candidatureEmailAddress:'vaga-999999@vagas.abler.in'},{candidatureEmailAddress:'attacker@example.com'},{released:false},{status:'Encerrada'},{publishedAt:'2099-01-01'},{slug:'different-job'},{closeOn:'2020-01-01'}])expect(ablerPublication(page({...vacancy,...patch}))).toBeNull();
  expect(ablerPublication({...page(),url:'https://unrelated.example/vagas/desenvolvedor-net-123456'})).toBeNull();
  await expect(verifyEmailDestination({...job,title:'Outro cargo'},undefined,read)).rejects.toThrow();
  await expect(verifyEmailDestination(job,undefined,async()=>page({...vacancy,publishedAt:'2020-01-01'}))).rejects.toThrow();
});
it('descobre pelo catálogo público e rejeita publicação antiga mesmo com lastmod recente',async()=>{
  const w=createWorkspace('Pessoa','private@example.test');w.filters.titles=['Desenvolvedor .NET'];w.filters.ageDays=14;
  const oldUrl=url.replace('123456','654321');
  const sitemap=`<urlset><url><loc>${url}</loc><lastmod>${new Date().toISOString()}</lastmod></url><url><loc>${oldUrl}</loc><lastmod>${new Date().toISOString()}</lastmod></url></urlset>`;
  const read=vi.fn(async(target:string)=>target===ablerSource.board?{...page(),url:target,html:sitemap}:target===oldUrl?{...page({...vacancy,slug:'desenvolvedor-net-654321',publishedAt:'2020-01-01'}),url:target}:page());
  const result=await discoverAblerJobs(w,read);
  expect(result.jobs).toHaveLength(1);expect(result.jobs[0].url).toBe(url);
  expect(read.mock.calls.flat().join(' ')).not.toContain('private@example.test');
});

it('consulta anúncios correspondentes além dos primeiros vinte e quatro',async()=>{
 const w=createWorkspace('Pessoa','fixture@example.test');w.filters.titles=['Desenvolvedor .NET'];w.filters.ageDays=14;
 const urls=Array.from({length:25},(_,i)=>`https://candidatos.abler.com.br/vagas/desenvolvedor-net-${600000+i}`);
 const sitemap='<urlset>'+urls.map(u=>`<url><loc>${u}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`).join('')+'</urlset>';
 const read=vi.fn(async(target:string)=>{
  if(target===ablerSource.board)return {...page(),url:target,html:sitemap};
  const id=target.split('-').at(-1)!;
  return {...page({...vacancy,id,identifier:`abler-${id}`,slug:`desenvolvedor-net-${id}`,candidatureEmailAddress:`vaga-${id}@vagas.abler.in`}),url:target};
 });
 const result=await discoverAblerJobs(w,read);
 expect(result.jobs).toHaveLength(25);
 expect(result.jobs.some(j=>j.url===urls[24])).toBe(true);
});
it('preserva o cursor para consultar candidatos além do orçamento de uma execução',async()=>{
  vi.stubEnv('ABLER_DISCOVERY_BATCH_SIZE','2');
  const w=createWorkspace('Pessoa','fixture@example.test');w.filters.titles=['Desenvolvedor .NET'];w.filters.ageDays=14;
  const urls=Array.from({length:3},(_,i)=>`https://candidatos.abler.com.br/vagas/desenvolvedor-net-${800000+i}`);
  const sitemap='<urlset>'+urls.map(u=>`<url><loc>${u}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`).join('')+'</urlset>';
  const read=async(target:string)=>{
    if(target===ablerSource.board)return {...page(),url:target,html:sitemap};
    const id=target.split('-').at(-1)!;
    return {...page({...vacancy,id,identifier:`abler-${id}`,slug:`desenvolvedor-net-${id}`,candidatureEmailAddress:`vaga-${id}@vagas.abler.in`}),url:target};
  };
  const first=await discoverAblerJobs(w,read);expect(first.jobs).toHaveLength(2);
  w.routine.discoveryCheckpoints={[ablerSource.id]:first.checkpoint};
  const second=await discoverAblerJobs(w,read);
  expect(second.jobs).toHaveLength(1);expect(second.jobs[0].url).toBe(urls[2]);expect(second.checkpoint.pending).toBe(false);
});
