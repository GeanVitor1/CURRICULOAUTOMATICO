import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

const widths = [1440, 1280, 768, 430, 375];
const noOverflow = async (page: any) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
const headers = { "X-Orbita-Request": "1", Origin: "http://127.0.0.1:5173" };
test.beforeEach(async ({ page }) => {
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get("/api/health")).ok();
        } catch {
          return false;
        }
      },
      { timeout: 30000 },
    )
    .toBe(true);
});
test("landing pública, interações, rotas e cinco larguras", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("artifacts", { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Encontrar um emprego já dá trabalho",
    );
    await expect(page).toHaveTitle("EmpreGatos · Seu próximo emprego");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      "href",
      "/mascot-original.jpeg",
    );
    await expect(page.locator(".hero-mascot")).toBeVisible();
    await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".hero-visual")).toHaveCSS("opacity", "1");
    for (const section of await page.locator(".landing main>section").all()) {
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveCSS("opacity", "1");
    }
    await page.locator(".profession-list").scrollIntoViewIfNeeded();
    await expect(page.locator(".profession-list>div").last()).toHaveCSS(
      "opacity",
      "1",
    );
    await page.locator(".landing-nav").scrollIntoViewIfNeeded();
    expect(
      await page
        .locator(".hero-mascot")
        .evaluate((img: any) => img.complete && img.naturalWidth > 0),
    ).toBe(true);
    await noOverflow(page);
    await page.screenshot({
      path: `artifacts/landing-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: /Descubra oportunidades/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Encontre o que faz sentido",
  );
  await page.locator(".morph-select>button").click();
  await page.getByRole("button", { name: "Remoto", exact: true }).click();
  await expect(page.locator(".morph-select>button")).toContainText("Remoto");
  await page.getByRole("tab", { name: "Antes", exact: true }).click();
  await expect(page.locator(".organization-visual")).toHaveClass(/dispersed/);
  await page.getByRole("tab", { name: "Tudo organizado", exact: true }).click();
  await expect(page.locator(".organization-visual")).toHaveClass(/organized/);
  await page
    .getByRole("button", {
      name: "E se eu ainda não tiver currículo?",
      exact: true,
    })
    .click();
  await expect(page.locator("#faq-1")).toContainText("PDF");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await noOverflow(page);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Você controla seus dados.",
  );
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Bom ter você de volta.",
  );
  expect(errors).toEqual([]);
});

test("primeiro emprego, onboarding salvo, currículo PDF, temas e páginas internas", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const password = "Browser-QA-private-123";
  let registered = false;
  try {
    await page.goto("/register");
    await page.getByLabel("Seu nome", { exact: true }).fill("Pessoa QA");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill(`qa-${Date.now()}@example.test`);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Criar minha conta", exact: true })
      .click();
    registered = true;
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "O que você procura?", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Cargos ou áreas de interesse")
      .fill("Atendimento, operador de caixa");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Onde você gostaria de trabalhar?",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Onde você gostaria de trabalhar?",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Cidade e estado").fill("Recife, PE");
    await page.getByRole("button", { name: "Presencial", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByRole("button", { name: /Ainda não tenho currículo/ })
      .click();
    await page
      .getByRole("button", { name: "Começar meu currículo", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Vamos começar por você.",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Seu objetivo profissional")
      .fill("Primeiro emprego em atendimento");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Formação e cursos")
      .fill("Ensino médio completo. Escola municipal, 2025.");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Experiências que você quer incluir")
      .fill("Atendimento informal na loja da família.");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Suas habilidades")
      .fill("Atendimento, organização de estoque");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Revisei e confirmo que estas informações são verdadeiras.")
      .check();
    await page
      .getByRole("button", { name: "Criar meu currículo", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Seu currículo está pronto.",
        exact: true,
      }),
    ).toBeVisible();
    const pdfLink = await page
      .getByRole("link", { name: "Baixar meu currículo em PDF" })
      .getAttribute("href");
    const pdf = await page.request.get(pdfLink!);
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const parser = new PDFParse({ data: await pdf.body() });
    try {
      expect((await parser.getText()).text).toContain("Ensino médio completo");
    } finally {
      await parser.destroy();
    }
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Experiências que gostaria de compartilhar")
      .fill("Ainda não trabalhei com carteira assinada.");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "CLT", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Vamos conferir suas preferências?",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Concluir configuração", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Vamos conhecer a EmpreGatos?",
    );
    await page.screenshot({
      path: "artifacts/guide-welcome.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Explorar por conta própria", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Bom ter você aqui, Pessoa.",
        exact: true,
      }),
    ).toBeVisible();
    const workspace = await (await page.request.get("/api/workspace")).json();
    expect(workspace.filters.titles).toEqual([
      "Atendimento",
      "operador de caixa",
    ]);
    expect(workspace.filters.skills).toEqual([]);
    expect(workspace.jobs).toEqual([]);
    expect(workspace.resumes).toHaveLength(1);
    expect(workspace.onboarding.completed).toBe(true);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page);
      await page.screenshot({
        path: `artifacts/dashboard-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Fechar mensagem", exact: true })
      .click();
    await page.getByRole("button", { name: "Ativar tema claro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.screenshot({
      path: "artifacts/dashboard-light.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Ativar tema escuro" }).click();
    for (const label of [
      "Meu currículo",
      "Perfil profissional",
      "Explorar vagas",
      "Candidaturas",
      "Automação",
      "Análises",
      "Notificações",
      "Configurações",
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator("main h1")).toBeVisible();
      await noOverflow(page);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    for (const label of ["Explorar vagas", "Configurações", "Meu currículo"]) {
      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator("main h1")).toBeVisible();
      await noOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Guia de primeiros passos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Quero aprender a usar", exact: true })
      .click();
    const guide = page.getByRole("complementary", {
      name: "Guia de uso passo a passo",
    });
    await expect(guide).toContainText("Prepare seu currículo");
    await page.screenshot({
      path: "artifacts/guide-active.png",
      fullPage: true,
    });
    await guide
      .getByRole("button", { name: "Próxima etapa", exact: true })
      .click();
    await expect(page.locator("main h1")).toHaveText("Perfil profissional");
    await page.reload();
    await expect(guide).toContainText("Confira o que sabemos sobre você");
    for (let i = 1; i < 5; i++)
      await guide
        .getByRole("button", { name: "Próxima etapa", exact: true })
        .click();
    await guide
      .getByRole("button", { name: "Concluir guia", exact: true })
      .click();
    await expect(guide).toHaveCount(0);
    expect(
      (await (await page.request.get("/api/workspace")).json()).guide.completed,
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Configurações", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "1. Escolha onde vamos procurar",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Análise do currículo", exact: true })
      .click();
    await page
      .getByLabel("Como você quer analisar seu currículo?")
      .selectOption("gemini");
    await expect(page.getByLabel("Modelo", { exact: true })).toBeEnabled({
      timeout: 20000,
    });
    await expect(
      page.getByLabel("Usar essa ajuda na análise do currículo"),
    ).toBeDisabled();
    await page.screenshot({
      path: "artifacts/settings-gemini.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Meus dados", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Exportar meus dados", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});
