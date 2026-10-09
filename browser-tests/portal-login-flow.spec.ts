import { test, expect } from "@playwright/test";
import "./live-health";
import { zipSync, strToU8 } from "fflate";

import { requestHeaders as headers } from "./request-headers";
test("login preserva campos em falhas, acompanha código e confirma apenas a conta autenticada", async ({
  page,
}) => {
  const password = "Portal-flow-QA-123";
  let registered = false;
  let phase = "login";
  let attempts = 0;
  let codeSent = false;
  let refreshes = 0;
  const field = (
    index: number,
    key: string,
    type: string,
    label: string,
    autocomplete: string,
  ) => ({
    index,
    key: key.repeat(64),
    type,
    label,
    autocomplete,
    required: true,
    hasValue: false,
  });
  const frame = () => ({
    image: "/login-video-poster.png",
    width: 1024,
    height: 720,
    address: "www.linkedin.com/login",
    authenticated: phase === "ready",
    blocked: false,
    fields:
      phase === "login"
        ? [
            field(0, "a", "email", "E-mail", "username"),
            field(1, "b", "password", "Senha", "current-password"),
          ]
        : phase === "code"
          ? [field(0, "c", "text", "Código de verificação", "one-time-code")]
          : [],
  });
  try {
    expect(
      (
        await page.request.post("/api/auth/register", {
          headers,
          data: {
            name: "Pessoa QA",
            email: `login-flow-${Date.now()}@example.test`,
            password,
          },
        })
      ).status(),
    ).toBe(200);
    registered = true;
    const docx = zipSync({
      "word/document.xml": strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Desenvolvedor Full Stack C# .NET Angular SQL Server.</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    const resume = await page.request.post("/api/resumes", {
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
    expect(resume.status()).toBe(200);
    expect(
      (
        await page.request.put("/api/interview", {
          headers,
          data: {
            step: 4,
            answers: {
              resumeId: (await resume.json()).id,
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
    // Permission and portal pages are controlled fixtures; no live browser integration is advertised.
    await page.route("**/api/automation/sites*", route => route.fulfill({ json: [{ id: "linkedin", name: "LinkedIn", connectable: true, connected: false, automatic: false, discovery: false, authMethod: "authorized-browser" }] }));
    await page.route("**/api/connections/linkedin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/action")) {
        const action = route.request().postDataJSON();
        if (action.type === "submit") {
          attempts++;
          if (attempts === 1)
            return route.fulfill({
              status: 503,
              json: { error: "Falha temporária de conexão." },
            });
          if (phase === "login") {
            expect(
              action.fields.map((item: { key: string }) => item.key),
            ).toEqual(["a".repeat(64), "b".repeat(64)]);
            phase = "code";
          } else codeSent = true;
        }
        if (action.type === "refresh") {
          refreshes++;
          if (codeSent) phase = "ready";
        }
      }
      return route.fulfill({
        json:
          path.endsWith("/confirm") || path.endsWith("/close")
            ? { ok: true }
            : frame(),
      });
    });
    await page.goto("/app#preferencias");
    await page
      .locator(".connection-list")
      .getByRole("button", { name: "Conectar", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("E-mail", { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Confirmar conexão", exact: true }),
    ).toHaveCount(0);
    await dialog
      .getByLabel("E-mail", { exact: true })
      .fill("candidate@example.test");
    await dialog.getByLabel("Senha", { exact: true }).fill("fixture-password");
    await dialog
      .getByRole("button", { name: "Mostrar senha", exact: true })
      .click();
    await expect(dialog.getByLabel("Senha", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await dialog
      .getByRole("button", { name: "Ocultar senha", exact: true })
      .click();
    await page.waitForTimeout(3500);
    expect(refreshes).toBe(0);
    await expect(dialog.getByLabel("Senha", { exact: true })).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Continuar no site", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("Falha temporária");
    await expect(dialog.getByLabel("E-mail", { exact: true })).toHaveValue(
      "candidate@example.test",
    );
    await expect(dialog.getByLabel("Senha", { exact: true })).toHaveValue(
      "fixture-password",
    );
    await dialog
      .getByRole("button", { name: "Continuar no site", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Código de verificação", { exact: true }),
    ).toHaveValue("");
    await dialog
      .getByLabel("Código de verificação", { exact: true })
      .fill("123456");
    await dialog
      .getByRole("button", { name: "Continuar no site", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Confirmar conexão", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator(".portal-login-fields")).toHaveCount(0);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/connection-ready-${width}.png`,
        fullPage: true,
      });
    }
    await dialog
      .getByRole("button", { name: "Confirmar conexão", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  } finally {
    await page.unroute("**/api/connections/linkedin/**");
    if (registered)
      expect(
        (
          await page.request.delete("/api/account", {
            headers,
            data: { password },
          })
        ).status(),
      ).toBe(200);
  }
});
