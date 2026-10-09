import { test, expect, type Page } from "@playwright/test";
import { createWorkspace } from "../server/workspace";
import { defaultProfile, type Job } from "../shared/types";

async function fixture(page: Page) {
  const w = createWorkspace("Pessoa QA", "qa@example.test");
  w.intelligence = {
    provider: "gemini",
    model: "gemini-2.5-flash",
    enabled: true,
    consent: true,
    keyConfigured: true,
    geminiConfigured: true,
  };
  let loggedIn = true;
  const mutations: { path: string; body: any }[] = [];
  const allJobs: Job[] = Array.from({ length: 65 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Vaga ${index}`,
    company: `Empresa ${index}`,
    source: "Importação manual",
    url: "",
    description:
      "Oportunidade para atendimento ao público e organização de documentos.",
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
    publishedAt: null,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    origins: [],
    demo: false,
    match: {
      score: 0,
      blockers: [],
      strengths: [],
      gaps: [],
      confidence: "insufficient",
      radar: false,
      explanation: "",
    } as any,
  }));
  w.jobs = allJobs.slice(0, 8);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me")
      return route.fulfill({
        status: loggedIn ? 200 : 401,
        json: loggedIn
          ? { id: "qa-user", name: "Pessoa QA", email: "qa@example.test" }
          : { error: "Sessão expirada" },
      });
    if (!loggedIn)
      return route.fulfill({ status: 401, json: { error: "Sessão expirada" } });
    if (route.request().method() === "GET") {
      if (url.pathname === "/api/workspace") return route.fulfill({ json: w });
      if (url.pathname === "/api/automation/sites")
        return route.fulfill({
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
        });
      if (url.pathname === "/api/jobs") {
        const search = url.searchParams.get("search") || "";
        const jobs = allJobs.filter(
          (job) =>
            job.title.includes(search) &&
            !w.applications.some((a) => a.jobId === job.id),
        );
        const pageNumber = Number(url.searchParams.get("page") || 1);
        return route.fulfill({
          json: {
            items: jobs.slice((pageNumber - 1) * 50, pageNumber * 50),
            total: jobs.length,
            page: pageNumber,
            pageSize: 50,
          },
        });
      }
      return route.fulfill({
        status: 404,
        json: { error: "Rota de fixture não utilizada" },
      });
    }
    const body = route.request().postDataJSON();
    mutations.push({ path: url.pathname, body });
    if (url.pathname === "/api/intelligence")
      Object.assign(w.intelligence!, body);
    if (url.pathname === "/api/routine") Object.assign(w.routine, body);
    if (url.pathname === "/api/applications/manual") {
      const at = new Date().toISOString();
      w.applications.push({
        id: "manual-qa",
        jobId: body.jobId,
        status: "Enviada",
        submittedAt: at,
        createdAt: at,
        updatedAt: at,
        mode: "manual",
        note: body.note,
        resumeId: null,
        receipt: null,
        history: [],
      });
      w.jobs.push(allJobs.find((job) => job.id === body.jobId)!);
    }
    return route.fulfill({ json: { ok: true } });
  });
  return {
    w,
    allJobs,
    mutations,
    expire: () => {
      loggedIn = false;
    },
  };
}

test("revoga autorização de IA e mantém o controle em currículo e conta", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/app#curriculo");
  const consent = page.getByRole("checkbox", {
    name: "Permitir análise dos dados profissionais por IA",
  });
  await expect(consent).toBeChecked();
  await consent.uncheck();
  await expect(consent).not.toBeChecked();
  expect(
    data.mutations.find((mutation) => mutation.path === "/api/intelligence")
      ?.body,
  ).toMatchObject({ enabled: false, consent: false });
  await page.goto("/app#conta");
  await expect(
    page.getByRole("checkbox", {
      name: "Permitir análise dos dados profissionais por IA",
    }),
  ).not.toBeChecked();
  await page.setViewportSize({ width: 375, height: 1000 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((element) => element.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page
    .getByRole("button", { name: "Fechar mensagem", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/qa-fixed-ai-375.png",
    fullPage: true,
  });
});

test("mantém pausa disponível quando o currículo muda e quando a consulta dos sites falha", async ({
  page,
}) => {
  const data = await fixture(page);
  data.w.resumes = [
    {
      id: "new",
      name: "novo.pdf",
      text: "Currículo para revisão",
      skills: [],
      analysis: "Currículo ainda não confirmado",
      approved: false,
      uploadedAt: new Date().toISOString(),
    },
  ];
  data.w.interview = {
    step: 5,
    completed: true,
    answers: {
      resumeId: "old",
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
  data.w.routine.enabled = true;
  data.w.routine.mode = "automatic";
  await page.route("**/api/automation/sites?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Consulta indisponível" } }),
  );
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/app#automacao");
  await expect(
    page.getByRole("button", { name: "Pausar", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "artifacts/qa-fixed-pause-375.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect.poll(() => data.w.routine.enabled).toBe(false);
  expect(
    data.mutations.find((mutation) => mutation.path === "/api/routine")?.body,
  ).toMatchObject({ enabled: false, mode: "automatic" });
});

test("registro manual pesquisa vagas fora do resumo e abre o formulário de importação", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/app#candidaturas");
  await page
    .getByRole("button", { name: "Registrar candidatura", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Empresa 49 · Vaga 49", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Empresa 64 · Vaga 64", exact: true }),
  ).toHaveCount(1);
  await page
    .getByLabel("Oportunidade", { exact: true })
    .selectOption(data.allJobs[64].id);
  await page
    .getByLabel("Data do envio", { exact: true })
    .fill(
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    );
  await page
    .getByRole("checkbox", {
      name: "Confirmo que enviei esta candidatura no processo oficial.",
    })
    .check();
  await page
    .getByRole("button", { name: "Registrar envio", exact: true })
    .click();
  await expect.poll(() => data.w.applications.length).toBe(1);
  await expect(
    page.getByRole("cell", { name: "Vaga 64 Empresa 64" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar candidatura", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar uma vaga", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Adicionar uma oportunidade" }),
  ).toBeVisible();
});

test("sessão expirada durante a consulta do workspace volta ao login", async ({
  page,
}) => {
  const data = await fixture(page);
  data.w.routine.enabled = true;
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Sua automação", exact: true }),
  ).toBeVisible();
  data.expire();
  await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: "Bom ter você de volta." }),
  ).toBeVisible();
  await page.getByText("E-mail", { exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "E-mail", exact: true }),
  ).toBeFocused();
});
