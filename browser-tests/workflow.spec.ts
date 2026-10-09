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
  await page.getByRole("tab", { name: /Descubra vagas reais/ }).click();
  await expect(
    page.getByRole("tabpanel", { name: /Descubra vagas reais/ }),
  ).toContainText("Novas oportunidades");
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
