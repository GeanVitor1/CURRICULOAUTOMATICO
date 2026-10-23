import {expect,test} from "@playwright/test";
import {createWorkspace} from "../server/workspace";
import {confirmCandidateDetails} from "../tests/fixtures/candidate-details";
import type {Job} from "../shared/types";

test("only confirmed submissions appear and refresh automatically",async({page})=>{
 const w=createWorkspace("Pessoa","fixture@example.test");confirmCandidateDetails(w);
 w.onboarding!.completed=true;w.guide={step:0,completed:true,active:false,dismissed:true};
 w.revision="one";w.routine.enabled=true;w.routine.mode="automatic";
 w.jobs=[{id:"job",title:"Desenvolvedor",company:"Empresa QA",match:{score:90}} as Job];
 w.applications=[{id:"application",jobId:"job",resumeId:"resume",status:"Aguardando aprovação",mode:"automatic",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),history:[],note:"",receipt:null}];
 let version="one";
 await page.route("**/api/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==="/api/auth/me") return route.fulfill({json:{id:"user",name:"Pessoa",email:w.profile.email}});
  if(path==="/api/workspace") return route.fulfill({json:w});
  if(path==="/api/workspace/version") return route.fulfill({json:{revision:version}});
  if(path==="/api/automation/sites") return route.fulfill({json:[]});
  if(path.endsWith("/readiness")) return route.fulfill({json:{ready:false,blockers:[],resumeId:null,destinationUrl:null,method:null}});
  return route.fulfill({json:{}});
 });
 await page.goto("/app#candidaturas");
 await expect(page.getByRole("heading",{name:"Seus envios aparecerão aqui"})).toBeVisible();
 await expect(page.getByRole("row").filter({hasText:"Empresa QA"})).toHaveCount(0);
 await expect(page.getByText("Requer ação manual",{exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Registrar candidatura"})).toHaveCount(0);
 w.applications[0].status="Enviada";w.applications[0].receipt="Controlled receipt";w.applications[0].submittedAt=new Date().toISOString();
 w.applications[0].answersUsed=[{question:"Possui familiar na empresa?",value:"Não",source:"default_no",at:new Date().toISOString()}];
 w.revision="two";version="two";
 await expect(page.getByRole("row").filter({hasText:"Empresa QA"})).toBeVisible({timeout:15000});
 await page.getByRole("row").filter({hasText:"Empresa QA"}).click();
 const dialog=page.getByRole("dialog");
 await expect(dialog.getByRole("heading",{name:"Respostas da candidatura"})).toBeVisible();
 await dialog.getByText("Possui familiar na empresa?",{exact:true}).click();
 await expect(dialog.getByText("Não",{exact:true})).toBeVisible();
 await expect(dialog.getByText(/Regra para informações ausentes/)).toBeVisible();
});
