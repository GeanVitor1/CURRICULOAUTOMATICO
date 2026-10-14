import { test, expect } from "@playwright/test";
import { createWorkspace } from "../server/workspace";

test("connects the cloud CLI through official OAuth without sharing credentials in URLs", async ({
  page,
}) => {
  const w = createWorkspace("Pessoa fictícia", "cloud@example.test");
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: true, dismissed: true, active: false };
  let connected = false;
  let confirmations = 0;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          id: "test-owner",
          name: w.profile.name,
          email: w.profile.email,
        },
      });
    if (path === "/api/workspace") return route.fulfill({ json: w });
    if (path === "/api/auth/providers")
      return route.fulfill({ json: { google: false } });
    if (path === "/api/antigravity/login")
      return route.fulfill({
        json: {
          attempt: "c4a766ba-550c-4918-99a0-0c61c0673073",
          url: "https://accounts.google.com/o/oauth2/auth?state=test",
          expiresAt: Date.now() + 60000,
        },
      });
    if (path === "/api/antigravity/confirm") {
      expect(request.postDataJSON().code).toBe("synthetic-code");
      expect(request.url()).not.toContain("synthetic-code");
      confirmations++;
      connected = true;
      return route.fulfill({ json: { connected: true } });
    }
    if (path === "/api/antigravity")
      return route.fulfill({ json: { available: true, connected } });
    if (path === "/api/billing")
      return route.fulfill({
        json: { plan: "free", remaining: 5, limit: 5, used: 0 },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto("/app#conta");
  const panel = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Antigravity na nuvem",
        exact: true,
      }),
    });
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Conectar conta Google", exact: true })
    .click();
  const login = panel.getByRole("link", { name: "Entrar na conta Google" });
  await expect(login).toHaveAttribute(
    "href",
    /^https:\/\/accounts\.google\.com\//,
  );
  await expect(login).toHaveAttribute("target", "_blank");
  await panel.getByLabel("Código de autorização Google").fill("synthetic-code");
  await panel.getByRole("button", { name: "Confirmar conexão" }).click();
  await expect(
    panel.getByText("Sua conta está conectada.", { exact: false }),
  ).toBeVisible();
  expect(confirmations).toBe(1);
  await expect(panel.getByLabel("Código de autorização Google")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
