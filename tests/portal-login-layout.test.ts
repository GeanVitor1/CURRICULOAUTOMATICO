import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { fitLinkedInVerification } from "../server/portal-login-layout";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1024, height: 720 },
  });
  // Entirely synthetic frames; no real CAPTCHA is loaded or solved.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    let body: string;
    if (url.hostname === "verification.example.test")
      body = `<style>html,body{margin:0;height:100%;overflow:hidden}section{position:absolute;top:50%;transform:translateY(-50%);width:302px;height:590px;background:#dce8f4}</style><section>Verification layout fixture<footer style="padding-top:500px">Bottom controls</footer></section>`;
    else if (url.pathname === "/checkpoint/inner")
      body = `<style>body{margin:0}</style><iframe src="https://verification.example.test/widget" width="302" height="150" style="border:0"></iframe>`;
    else
      body = `<h1>Verification page fixture</h1><div id="wrapper" style="height:150px;overflow:hidden"><iframe id="captcha-internal" src="https://www.linkedin.com/checkpoint/inner" style="border:0" width="302" height="150"></iframe></div>`;
    await route.fulfill({ contentType: "text/html", body });
  });
  page = await context.newPage();
});
afterAll(async () => {
  await browser?.close();
});

it("expande o frame e seu contêiner sem mudar a verificação", async () => {
  await page.goto("https://www.linkedin.com/checkpoint/challenge/fixture");
  const outer = page.locator("#captcha-internal");
  expect((await outer.boundingBox())!.height).toBe(150);
  await fitLinkedInVerification(page);
  const height = (await outer.boundingBox())!.height;
  expect(height).toBeGreaterThanOrEqual(590);
  expect(
    (await page.locator("#wrapper").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(height);
  const widget = page
    .frames()
    .find((frame) => frame.url().includes("verification.example.test"))!;
  expect(await widget.locator("footer").isVisible()).toBe(true);
  const controls = (await widget.locator("footer").boundingBox())!;
  const bounds = (await outer.boundingBox())!;
  expect(controls.y).toBeGreaterThanOrEqual(bounds.y);
  expect(controls.y + controls.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await fitLinkedInVerification(page);
  expect((await outer.boundingBox())!.height).toBe(height);
  expect(page.url()).toBe(
    "https://www.linkedin.com/checkpoint/challenge/fixture",
  );
});

it("preserva frames fora da página de verificação do LinkedIn", async () => {
  for (const url of [
    "https://www.linkedin.com/uas/login",
    "https://login.gupy.io/checkpoint/challenge/fixture",
  ]) {
    await page.goto(url);
    await fitLinkedInVerification(page);
    expect(
      (await page.locator("#captcha-internal").boundingBox())!.height,
    ).toBe(150);
  }
});
