import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createWorkspace } from "../server/workspace";

async function fixture(page: Page) {
  const w = createWorkspace("Pessoa QA", "fixture@example.test");
  w.profile.confirmed = true;
  w.resumes = [
    {
      id: "fixture-resume",
      name: "Currículo.pdf",
      approved: true,
      uploadedAt: new Date().toISOString(),
      skills: ["Atendimento"],
      text: "Atendimento ao público",
      analysis: "Revisado",
    },
  ];
  w.filters.titles = ["Atendente"];
  w.filters.modalities = ["Remoto"];
  w.interview = {
    completed: true,
    step: 5,
    answers: {
      resumeId: "fixture-resume",
      phone: "",
      titles: ["Atendente"],
      modalities: ["Remoto"],
      city: "",
      sameCityOnly: true,
      salaryMin: 0,
      salaryMax: 0,
      includeUnknownSalary: true,
      ageDays: 365,
      contracts: [],
      sites: ["linkedin", "gupy", "glassdoor", "infojobs"],
      dailyLimit: 5,
    },
  };
  let identity = false;
  let automatic = false;
  let jobs: any[] = [];
  const mutations: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/auth/me")
      return route.fulfill({
        json: {
          id: "fixture-user",
          name: w.profile.name,
          email: w.profile.email,
        },
      });
    if (url.pathname === "/api/workspace") return route.fulfill({ json: w });
    if (url.pathname === "/api/automation/sites")
      return route.fulfill({
        json: [
          {
            id: "linkedin",
            name: "LinkedIn",
            oauthConfigured: true,
            identityConnected: identity,
            connected: false,
            connectable: false,
            automatic: false,
            discovery: false,
            limitation:
              "OAuth identifica sua conta; não libera envio de candidaturas.",
          },
          ...["gupy", "glassdoor", "infojobs"].map((id) => ({
            id,
            name: id,
            discovery: id === "gupy",
            connected: false,
              automatic: automatic && id === "gupy",
            connectable: false,
          })),
        ],
      });
    if (url.pathname === "/api/jobs")
      return route.fulfill({
        json: { items: jobs, total: jobs.length, pageSize: 12 },
      });
    if (url.pathname === "/api/filters") {
      Object.assign(w.filters, route.request().postDataJSON());
      mutations.push(url.pathname);
    }
    if (url.pathname === "/api/routine")
      Object.assign(w.routine, route.request().postDataJSON());
    if (url.pathname === "/api/oauth/linkedin/start")
      return route.fulfill({
        json: {
          url: "https://www.linkedin.com/oauth/v2/authorization?client_id=fixture&state=fixture&scope=openid%20profile%20email",
        },
      });
    if (url.pathname === "/api/connections/linkedin" && method === "DELETE") {
      identity = false;
      mutations.push(url.pathname);
    }
    return route.fulfill({ json: { ok: true } });
  });
  return {
    w,
    mutations,
    setIdentity: (value: boolean) => {
      identity = value;
    },
    supportAutomaticGupy: () => {
      automatic = true;
    },
    setJobs: (value: any[]) => {
      jobs = value;
    },
  };
}
const fits = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

test("comparação altera conteúdo e composição em desktop e mobile", async ({
  page,
}) => {
  await mkdir("artifacts", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByRole("tab", { name: "Antes", exact: true }).click();
    const panel = page.locator("#organization-preview");
    await expect(panel).toContainText("Será que enviei?");
    await expect(panel).toContainText("curriculo_final_v3.pdf");
    await expect(panel).not.toContainText("Seu perfil pronto");
    await panel.screenshot({ path: `artifacts/redesign-before-${width}.png` });
    await page
      .getByRole("tab", { name: "Tudo organizado", exact: true })
      .click();
    await expect(panel).toContainText("Seu perfil pronto");
    await expect(panel).toContainText("Candidatura com recibo");
    await expect(panel).not.toContainText("Será que enviei?");
    await panel.screenshot({ path: `artifacts/redesign-after-${width}.png` });
    await fits(page);
  }
});

test("prévia inicia sozinha, pausa e respeita redução de movimento nas seis etapas", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  const demo = page.locator(".workflow-demo");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-demo-stage", "1", { timeout: 9000 });
  await page
    .getByRole("button", { name: "Pausar demonstração", exact: true })
    .click();
  const stage = await demo.getAttribute("data-demo-stage");
  await page.waitForTimeout(4000);
  await expect(demo).toHaveAttribute("data-demo-stage", stage!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  await expect(demo).toHaveAttribute("data-demo-stage", "0");
  const tabs = page
    .getByRole("tablist", { name: "Como funciona", exact: true })
    .getByRole("tab");
  await expect(tabs).toHaveCount(6);
  for (let stage = 0; stage < 6; stage++) {
    await tabs.nth(stage).click();
    await expect(demo).toHaveAttribute("data-demo-stage", String(stage));
    await expect(demo.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(stage + 1),
    );
    await expect(demo).toContainText("Exemplo ilustrativo");
  }
  await demo.screenshot({ path: "artifacts/redesign-demo-results.png" });
});

test("filtros, select estilizado, salário e cidade funcionam em 320px e desktop", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/app#vagas");
  await page.getByLabel("Modalidade", { exact: true }).selectOption("Híbrido");
  await expect.poll(() => data.w.filters.modalities).toEqual(["Híbrido"]);
  await page.getByLabel("Publicação", { exact: true }).selectOption("3");
  await expect.poll(() => data.w.filters.ageDays).toBe(3);
  await page
    .getByLabel("Cidade para vagas presenciais", { exact: true })
    .fill("São Paulo; Campinas");
  await page
    .getByRole("button", { name: "Aplicar cidade", exact: true })
    .click();
  await expect
    .poll(() => data.w.filters.locations)
    .toEqual(["São Paulo", "Campinas"]);
  await page.locator(".salary-filter summary").click();
  await page.getByLabel("Mínimo mensal (R$)", { exact: true }).fill("2500");
  await page.getByLabel("Mínimo mensal (R$)", { exact: true }).press("Tab");
  await expect.poll(() => data.w.filters.salaryMin).toBe(2500);
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await fits(page);
    await page.screenshot({
      path: `artifacts/redesign-jobs-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect.poll(() => data.w.filters.salaryMin).toBe(0);
  await expect(
    page.getByLabel("Cidade para vagas presenciais", { exact: true }),
  ).toHaveValue("");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Modalidade", { exact: true }).click();
  await page.screenshot({ path: "artifacts/redesign-select-open.png" });
  await page.keyboard.press("Escape");
});

test("falha da fonte aparece como falha; primeira busca e busca em andamento têm estados próprios", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/app#vagas");
  await expect(
    page.getByRole("heading", { name: "Faça sua primeira busca", exact: true }),
  ).toBeVisible();
  data.w.runs = [
    {
      id: "fixture-run",
      at: new Date().toISOString(),
      status: "failed",
      errors: ["Gupy: timeout"],
      message: "Nenhum site pôde ser consultado.",
      discovered: 0,
      processed: 0,
    },
  ];
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "A busca precisa de atenção",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".discovery-status")).toContainText(
    "Gupy: timeout",
  );
  data.w.runs[0].status = "running";
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Estamos consultando suas fontes",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscando…", exact: true }).first(),
  ).toBeDisabled();
});

test("OAuth abre janela oficial sem navegador embutido e autenticação não promete envio", async ({
  page,
  context,
}) => {
  const data = await fixture(page);
  await context.route("https://www.linkedin.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Provedor OAuth simulado para QA</h1>",
    }),
  );
  await page.goto("/app#automacao");
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Conectar LinkedIn", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(
    /^https:\/\/www.linkedin.com\/oauth\/v2\/authorization/,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".portal-screen")).toHaveCount(0);
  await popup.close();
  data.setIdentity(true);
  await page.reload();
  await expect(
    page.getByText("Conta autenticada via OAuth", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ativar envio automático", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Desconectar", exact: true }).click();
  await page
    .getByRole("button", { name: "Desconectar conta", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(data.mutations).toContain("/api/connections/linkedin");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await fits(page);
    await page.screenshot({
      path: `artifacts/redesign-connections-${width}.png`,
      fullPage: true,
    });
  }
});
test("um site sem envio não bloqueia os sites autorizados e a interface informa o alcance", async ({
  page,
}) => {
  const data = await fixture(page);
  data.supportAutomaticGupy();
  await page.goto("/app#automacao");
  await expect(
    page.getByText("Envio automático nas fontes autorizadas", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ativar envio automático", exact: true })
    .click();
  await expect.poll(() => data.w.routine.mode).toBe("automatic");
  await expect(
    page.getByRole("heading", { name: "Envio automático ativo", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".automation-scope")).toContainText(
    "Nesses sites, as candidaturas preparadas ficam pendentes",
  );
});
