import { test, expect } from "@playwright/test";
import "./live-health";
import { zipSync, strToU8 } from "fflate";
import { requestHeaders as headers } from "./request-headers";
test("a pessoa abre o login real dentro das preferências e o login vazio continua pendente", async ({
  page,
}) => {
  test.setTimeout(120000);
  const password = "Portal-login-QA-123";
  let registered = false;
  try {
    expect(
      (
        await page.request.post("/api/auth/register", {
          headers,
          data: {
            name: "Pessoa QA",
            email: `connection-${Date.now()}@example.test`,
            password,
          },
        })
      ).status(),
    ).toBe(200);
    registered = true;
    const capabilities = await (await page.request.get("/api/automation/sites")).json();
    test.skip(!capabilities.find((site: any) => site.id === "linkedin")?.connectable,
      "Acesso real por navegador exige autorização do LinkedIn configurada. OAuth de identidade não concede essa permissão.");
    const docx = zipSync({
      "word/document.xml": strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Desenvolvedor Full Stack C# .NET Angular SQL Server APIs REST e Docker.</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    const uploaded = await page.request.post("/api/resumes", {
      headers,
      multipart: {
        file: {
          name: "curriculo.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from(docx),
        },
      },
    });
    expect(uploaded.status()).toBe(200);
    expect(
      (
        await page.request.put("/api/interview", {
          headers,
          data: {
            step: 4,
            answers: {
              resumeId: (await uploaded.json()).id,
              titles: ["Desenvolvedor .NET"],
              modalities: ["Remoto"],
              city: "Ilhéus, BA",
              sameCityOnly: true,
              salaryMin: 0,
              salaryMax: 0,
              includeUnknownSalary: true,
              ageDays: 7,
              contracts: [],
              sites: ["linkedin"],
              dailyLimit: 5,
            },
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/app#preferencias");
    await expect(
      page.getByRole("heading", {
        name: "Em quais sites você quer se candidatar?",
      }),
    ).toBeVisible();
    await page
      .locator(".connection-list")
      .getByRole("button", { name: "Conectar", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Conectar LinkedIn" }),
    ).toBeVisible();
    await expect(dialog.locator(".portal-login-fields input")).toHaveCount(2, {
      timeout: 40000,
    });
    await dialog
      .getByText("Abrir janela do site para verificação", { exact: true })
      .click();
    await expect(
      dialog.getByAltText("Janela interativa do site escolhido"),
    ).toBeVisible();
    await dialog
      .getByText("Abrir janela do site para verificação", { exact: true })
      .click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/connection-login-${width}.png`,
        fullPage: true,
      });
    }
    await expect(
      dialog.getByRole("button", { name: "Confirmar conexão", exact: true }),
    ).toHaveCount(0);
    const unconfirmed = await page.request.post(
      "/api/connections/linkedin/confirm",
      { headers, data: {} },
    );
    expect(unconfirmed.ok()).toBe(false);
    expect(await unconfirmed.text()).toContain("confirmar o login");
    const sites = await (
      await page.request.get("/api/automation/sites")
    ).json();
    expect(sites.find((s: any) => s.id === "linkedin").connected).toBe(false);
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  } finally {
    if (registered) {
      await page.request.post("/api/connections/linkedin/close", { headers });
      expect(
        (
          await page.request.delete("/api/account", {
            headers,
            data: { password },
          })
        ).status(),
      ).toBe(200);
    }
  }
});
