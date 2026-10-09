import { test, expect } from "@playwright/test";
import "./live-health";
import { zipSync, strToU8 } from "fflate";
import { mkdir } from "node:fs/promises";
import { requestHeaders as headers } from "./request-headers";

test("currículo, entrevista persistida, quatro abas e automação com os critérios da pessoa", async ({
  page,
}) => {
  test.setTimeout(120000);
  const password = "Simple-career-QA-123";
  let registered = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    expect(
      (
        await page.request.post("/api/auth/register", {
          headers,
          data: {
            name: "Pessoa QA",
            email: `simple-${Date.now()}@example.test`,
            password,
          },
        })
      ).status(),
    ).toBe(200);
    registered = true;
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Sua automação", exact: true }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav.getByRole("button")).toHaveCount(4);
    await expect(nav).not.toContainText(
      /Radar|Fontes|Análises|Perfil profissional/,
    );
    await page
      .getByRole("button", { name: "Enviar currículo", exact: true })
      .click();
    const text =
      "RESUMO PROFISSIONAL\nAnalista de Sistemas e Desenvolvedor Full Stack com C#, .NET, Angular e SQL Server.\nCOMPETÊNCIAS TÉCNICAS\nC#, .NET, ASP.NET Core, Angular, TypeScript, SQL Server, Entity Framework, APIs REST, Docker, Azure e Git.\nArquitetura: Clean Architecture, Repository Pattern e Unit of Work.\nEXPERIÊNCIA PROFISSIONAL\nAnalista de Sistemas | 2025 - Atual\nDesenvolvimento full stack e integrações com Protheus.\nSistema com múltiplos perfis (aluno, professor, recepção e financeiro).";
    const docx = zipSync({
      "word/document.xml": strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
          .split("\n")
          .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
          .join("")}</w:body></w:document>`,
      ),
    });
    await page
      .getByLabel("Escolha seu currículo", { exact: true })
      .setInputFiles({
        name: "curriculo-qa.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from(docx),
      });
    await page
      .getByRole("button", { name: "Enviar e continuar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Quais cargos você quer procurar?" }),
    ).toBeVisible();
    const choices = page.locator(".interview-choices").getByRole("button");
    for (const option of await choices.all()) {
      const title = (await option.innerText()).trim();
      expect(title).toMatch(/Desenvolvedor|Analista de sistemas/);
      const selected = (await option.getAttribute("aria-pressed")) === "true";
      if (selected !== (title === "Desenvolvedor .NET")) await option.click();
    }
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Como você quer trabalhar?" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Como você quer trabalhar?" }),
    ).toBeVisible();
    await page.getByLabel("Em qual cidade você mora?").fill("Ilhéus, BA");
    await expect(
      page.getByRole("button", { name: "Remoto", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await mkdir("artifacts", { recursive: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (
        await page
          .getByRole("button", { name: "Fechar mensagem", exact: true })
          .isVisible()
      )
        await page
          .getByRole("button", { name: "Fechar mensagem", exact: true })
          .click();
      await page.screenshot({
        path: `artifacts/interview-simple-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Salário mínimo por mês (R$)", { exact: true })
      .fill("5000");
    await expect(
      page.getByLabel("Pode considerar vagas sem salário anunciado"),
    ).toBeChecked();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page
      .getByLabel("Quando a vaga deve ter sido publicada?")
      .selectOption("365");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    for (const site of ["LinkedIn", "Gupy", "Glassdoor", "InfoJobs"])
      await expect(
        page
          .locator(".interview-sites")
          .getByRole("button", { name: site, exact: true }),
      ).toBeVisible();
    await page
      .locator(".interview-sites")
      .getByRole("button", { name: "LinkedIn", exact: true })
      .click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Podemos começar?" }),
    ).toBeVisible();
    await expect(page.locator(".interview-availability")).toContainText(
      "envio automático ainda não está disponível",
    );
    await page
      .getByRole("button", { name: "Iniciar busca e preparação", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sua automação", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).runs[0]
            ?.status,
        { timeout: 60000 },
      )
      .toBe("completed");
    const w = await (await page.request.get("/api/workspace")).json();
    expect(w.interview.completed).toBe(true);
    expect(w.profile.confirmed).toBe(true);
    expect(w.resumes[0].approved).toBe(true);
    expect(w.filters).toMatchObject({
      titles: ["Desenvolvedor .NET"],
      modalities: ["Remoto"],
      locations: ["Ilhéus, BA"],
      remoteAnywhere: true,
      salaryMin: 5000,
      salaryOnly: false,
      dateKnownOnly: false,
    });
    expect(
      w.sources
        .filter((site: any) => site.enabled)
        .map((site: any) => site.board),
    ).toEqual(["gupy"]);
    expect(w.routine).toMatchObject({ enabled: true, mode: "approval" });
    expect(
      w.applications.every(
        (application: any) => !application.submittedAt && !application.receipt,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Ver vagas encontradas", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Vagas encontradas", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Publicação", { exact: true }).selectOption("1");
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).filters
            .ageDays,
      )
      .toBe(1);
    await page
      .getByLabel("Modalidade", { exact: true })
      .selectOption("Presencial");
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).filters
            .modalities[0],
      )
      .toBe("Presencial");
    const listed = await (
      await page.request.get("/api/jobs?pageSize=100")
    ).json();
    expect(
      listed.items.every(
        (job: any) =>
          job.modality === "Presencial" &&
          job.location.includes("Ilhéus") &&
          Date.now() - Date.parse(job.publishedAt) < 86400000,
      ),
    ).toBe(true);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/filters-simple-${width}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});
