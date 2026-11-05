import {describe,it,expect} from 'vitest';
import {createWorkspace} from '../server/workspace';
import {discoveryQuota,discoveryDay,withDiscoveryCandidates,discoveryCandidateLimit,takeDiscoveryCandidate} from '../server/discovery-limits';
import type {Application} from '../shared/types';

const date=new Date('2026-10-29T16:00:00Z');
function workspace(){const w=createWorkspace('Pessoa','qa@example.test');w.routine.dailyLimit=5;return w;}
function application(id:string,status='Enviada'):Application{return {id,jobId:id,mode:'automatic',status,createdAt:date.toISOString(),updatedAt:date.toISOString(),note:'',receipt:status==='Enviada'?'receipt':null,submittedAt:status==='Enviada'?date.toISOString():undefined,history:[{at:date.toISOString(),actor:'Sistema',message:'Envio iniciado.'}]} as Application;}

describe('Proportional account discovery budget',()=>{
 it('caps five daily slots at fifteen candidates, including a larger preferred limit',()=>{
  const w=workspace();w.routine.dailyLimit=100;
  expect(discoveryQuota(w,5,0,date)).toMatchObject({target:5,remaining:5,maximum:15,candidateLimit:15});
 });
 it('uses the real balance and counts uncertain attempts without calling them receipts',()=>{
  const w=workspace();w.applications=[application('one'),application('two','Resultado desconhecido')];
  expect(discoveryQuota(w,5,0,date)).toMatchObject({remaining:3,candidateLimit:9});
  expect(w.applications[1].receipt).toBeNull();
  expect(discoveryQuota(w,5,4,date)).toMatchObject({remaining:1,candidateLimit:3});
  expect(discoveryQuota(w,5,5,date).candidateLimit).toBe(0);
 });
 it('uses queued applications before spending on new searches',()=>{
  const w=workspace();w.jobs=[{id:'queued',url:'https://empresa.gupy.io/jobs/123',company:'Empresa'} as any];
  w.applications=[{...application('queued','Aguardando aprovação'),history:[]}];
  expect(discoveryQuota(w,5,0,date)).toMatchObject({remaining:4,candidateLimit:12});
 });
 it('does not count a removed source as a useful pending slot',()=>{
  const w=workspace();w.jobs=[{id:'queued',url:'https://jobs.quickin.io/globalti/jobs/123',company:'Global TI'} as any];
  w.applications=[{...application('queued','Aguardando aprovação'),history:[]}];
  expect(discoveryQuota(w,5,0,date).remaining).toBe(5);
 });
 it('does not multiply the daily budget on continuations and resets on the next billing day',()=>{
  const w=workspace();w.routine.discoveryBudget={day:discoveryDay(date),target:5,examined:14};
  expect(discoveryQuota(w,5,0,date).candidateLimit).toBe(1);
  w.routine.discoveryBudget.examined=15;
  expect(discoveryQuota(w,5,0,date).candidateLimit).toBe(0);
  expect(discoveryQuota(w,5,0,new Date('2026-10-30T16:00:00Z')).candidateLimit).toBe(15);
 });
 it('keeps larger plans proportional and finite per queue batch',()=>{
  const w=workspace();w.routine.dailyLimit=50;
  expect(discoveryQuota(w,50,0,date)).toMatchObject({target:50,maximum:150,candidateLimit:30});
 });
 it('isolates twenty simultaneous candidate budgets',async()=>{
  const results=await Promise.all(Array.from({length:20},(_,i)=>withDiscoveryCandidates(i+1,async()=>{
   await Promise.resolve();let reads=0;
   while(takeDiscoveryCandidate()){reads++;await Promise.resolve();}
   expect(discoveryCandidateLimit(100)).toBe(0);return reads;
  })));
  results.forEach((r,i)=>expect(r).toEqual({value:i+1,examined:i+1}));
  expect(discoveryCandidateLimit(100)).toBe(100);
 });
 it('reports consumed work when a provider fails so it is not refunded',async()=>{
  let spent=0;
  await expect(withDiscoveryCandidates(3,async()=>{takeDiscoveryCandidate();takeDiscoveryCandidate();throw Error('Provider failed');},n=>{spent=n;})).rejects.toThrow('Provider failed');
  expect(spent).toBe(2);
 });
});
