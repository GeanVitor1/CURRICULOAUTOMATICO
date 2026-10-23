import { installGupyFixture, type GupyFixtureOptions } from "./fixtures/gupy";
import { beforeAll, afterAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  applyOnPage,
  authenticated,
  type PortalApplication,
} from "../server/portal-application";
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
