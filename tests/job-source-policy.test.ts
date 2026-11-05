import {describe,it,expect} from 'vitest';
import {permittedPublicationUrl,permittedJobSource,permittedDiscoverySource,removedJobSource} from '../shared/job-source-policy';
import type {Source} from '../shared/types';

describe('Sources selected for the product',()=>{
 it.each(['Global TI','Globalti','Global T.I.','https://jobs.quickin.io/globalti/jobs/123','https://globalti.com.br/vagas','https://jobs.quickin.io/%67lobalti/jobs/123'])(
  'excludes the removed source even when it uses a supported platform: %s',value=>expect(removedJobSource(value)).toBe(true));
 it.each(['https://empresa.gupy.io/jobs/123','https://www.linkedin.com/jobs/view/123','https://www.infojobs.com.br/vaga-de-caixa__123.aspx','https://www.glassdoor.com.br/job-listing/test?jl=123','https://jobs.quickin.io/retail/jobs/123','https://jobs.lever.co/employer/123','https://job-boards.greenhouse.io/employer/jobs/123'])(
  'allows a direct recruitment platform without restricting occupations: %s',url=>expect(permittedPublicationUrl(url)).toBe(true));
 it.each(['http://empresa.gupy.io/jobs/123','https://gupy.io.evil.test/jobs/123','https://empresa.gupy.io@evil.test/jobs/123','https://blog-vagas.example/jobs/123','https://jobs.quickin.io/globalti/jobs/123'])(
  'rejects arbitrary websites and deceptive domains: %s',url=>expect(permittedPublicationUrl(url)).toBe(false));
 it('checks company identity as well as the publication URL',()=>{
  expect(permittedJobSource({company:'Global TI',url:'https://empresa.gupy.io/jobs/123'})).toBe(false);
  expect(permittedJobSource({company:'Comércio regional',url:'https://empresa.gupy.io/jobs/123'})).toBe(true);
 });
 it('does not re-enable a removed configured or learned board',()=>{
  const source:Source={id:'quickin-board:globalti',board:'globalti',company:'Global TI',type:'manual',enabled:true,discovery:true,application:true,status:''};
  expect(permittedDiscoverySource(source)).toBe(false);
  expect(permittedDiscoverySource({...source,id:'quickin-board:retail',board:'retail',company:'Comércio'})).toBe(true);
  expect(permittedDiscoverySource({...source,id:'company-board:unknown.example',board:'https://unknown.example',company:'Outra empresa'})).toBe(false);
  expect(permittedDiscoverySource({...source,id:'feed',board:'public',company:'Agregador',type:'jobicy'})).toBe(false);
 });
});
