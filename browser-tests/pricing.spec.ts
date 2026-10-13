import { test, expect } from "@playwright/test";
import { requestHeaders } from "./request-headers";

test("planos na página inicial são legíveis no computador e celular", async ({
  page,
}) => {
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/#planos");
    const section = page.locator("#planos");
    await expect(
      section.getByRole("heading", {
        name: "Comece grátis. Amplie suas oportunidades.",
      }),
    ).toBeVisible();
    await expect(section.getByRole("article")).toHaveCount(3);
    for (const value of ["5", "50", "100"])
      await expect(section.getByText(value, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await section.screenshot({ path: `artifacts/plans-${width}.png` });
  }
});
test("escolher plano leva à conta e mostra confirmação segura antes da cobrança", async ({
  page,
}) => {
  const password = "Pricing-QA-12345";
  let registered = false;
  try {
    await page.goto("/#planos");
    await page
      .getByRole("link", { name: "Escolher Essencial", exact: true })
      .click();
    await expect(page).toHaveURL(/\/register/);
    const registeredResponse = await page.request.post("/api/auth/register", {
      headers: requestHeaders,
      data: {
        name: "Pricing QA",
        email: `pricing-${Date.now()}@example.test`,
        password,
      },
    });
    expect(registeredResponse.status()).toBe(200);
    registered = true;
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "Seu plano e assinatura" }),
    ).toBeVisible();
    await expect(
      page.getByText("Você escolheu o plano Essencial.", { exact: false }),
    ).toBeVisible();
    await expect(
      page
        .locator(".billing-summary")
        .getByText("Até 5 candidaturas automáticas por dia", { exact: true }),
    ).toBeVisible();
    const summary = await page.request.get("/api/billing");
    expect((await summary.json()).plan).toBe("free");
    for (const width of [1024, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("region", { name: "Assinatura" })
        .screenshot({ path: `artifacts/plans-account-${width}.png` });
    }
  } finally {
    if (registered)
      expect(
        (
          await page.request.delete("/api/account", {
            headers: requestHeaders,
            data: { password },
          })
        ).status(),
      ).toBe(200);
  }
});
