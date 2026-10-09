import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createWorkspace } from "../server/workspace";
import type { Job } from "../shared/types";

async function fixture(page: Page, ready = false) {
  const w = createWorkspace("Pessoa de Teste", "pessoa@example.test");
  const at = new Date().toISOString();
  const mutations: { path: string; body: any }[] = [];
  let sitesFail = false;
  let authenticated = true;
  let expireWorkspace = false;
  w.resumes = ["resume-one", "resume-two"].map((id, index) => ({
    id,
    name: `Currículo ${index + 1}.pdf`,
    uploadedAt: at,
    skills: ["Atendimento"],
    text: "Experiência em atendimento ao cliente.",
    approved: ready,
    analysis: "Currículo revisado",
    targets: [
      {
        title: "Atendente",
        reason: "Experiência descrita",
        evidence: "Atendimento",
        caution: "",
      },
    ],
  }));
  w.profile.confirmed = ready;
  w.filters.titles = ["Atendente"];
  w.interview = {
    step: 5,
    completed: ready,
    answers: {
      resumeId: "resume-one",
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
      sites: ["gupy"],
      dailyLimit: 5,
    },
  };
  w.jobs = [0, 1].map(
    (index) =>
      ({
        id: `job-${index}`,
        title: `Atendente ${index + 1}`,
        company: "Empresa Exemplo",
        source: "Gupy",
        url: "",
        description: "Atendimento ao público e organização de documentos.",
        location: "Brasil",
        modality: "Remoto",
        level: "Júnior",
        contract: "CLT",
        salaryMin: null,
        salaryMax: null,
        currency: "BRL",
        skills: [],
        requiredSkills: [],
        requiredYears: null,
        publishedAt: at,
        discoveredAt: at,
        saved: false,
        discarded: false,
        origins: [],
        demo: false,
        match: {
          score: 80,
          blockers: [],
          matchedSkills: [],
          missingSkills: [],
          strengths: [],
          gaps: [],
          confidence: "sufficient",
          radar: false,
          explanation: "Experiência compatível",
        },
      }) as Job,
  );
  w.jobCounts = { total: 2, saved: 0, recommended: 2 };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me")
      return route.fulfill({
        status: authenticated ? 200 : 401,
        json: authenticated
          ? { id: "test-user", name: w.profile.name, email: w.profile.email }
          : { error: "Sessão expirada" },
      });
    if (url.pathname === "/api/workspace") {
      if (expireWorkspace) {
        authenticated = false;
        return route.fulfill({
          status: 401,
          contentType: "text/html",
          body: "Sessão expirada",
        });
      }
      return route.fulfill({ json: w });
    }
    if (url.pathname === "/api/automation/sites")
      return route.fulfill(
        sitesFail
          ? {
              status: 503,
              json: { error: "Consulta temporariamente indisponível" },
            }
          : {
              json: [
                {
                  id: "gupy",
                  name: "Gupy",
                  discovery: true,
                  automatic: false,
                  connected: false,
                  connectable: false,
                },
              ],
            },
      );
    if (url.pathname === "/api/jobs" && route.request().method() === "GET")
      return route.fulfill({ json: { items: w.jobs, total: 2, pageSize: 12 } });
    if (
      url.pathname.startsWith("/api/jobs/") &&
      route.request().method() === "GET"
    )
      return route.fulfill({
        json: w.jobs.find((job) => job.id === url.pathname.split("/").pop()),
      });
    mutations.push({
      path: url.pathname,
      body: route.request().postDataJSON(),
    });
    if (url.pathname === "/api/routine")
      Object.assign(w.routine, mutations.at(-1)!.body);
    if (url.pathname === "/api/filters")
      Object.assign(w.filters, mutations.at(-1)!.body);
    if (url.pathname === "/api/interview")
      Object.assign(w.interview!, mutations.at(-1)!.body);
    return route.fulfill({ json: { ok: true } });
  });
  return {
    w,
    mutations,
    failSites: () => {
      sitesFail = true;
    },
    recoverSites: () => {
      sitesFail = false;
    },
    expire: () => {
      expireWorkspace = true;
    },
    signOut: () => {
      authenticated = false;
    },
  };
}

test("menu mobile protege foco, fecha com Escape e preserva largura a partir de 320px", async ({
  page,
}) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/app#conta");
    await expect(
      page.getByRole("heading", { name: "Minha conta", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toHaveCount(0);
    const trigger = page.getByRole("button", {
      name: "Abrir navegação",
      exact: true,
    });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Navegação", exact: true });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("button", { name: "Minha conta", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await menu
      .getByRole("button", { name: "Sair da conta", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(
      menu.getByRole("button", { name: "Fechar menu", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      menu.getByRole("button", { name: "Sair da conta", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: `artifacts/audit-account-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/audit-account-1440.png",
    fullPage: true,
  });
});

test("upload rejeita tipo, tamanho e arquivo vazio antes de enviar dados", async ({
  page,
}) => {
  const data = await fixture(page);
  data.w.resumes = [];
  await page.goto("/app#curriculo");
  const upload = page.getByLabel("Escolha seu currículo", { exact: true });
  const submit = page.getByRole("button", {
    name: "Enviar e continuar",
    exact: true,
  });
  await upload.setInputFiles({
    name: "curriculo.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText("PDF ou DOCX");
  await expect(submit).toBeDisabled();
  await upload.setInputFiles({
    name: "curriculo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("excede 5 MB");
  await upload.setInputFiles({
    name: "curriculo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByRole("alert")).toContainText("arquivo está vazio");
  await upload.setInputFiles({
    name: "curriculo.PDF",
    mimeType: "application/pdf",
    buffer: Buffer.from("fixture"),
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(submit).toBeEnabled();
  expect(data.mutations).toHaveLength(0);
});

test("dados extensos da conta respeitam 320px sem rolagem horizontal", async ({
  page,
}) => {
  const data = await fixture(page);
  data.w.profile.name = "Nome".repeat(25);
  data.w.profile.email = `${"usuario".repeat(33)}@example.test`;
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/app#conta");
  await expect(
    page.getByRole("heading", { name: "Minha conta", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("falha dos sites oferece recuperação e mantém pausa disponível", async ({
  page,
}) => {
  const data = await fixture(page, true);
  data.w.routine.enabled = true;
  data.failSites();
  await page.goto("/app#automacao");
  await expect(
    page.getByRole("button", { name: "Pausar", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Não conseguimos verificar os sites agora.", {
      exact: false,
    }),
  ).toBeVisible();
  data.recoverSites();
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect.poll(() => data.w.routine.enabled).toBe(false);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width < 780) {
      await expect
        .poll(() =>
          page
            .locator(".sidebar")
            .evaluate((element) => element.getBoundingClientRect().right),
        )
        .toBeLessThanOrEqual(0);
    }
    const dismiss = page.getByRole("button", {
      name: "Fechar mensagem",
      exact: true,
    });
    if (await dismiss.isVisible()) {
      await dismiss.click();
      await expect(dismiss).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/audit-automation-${width}.png`,
      fullPage: true,
    });
  }
});

test("detalhe de outra vaga reinicia a seleção de currículo", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/app#vagas");
  await page.getByRole("button", { name: "Atendente 1", exact: true }).click();
  await page
    .getByLabel("Currículo para esta candidatura", { exact: true })
    .selectOption("resume-two");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Atendente 2", exact: true }).click();
  await expect(
    page.getByLabel("Currículo para esta candidatura", { exact: true }),
  ).toHaveValue("");
});

test("exclusão de conta bloqueia envio duplicado e preserva modal durante solicitação", async ({
  page,
}) => {
  await fixture(page);
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/account?*", async (route) => {
    requests++;
    await pending;
    await route.fulfill({ status: 403, json: { error: "Confira sua senha." } });
  });
  await page.goto("/app#conta");
  await page
    .getByRole("button", { name: "Excluir minha conta", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Excluir minha conta",
    exact: true,
  });
  await page
    .getByLabel("Confirme sua senha", { exact: true })
    .fill("senha-incorreta-123");
  await modal.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => requests).toBe(1);
  await expect(
    page.getByRole("button", { name: "Excluindo…", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  release();
  await expect(modal.getByRole("alert")).toContainText("Confira sua senha");
  await page
    .getByRole("button", { name: "Manter minha conta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Excluir minha conta", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirme sua senha", { exact: true }),
  ).toHaveValue("");
});

test("login vincula senha ao rótulo e impede requisições no mesmo instante", async ({
  page,
}) => {
  const data = await fixture(page);
  data.signOut();
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/login?*", async (route) => {
    requests++;
    await pending;
    await route.fulfill({
      status: 401,
      json: { error: "E-mail ou senha incorretos." },
    });
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("pessoa@example.test");
  const password = page.getByLabel("Senha", { exact: true });
  await password.fill("senha-incorreta-123");
  await page.getByText("Senha", { exact: true }).click();
  await expect(password).toBeFocused();
  await page
    .getByRole("button", { name: "Mostrar senha", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page.locator(".auth-card form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(page.getByRole("alert")).toContainText(
    "E-mail ou senha incorretos",
  );
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeEnabled();
});

test("resposta não JSON com 401 preserva redirecionamento de sessão expirada", async ({
  page,
}) => {
  const data = await fixture(page);
  data.expire();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Bom ter você de volta.", exact: true }),
  ).toBeVisible();
});

test("falha no carregamento de um módulo oferece recuperação e recarrega a tela", async ({
  page,
}) => {
  await fixture(page);
  let fail = true;
  await page.route(
    /\/(?:src\/SimpleAccount\.tsx|assets\/SimpleAccount-[^/]+\.js)(?:\?.*)?$/,
    (route) => (fail ? route.abort("failed") : route.continue()),
  );
  await page.goto("/app#conta");
  await expect(
    page.getByRole("heading", {
      name: "Esta tela não carregou como esperado",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recarregar página", exact: true }),
  ).toBeEnabled();
  fail = false;
  await page
    .getByRole("button", { name: "Recarregar página", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Minha conta", exact: true }),
  ).toBeVisible();
});

test("pesquisa manual reduz consultas durante digitação contínua", async ({
  page,
}) => {
  await fixture(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/jobs" &&
      url.searchParams.get("purpose") === "manual"
    )
      requests.push(url.searchParams.get("search") || "");
  });
  await page.goto("/app#candidaturas");
  await page
    .getByRole("button", { name: "Registrar candidatura", exact: true })
    .click();
  await page
    .getByLabel("Buscar oportunidade para registro", { exact: true })
    .pressSequentially("Atendente", { delay: 20 });
  await expect.poll(() => requests.includes("Atendente")).toBe(true);
  expect(requests).toEqual(["", "Atendente"]);
});

test("limpar filtros atualiza o campo de salário e bloqueia valores negativos", async ({
  page,
}) => {
  const data = await fixture(page, true);
  data.w.filters.salaryMin = 5000;
  await page.goto("/app#vagas");
  await page.locator(".salary-filter summary").click();
  const salary = page.getByLabel("Mínimo mensal (R$)", { exact: true });
  await expect(salary).toHaveValue("5000");
  await salary.fill("-1");
  await page
    .getByRole("textbox", { name: "Buscar vagas", exact: true })
    .focus();
  expect(data.mutations).toHaveLength(0);
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect.poll(() => data.w.filters.salaryMin).toBe(0);
  await expect(salary).toHaveValue("");
  expect(
    data.mutations.filter((request) => request.path === "/api/filters"),
  ).toHaveLength(1);
});

test("entrevista valida o limite diário e impede confirmação duplicada", async ({
  page,
}) => {
  const data = await fixture(page);
  data.w.interview!.answers.dailyLimit = 0;
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/interview?*", async (route) => {
    requests++;
    await pending;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/app#preferencias");
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("limite de 1 a 50");
  expect(requests).toBe(0);
  await page
    .getByLabel("Limite de candidaturas por dia", { exact: true })
    .fill("5");
  const save = page.getByRole("button", {
    name: "Salvar preferências",
    exact: true,
  });
  await save.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect.poll(() => requests).toBe(1);
  await expect(
    page.getByLabel("Limite de candidaturas por dia", { exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("heading", { name: "Sua automação", exact: true }),
  ).toBeVisible();
});
