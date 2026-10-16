import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { portalAccess } from "../server/portal-access";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

it("permite verificação manual mesmo quando a página de proteção diz Humans only", async () => {
  const page = await browser.newPage();
  try {
    // Local fixture only: no real challenge, provider traffic or answers.
    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<button>Fixture control</button>",
      }),
    );
    await page.setContent(
      '<h1>Humans only</h1><iframe src="https://challenges.cloudflare.com/fixture" style="width:300px;height:80px"></iframe>',
    );
    await expect.poll(() => page.frames().length).toBe(2);
    const result = await portalAccess(page, "Humans only");
    expect(result).toMatchObject({ blocked: false, challenge: true });
    expect(result.notice).toContain("manualmente");
    await page
      .locator("iframe")
      .evaluate((node) => (node.style.display = "none"));
    expect(await portalAccess(page, "Humans only")).toMatchObject({
      blocked: true,
      challenge: false,
    });
  } finally {
    await page.close();
  }
});

it("não confunde iframes comuns com verificação nem libera bloqueio definitivo", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(
      '<h1>Access denied</h1><iframe srcdoc="Fixture"></iframe>',
    );
    expect(await portalAccess(page, "Access denied")).toMatchObject({
      blocked: true,
      challenge: false,
    });
    expect(await portalAccess(page, "Login")).toMatchObject({
      blocked: false,
      challenge: false,
    });
  } finally {
    await page.close();
  }
});
