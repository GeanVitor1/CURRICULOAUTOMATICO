import {it,expect,vi} from 'vitest';
import {createWorkspace} from '../server/workspace';
import {discoverEmployerUpdates} from '../server/employer-feed-discovery';
import {canonicalJobUrl} from '../server/job-identity';
import {jobFromEmployerPost} from '../server/employer-posts';
import type {Job} from '../shared/types';
import type {PublicPage} from '../server/public-web';
const anchor='https://www.linkedin.com/feed/update/urn:li:activity:1234567890123/';
const org='https://br.linkedin.com/company/employer/';
const next='https://pt.linkedin.com/posts/employer_vaga-activity-1234567890124-post';
const now=new Date().toISOString();
const body='Seu próximo desafio pode estar aqui.\nEstamos com oportunidade aberta para Desenvolvedor Full Stack Pleno, para atuar em projetos. Contratação CLT, 100% remoto. Desenvolvimento TypeScript e Angular com APIs REST e Git. Envie seu currículo para talentos@empresa.example.';
const page=(url:string,data:unknown,text=''):PublicPage=>({url,status:200,contentType:'text/html',html:`<h1>Empresa Oficial</h1><p>${text}</p><script type="application/ld+json">${JSON.stringify(data)}</script>`});
const post={"@type":"SocialMediaPosting",author:{"@type":"Organization",name:'Empresa Oficial',url:org},datePublished:now,articleBody:body,headline:'Seu próximo desafio pode estar aqui.'};
function workspace() {const w=createWorkspace('Pessoa','private@example.test');w.jobs=[{url:anchor,emailDestination:{email:'talentos@empresa.example',publicationUrl:anchor,employerUrl:'https://empresa.example/',verifiedAt:now,expiresAt:new Date(Date.now()+86400000).toISOString()}} as Job];return w;}
it('descobre novos anúncios da empresa sem IA nem inclusão manual de cada vaga',async()=>{
  const read=vi.fn(async(url:string)=>url===anchor?page(url,post,body):url===org?page(url,[{...post,url:next}],body+' talentos@empresa.example <a href="https://empresa.example/">Site da empresa</a>'):url===next?page(url,post,body):page(url,{},'Empresa Oficial talentos@empresa.example'));
  const result=await discoverEmployerUpdates(workspace(),read);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0]).toMatchObject({title:'Desenvolvedor Full Stack Pleno',modality:'Remoto',publishedAt:now,emailDestination:{email:'talentos@empresa.example'}});
  expect(read.mock.calls.flat().join(' ')).not.toContain('private@example.test');
});
it('ignora posts de outras empresas e anúncios fora do período',async()=>{
  const read=vi.fn(async(url:string)=>url===anchor?page(url,post,body):page(url,[{...post,url:next,datePublished:'2020-01-01'},{...post,url:next,author:{...post.author,url:'https://br.linkedin.com/company/other/'}}]));
  expect((await discoverEmployerUpdates(workspace(),read)).jobs).toEqual([]);
  expect(read).toHaveBeenCalledTimes(2);
});
it('a mesma publicação em feed e em posts tem uma identidade, inclusive entre subdomínios',()=>{
  expect(canonicalJobUrl(next)).toBe('https://www.linkedin.com/feed/update/urn:li:activity:1234567890124/');
  expect(canonicalJobUrl(anchor)).toBe(anchor);
});
it('preserva o ponto de .NET ao extrair o cargo declarado pelo empregador',async()=>{
  const netBody=body.replace('Desenvolvedor Full Stack Pleno','Desenvolvedor .NET Pleno');
  const result=await jobFromEmployerPost(page(next,{...post,articleBody:netBody},netBody),async(url)=>page(url,{},'Empresa Oficial talentos@empresa.example <a href="https://empresa.example/">Site oficial</a>'));
  expect(result?.title).toBe('Desenvolvedor .NET Pleno');
});
