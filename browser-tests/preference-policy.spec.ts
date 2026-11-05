import{test,expect}from'@playwright/test';
import{createWorkspace}from'../server/workspace';
import{analyze}from'../server/engine';
import type{Job}from'../shared/types';

test('shows preferences and explicit requirements without numerical ranking on desktop and mobile',async({page})=>{
 const w=createWorkspace('Pessoa QA','qa@example.test');w.demo=false;
 w.profile={...w.profile,confirmed:true,skills:['C#','.NET','SQL Server'],headline:'Desenvolvedor .NET'};
 w.filters={...w.filters,titles:['Desenvolvedor .NET'],modalities:['Remoto'],locations:['Ilhéus, BA'],remoteAnywhere:true,minScore:100};
 w.routine={...w.routine,enabled:true,mode:'automatic',minScore:100};
 const job:Job={id:'fixture',title:'Desenvolvedor .NET',company:'Empresa de teste',source:'Gupy',url:'https://qa.gupy.io/jobs/1234567',description:'Requisitos e qualificações\nC#, .NET, SQL Server, AWS, Angular, React, Kubernetes e Azure.\nDiferenciais\nDocker.',skills:['C#','.NET','SQL Server','AWS','Angular','React','Kubernetes','Azure'],requiredSkills:[],requiredYears:null,location:'São Paulo, SP, Brasil',modality:'Remoto',contract:'CLT',level:'Pleno',salaryMin:null,salaryMax:null,currency:'BRL',publishedAt:new Date().toISOString(),discoveredAt:new Date().toISOString(),origins:[{source:'portal',id:'fixture',url:'https://qa.gupy.io/jobs/1234567'}],saved:false,discarded:false,demo:false,match:{}as Job['match']};
 job.match={...analyze(job,w.profile,w.filters),score:22};w.jobs=[job];
 const writes:string[]=[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(route.request().method()!=='GET')writes.push(path);
  if(path==='/api/auth/me')return route.fulfill({json:{id:'fixture',name:w.profile.name,email:w.profile.email}});
  if(path==='/api/workspace')return route.fulfill({json:w});
  if(path==='/api/workspace/version')return route.fulfill({json:{revision:'fixture'}});
  if(path==='/api/jobs'){expect(url.searchParams.get('sort')).toBe('recent');return route.fulfill({json:{items:[job],total:1,pageSize:12}});}
  return route.fulfill({json:{}});
 });
 await page.goto('/app#vagas');
 await expect(page.getByRole('combobox',{name:'Modalidade',exact:true})).toHaveValue('Remoto');
 await expect(page.locator('.job-card')).toHaveCount(1);
 await expect(page.locator('.job-card')).not.toContainText(/22\s*(?:\/100|pontos)|nota mínima/i);
 await page.getByRole('button',{name:'Ver oportunidade',exact:false}).click();
 const detail=page.getByRole('dialog');
 await expect(detail.getByRole('heading',{name:'Preferências e requisitos desta vaga'})).toBeVisible();
 await expect(detail).toContainText('não é necessário dominar toda a lista');
 await expect(detail.getByRole('button',{name:'Processar esta vaga pela rotina'})).toBeEnabled();
 await expect(detail).not.toContainText(/22\s*(?:\/100|pontos)|nota mínima/i);
 await page.screenshot({path:'artifacts/preferences-no-score-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/preferences-no-score-mobile.png'});
 await detail.getByRole('button',{name:'Descartar vaga',exact:true}).scrollIntoViewIfNeeded();
 await expect(detail.getByRole('button',{name:'Descartar vaga',exact:true})).toBeVisible();
 expect(writes).toEqual([]);
});
