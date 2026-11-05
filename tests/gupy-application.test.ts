import { installGupyFixture, type GupyFixtureOptions } from "./fixtures/gupy";
import { beforeAll, afterAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  applyOnPage,
  authenticated,
  type PortalApplication,
} from "../server/portal-application";
import {fillGupyQuestions} from '../server/gupy-application';
import { createWorkspace } from "../server/workspace";
import { confirmCandidateDetails } from "./fixtures/candidate-details";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});
const title = "Pessoa Desenvolvedora Backend C#/.NET - Pleno";
const origin = "https://fixture.gupy.io";
const nativePath = "/candidates/applications/777/steps/888/curriculum";
function application(): PortalApplication {
  const w = createWorkspace("Pessoa QA", "candidate@example.test");
  confirmCandidateDetails(w);
  w.profile.confirmed = true;
  w.profile.skills = ["C#", ".NET", "Microsoft SQL Server"];
  return {
    applicationId: "qa-gupy",
    job: { title, company: "Fixture", url: origin + "/jobs/12345" },
    profile: w.profile,
    resume: { name: "approved.pdf" },
    presentation: "Apresentação baseada apenas no currículo aprovado.",
  };
}

async function fixture(options: GupyFixtureOptions = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const metrics = await installGupyFixture(page, options);
  return { page, close: () => context.close(), result: () => metrics };
}

it("o projeto percorre o fluxo Gupy observado, responde, finaliza uma vez e obtém recibo", async () => {
  const f = await fixture();
  try {
    const result = await applyOnPage(f.page, "gupy", application(), true);
    expect(result.status).toBe("sent");
    expect(result.receipt).toContain("Candidatura finalizada!");
    expect(result.receipt).toContain("/candidates/applications/777/");
    expect(f.result()).toMatchObject({
      updates: 0,
      submits: 1,
      received: {
        pj: "Sim",
        compensation: "Prefiro não informar",
        salary: "3500",
        source: "Página de Carreiras da Empresa",
        presentation: application().presentation,
        skills: ["C#", ".NET", "Microsoft SQL Server"],
      },
    });
  } finally {
    await f.close();
  }
}, 30000);

it('waits for a delayed Gupy form even when the accordion shell has no loading message',async()=>{
  const f=await fixture({initialSkeletonMs:6500});
  try{
    const result=await applyOnPage(f.page,'gupy',application(),true);
    expect(result.status).toBe('sent');
    expect(f.result().submits).toBe(1);
    expect(f.result().updates).toBe(0);
  }finally{await f.close();}
},30000);

it('selects the actual published source in the custom combobox before advancing the disabled form',async()=>{
  const f=await fixture({customSource:true});
  try{
    const result=await applyOnPage(f.page,'gupy',application(),true);
    expect(result.status).toBe('sent');
    expect(f.result().submits).toBe(1);
    expect(f.result().received.additionalSource).toBe('Site da empresa');
  }finally{await f.close();}
},30000);

it('resumes an explicitly verified native draft through its own curriculum without creating another registration',async()=>{
  const f=await fixture();let registrations=0;
  try{
    await f.page.route(`${origin}/jobs/12345`,route=>{registrations++;return route.abort();});
    await f.page.route(`${origin}/candidates/applications/777`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>${title}</h1><p>Seu progresso 0 / 6. Acompanhe abaixo o andamento.</p><a href="/jobs/12345">clique aqui</a><button id="expandable-card-1" onclick="location.href='${nativePath}'">Começar</button>`}));
    const input=application();input.continuationUrl=origin+'/candidates/applications/777';
    const result=await applyOnPage(f.page,'gupy',input,true);
    expect(result.status).toBe('sent');expect(registrations).toBe(0);expect(f.result().submits).toBe(1);
  }finally{await f.close();}
},30000);

it('rejects a draft continuation from a different company before starting any browser navigation',async()=>{
  const f=await fixture();
  try{const input=application();input.continuationUrl='https://another.gupy.io/candidates/applications/777';
    expect((await applyOnPage(f.page,'gupy',input,true)).status).toBe('action_required');
    expect(f.page.url()).toBe('about:blank');expect(f.result().submits).toBe(0);
  }finally{await f.close();}
});
it.each(['continue','submit'] as const)('handles the specific unanswered optional questions warning without fabricating answers: %s',async optionalWarning=>{
  const f=await fixture({optionalWarning});
  try{
    const result=await applyOnPage(f.page,'gupy',application(),true);
    expect(result.status).toBe('sent');expect(result.receipt).toContain('Candidatura finalizada!');
    expect(f.result().submits).toBe(1);expect(f.result().updates).toBe(0);
  }finally{await f.close();}
},30000);
it('does not repeat an optional confirmation that may have already submitted the application',async()=>{
  const f=await fixture({optionalWarning:'submit',ambiguous:true});
  try{
    const result=applyOnPage(f.page,'gupy',application(),true);
    await f.page.getByRole('heading',{name:'Aguarde',exact:true}).waitFor({state:'visible',timeout:15000});
    await f.page.waitForTimeout(1000);
    expect(f.result().submits).toBe(1);
    await f.close();expect((await result).status).toBe('unknown');expect(f.result().submits).toBe(1);
  }finally{await f.close();}
},30000);

it('uses the verified Gupy portal source hint and leaves an unknown required combobox unanswered',async()=>{
  const f=await fixture();
  try{
    await f.page.setContent('<label>Onde você encontrou essa vaga? (Opcional)<input role="combobox" readonly onclick="document.querySelector(\'ul\').hidden=false"></label><ul role="listbox" hidden><li role="option" onclick="document.querySelector(\'input\').value=this.textContent;this.parentElement.hidden=true">Site da empresa</li><li role="option" onclick="document.querySelector(\'input\').value=this.textContent;this.parentElement.hidden=true">Portal de Vagas da Gupy</li></ul><label>Qual sua certificação profissional?<input role="combobox" required readonly></label>');
    const input=application();input.job.url+='?jobBoardSource=gupy_portal';
    expect(await fillGupyQuestions(f.page,input)).toEqual(['Qual sua certificação profissional?']);
    expect(await f.page.getByRole('combobox').first().inputValue()).toBe('Portal de Vagas da Gupy');
    expect(await f.page.getByRole('combobox').last().inputValue()).toBe('');
  }finally{await f.close();}
});

it.each([{ unknown: true }, { unknownRadio: true }])(
  "deixa perguntas obrigatórias sem resposta aprovada pendentes: %j",
  async (options) => {
    const f = await fixture(options);
    try {
      const result = await applyOnPage(f.page, "gupy", application(), true);
      expect(result.status).toBe("action_required");
      expect(result.retryable).toBe(true);
      expect(result.missingQuestions?.join(" ")).toContain("certificação");
      expect(f.result().submits).toBe(0);
      expect(f.result().updates).toBe(0);
    } finally {
      await f.close();
    }
  },
  30000,
);

it("não altera contatos quando a atualização cadastral é obrigatória", async () => {
  const f = await fixture({ contactBlocked: true });
  try {
    const result = await applyOnPage(f.page, "gupy", application(), true);
    expect(result.status).toBe("action_required");
    expect(f.result()).toMatchObject({ updates: 0, submits: 0 });
    expect(
      await f.page.getByLabel("E-mail", { exact: true }).inputValue(),
    ).toBe("original@example.test");
  } finally {
    await f.close();
  }
}, 15000);

it.each([{ already: true }, { differentJob: true }])(
  "não repete candidatura existente nem aplica em outro cargo: %j",
  async (options) => {
    const f = await fixture(options);
    try {
      const result = await applyOnPage(f.page, "gupy", application(), true);
      expect(result.status).toBe("action_required");
      expect(f.result().submits).toBe(0);
    } finally {
      await f.close();
    }
  },
  15000,
);

it("a ausência de confirmação após o clique final impede um segundo envio", async () => {
  const f = await fixture({ ambiguous: true });
  try {
    const result = await applyOnPage(f.page, "gupy", application(), true);
    expect(result.status).toBe("unknown");
    expect(result.retryable).not.toBe(true);
    expect(f.result().submits).toBe(1);
  } finally {
    await f.close();
  }
}, 30000);

it("exige confirmação do currículo Gupy antes de iniciar", async () => {
  const f = await fixture();
  try {
    expect(
      (await applyOnPage(f.page, "gupy", application(), false)).status,
    ).toBe("action_required");
    expect(f.result().submits).toBe(0);
  } finally {
    await f.close();
  }
});

it("reconhece a sessão moderna pela rota privada e controles de conta", async () => {
  const f = await fixture();
  try {
    await f.page.goto(origin + "/jobs/12345");
    await f.page
      .getByRole("button", { name: "Candidatar-se", exact: true })
      .click();
    await f.page
      .getByRole("button", { name: "Me lembrar depois", exact: true })
      .click();
    expect(await authenticated(f.page, "gupy")).toBe(true);
  } finally {
    await f.close();
  }
});
it('recognizes the current candidate portal user menu after session import',async()=>{
 const f=await fixture();
 try{
  await f.page.route(`${origin}/my/applications`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>Minhas candidaturas</h1><button aria-label="Pessoa QA Abrir menu de usuário">Menu</button>'}));
  await f.page.goto(`${origin}/my/applications`);
  expect(await authenticated(f.page,'gupy')).toBe(true);
 }finally{await f.close();}
});
it('associates multiple checkbox choices with their question while preserving individual declarations',async()=>{
 const f=await fixture();
 try{
  await f.page.setContent('<fieldset><legend>Você possui certificações?</legend><label><input type="checkbox" name="certificate-a" required>Certificação A</label><label><input type="checkbox" name="certificate-none" required>Nenhuma das opções acima.</label></fieldset><label><input type="checkbox" required>Autorizo o uso de dados para marketing</label>');
  const input=application(),options:Record<string,string[]>={};
  let missing=await fillGupyQuestions(f.page,input,options);
  expect(missing).toContain('Você possui certificações?');expect(missing).not.toContain('Certificação A');
  expect(options['Você possui certificações?']).toEqual(['Certificação A','Nenhuma das opções acima.']);
  input.profile.approvedAnswers=[{id:'known',question:'Você possui certificações?',aliases:[],value:'Nenhuma das opções acima.',confirmedAt:new Date().toISOString(),destinationUrl:input.job.url}];
  missing=await fillGupyQuestions(f.page,input,{});
  expect(missing).toEqual(['Autorizo o uso de dados para marketing']);
  expect(await f.page.getByLabel('Nenhuma das opções acima.').isChecked()).toBe(true);
  expect(await f.page.getByLabel('Certificação A').isChecked()).toBe(false);
 }finally{await f.close();}
});
