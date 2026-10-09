import { test, expect } from "@playwright/test";
import "./live-health";
import { PDFParse } from "pdf-parse";
import { requestHeaders as headers } from "./request-headers";
test("primeiro emprego cria currículo pelo guia simples e chega à entrevista", async ({
  page,
}) => {
  const password = "First-job-flow-QA-123";
  let registered = false;
  try {
    expect(
      (
        await page.request.post("/api/auth/register", {
          headers,
          data: {
            name: "Pessoa QA",
            email: `first-${Date.now()}@example.test`,
            password,
          },
        })
      ).status(),
    ).toBe(200);
    registered = true;
    await page.goto("/app#curriculo");
    await page
      .getByRole("button", { name: "Ainda não tenho currículo", exact: true })
      .click();
    await page
      .getByLabel("Cidade e estado", { exact: true })
      .fill("Recife, PE");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Seu objetivo profissional", { exact: true })
      .fill("Primeiro emprego em atendimento");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Formação e cursos", { exact: true })
      .fill("Ensino médio completo");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Experiências que você quer incluir", { exact: true })
      .fill("Trabalho informal: atendimento ao público na loja da família.");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Suas habilidades", { exact: true })
      .fill("Atendimento ao público, organização de estoque");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Revisei e confirmo que estas informações são verdadeiras.")
      .check();
    await page
      .getByRole("button", { name: "Criar meu currículo", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Seu currículo está pronto." }),
    ).toBeVisible();
    const w = await (await page.request.get("/api/workspace")).json();
    expect(w.resumes[0].text).toContain("Ensino médio completo");
    const pdf = await page.request.get(
      `/api/resumes/${w.resumes[0].id}/download`,
    );
    const parser = new PDFParse({ data: await pdf.body() });
    try {
      expect((await parser.getText()).text).toContain("atendimento ao público");
    } finally {
      await parser.destroy();
    }
    await page.goto("/app#preferencias");
    await expect(
      page.getByRole("heading", { name: "Quais cargos você quer procurar?" }),
    ).toBeVisible();
    await expect(page.locator(".interview-choices")).toContainText("Atendente");
    for (const width of [1440, 1280, 768, 430, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/app#perfil");
    await expect(
      page.getByRole("heading", { name: "Suas preferências", exact: true }),
    ).toBeVisible();
    await page.goto("/app#analises");
    await expect(
      page.getByRole("heading", { name: "Sua automação", exact: true }),
    ).toBeVisible();
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});
