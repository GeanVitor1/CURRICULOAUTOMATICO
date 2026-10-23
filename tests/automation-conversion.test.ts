import {it,expect,vi,afterEach} from 'vitest';
import {automationConversion} from '../server/automation-conversion';
import {createWorkspace} from '../server/workspace';
import type {Job} from '../shared/types';
afterEach(()=>vi.unstubAllEnvs());
it('separates supported executor, CAPTCHA preflight and actual confirmation; excludes off-filter jobs',()=>{
 vi.stubEnv('COMPANY_FORM_AUTHORIZED','company.example');
 const w=createWorkspace('Candidate','candidate@example.test');
 w.profile={...w.profile,headline:'Desenvolvedor React',skills:['React','TypeScript','Git'],confirmed:true,years:2};
 w.filters.titles=['Desenvolvedor React'];w.filters.dateKnownOnly=true;w.routine.minScore=0;
 const at=new Date().toISOString();
 const j:Job={id:'job',title:'Desenvolvedor React',company:'Company',url:'https://company.example/jobs/1',source:'company',description:'Desenvolvedor React para aplicações web com TypeScript, Git e APIs REST. Trabalho remoto no Brasil. Contratação CLT. Desenvolvimento e manutenção de componentes e testes automatizados.',location:'Brasil',modality:'Remoto',level:'Júnior',contract:'CLT',salaryMin:5000,salaryMax:null,currency:'BRL',skills:['React','TypeScript','Git'],requiredSkills:[],requiredYears:null,publishedAt:at,discoveredAt:at,origins:[],saved:false,discarded:false,demo:false,match:{score:0,strengths:[],gaps:[],blockers:[],matchedSkills:[],missingSkills:[],radar:false,explanation:''},destinations:[{id:'d',url:'https://company.example/jobs/1',publicationUrl:'https://company.example/jobs/1',platform:'company',company:'Company',state:'verified',formFound:true,method:'browser',confidence:100,verifiedAt:at,expiresAt:new Date(Date.now()+86400000).toISOString(),evidence:['Formulário WP Jobs Board verificado.']}]};
 w.jobs=[j,{...structuredClone(j),id:'off-filter',title:'Operador de Caixa',description:'Atendimento em supermercado. Presencial em Recife, PE.',modality:'Presencial',location:'Recife, PE',skills:[]}];
 w.applications=[{id:'a',jobId:j.id,resumeId:null,status:'Requer ação manual',mode:'automatic',createdAt:at,updatedAt:at,receipt:null,note:'',draft:'',history:[{at,actor:'Sistema',message:'Este formulário exige verificação humana.'}],attempts:[{id:'attempt',correlationId:'c',origin:'user_triggered_automation',executor:'company_wp_jobs',startedAt:at,outcome:'pre_submit_blocked'}]}];
 const r=automationConversion(w,[],false);
 expect(r.totals).toMatchObject({discovered:2,compatible:1,validDestination:1,executorAvailable:1,prepared:1,preflightBlocked:1,transmissionsStarted:0,confirmed:0});
 expect(r.blocked.human_verification).toBe(1);expect(r.platforms.company['blocked:human_verification']).toBe(1);expect(r.scope).toBe('retained_inventory');
});
