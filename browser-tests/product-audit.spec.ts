import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Public UI checks stay independent of accounts and external providers.
  await page.route("**/api/auth/me?*", (route) =>
    route.fulfill({ status: 401, json: { error: "Sem sessão" } }),
  );
});

test("páginas públicas dispensam consultas privadas e o login consulta a sessão", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/me" || path === "/api/workspace")
      privateRequests.push(path);
  });
  await page.goto("/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Você controla seus dados.",
  );
  await page.waitForLoadState("networkidle");
  expect(privateRequests).toEqual([]);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Bom ter você de volta." }),
  ).toBeVisible();
  expect(privateRequests).toEqual(["/api/auth/me"]);
});

test("etapas e organização oferecem navegação completa por teclado", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const steps = page.getByRole("tablist", {
    name: "Como funciona",
    exact: true,
  });
  const first = steps.getByRole("tab", { name: /Configure sua direção/ });
  const second = steps.getByRole("tab", { name: /Inicie a busca/ });
  const third = steps.getByRole("tab", { name: /Acompanhe os resultados/ });
  await first.focus();
  await first.press("ArrowDown");
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(first).toHaveAttribute("tabindex", "-1");
  await expect(
    page.getByRole("tabpanel", { name: /Inicie a busca/ }),
  ).toContainText("Buscando oportunidades");
  await second.press("End");
  await expect(third).toBeFocused();
  await third.press("Home");
  await expect(first).toBeFocused();
  await first.press("ArrowUp");
  await expect(third).toBeFocused();

  const organization = page.getByRole("tablist", {
    name: "Visualizar organização",
  });
  const organized = organization.getByRole("tab", {
    name: "Tudo organizado",
    exact: true,
  });
  const before = organization.getByRole("tab", { name: "Antes", exact: true });
  await organized.focus();
  await organized.press("ArrowLeft");
  await expect(before).toBeFocused();
  await expect(before).toHaveAttribute("aria-selected", "true");
  const panelId = await before.getAttribute("aria-controls");
  await expect(page.locator(`#${panelId}`)).toHaveAttribute("role", "tabpanel");
});

test("prévia de organização alterna sozinha, preserva o layout e permite comparação manual", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const panel = page.locator("#organization-preview");
    await panel.waitFor();
    await panel.evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "start" }),
    );
    const cards = panel.locator(".organization-cards");
    await expect(cards).toHaveAttribute("data-organization-state", "before");
    const height = await panel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await expect(cards).toHaveAttribute("data-organization-state", "after", {
      timeout: 7000,
    });
    await expect(panel).toContainText("Seu perfil pronto");
    await expect(panel.locator(".organization-card-content").first()).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(panel.locator(".organization-card").last()).toHaveCSS(
      "transform",
      "none",
    );
    await panel.screenshot({
      path: `artifacts/organization-animated-after-${width}.png`,
    });
    expect(
      Math.abs(
        (await panel.evaluate(
          (element) => element.getBoundingClientRect().height,
        )) - height,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(cards).toHaveAttribute("data-organization-state", "before", {
      timeout: 7000,
    });
    await expect(panel).toContainText("Será que enviei?");
    await expect(panel.locator(".organization-card-content").last()).toHaveCSS(
      "opacity",
      "1",
    );
    await panel.screenshot({
      path: `artifacts/organization-animated-before-${width}.png`,
    });
    const after = page.getByRole("tab", {
      name: "Tudo organizado",
      exact: true,
    });
    await after.click();
    await expect(cards).toHaveAttribute("data-organization-state", "after");
    await page.waitForTimeout(5100);
    await expect(cards).toHaveAttribute("data-organization-state", "after");
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(5100);
    await expect(cards).toHaveAttribute("data-organization-state", "after");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("menu mobile fecha com Escape e devolve o foco", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  const open = page.getByRole("button", { name: "Abrir menu", exact: true });
  await open.click();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("link", { name: "Como funciona", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(open).toBeFocused();
  await expect(nav).toBeHidden();
});

test("prévia de modalidade fecha com Escape, clique externo e seleção", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.locator(".morph-select > button");
  await trigger.click();
  await expect(
    page
      .locator("#preview-modalities")
      .getByRole("button", { name: "Presencial", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page
    .getByRole("heading", { name: "Trabalho bom é o que cabe na sua vida." })
    .click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("button", { name: "Remoto", exact: true }).click();
  await expect(trigger).toContainText("Remoto");
  await expect(trigger).toBeFocused();
});

test("página pública mantém leitura e layout em seis resoluções sem animar em movimento reduzido", async ({
  page,
}) => {
  const errors: string[] = [];
  const gifs: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.resourceType() === "image" &&
      /\.gif(?:\?|$)/.test(request.url())
    )
      gifs.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1", {
      timeout: 100,
    });
    await expect(page.locator(".hero-visual")).toHaveCSS("opacity", "1", {
      timeout: 100,
    });
    await expect(page.locator(".hero-mascot")).toHaveAttribute(
      "src",
      "/novogifcapa-poster.png",
    );
    for (const section of await page.locator(".landing main > section").all()) {
      await section.scrollIntoViewIfNeeded();
      await expect(section).toHaveCSS("opacity", "1");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".landing-nav").scrollIntoViewIfNeeded();
    if (width === 375 || width === 1440) {
      await page.screenshot({
        path: `artifacts/product-public-viewport-${width}.png`,
      });
      await page.screenshot({
        path: `artifacts/product-public-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
  expect(gifs).toEqual([]);
});
