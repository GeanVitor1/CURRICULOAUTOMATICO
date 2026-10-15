import { test, expect } from "@playwright/test";

test("navegador remoto transmite cliques e teclado em ordem, exige confirmação e não instala conector", async ({
  page,
}) => {
  const viewerId = "01234567-1234-4234-8234-012345678901";
  const actions: any[] = [];
  let signed = false;
  let confirmed = false;
  let closed = 0;
  let finishClose: (() => void) | undefined;
  const frame = () => ({
    viewerId,
    image: "/login-video-poster.png",
    width: 1024,
    height: 720,
    address: "login.gupy.io/candidates/signin",
    authenticated: signed,
    blocked: false,
    notice: "",
  });
  await page.route("**/api/auth/me*", (route) =>
    route.fulfill({
      json: { id: "fixture", name: "Pessoa", email: "fixture@example.test" },
    }),
  );
  await page.route("**/api/workspace?**", (route) =>
    route.fulfill({
      json: {
        profile: { confirmed: true },
        resumes: [{ id: "resume-1", approved: true }],
        interview: {
          completed: true,
          answers: { resumeId: "resume-1", sites: ["gupy"] },
        },
        routine: { enabled: false },
        applications: [],
        runs: [],
      },
    }),
  );
  await page.route("**/api/connections/gupy/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith("/open")) {
      expect(body).toEqual({ remoteBrowserConsent: true });
      return route.fulfill({ json: frame() });
    }
    expect(route.request().headers()["x-portal-viewer"]).toBe(viewerId);
    if (path.endsWith("/close")) {
      closed++;
      await new Promise<void>((resolve) => {
        finishClose = resolve;
      });
      return route.fulfill({ json: { ok: true } });
    }
    if (path.endsWith("/confirm")) {
      expect(signed).toBe(true);
      expect(body).toEqual({
        authorizeAutomation: true,
        profileResumeId: "resume-1",
      });
      confirmed = true;
      return route.fulfill({ json: { ok: true, automatic: true } });
    }
    actions.push(body);
    if (body.type === "key" && body.value === "Enter") signed = true;
    return route.fulfill({ json: frame() });
  });
  await page.goto("/app?portal=gupy");
  await expect(
    page.getByText(/Esta conexão não é uma autorização oficial/),
  ).toBeVisible();
  await expect(
    page.locator("input[type=email],input[type=password]"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Abrir navegador remoto", exact: true })
    .click();
  const confirm = page.getByRole("button", {
    name: "Conectar e iniciar envios",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  const image = page.getByRole("img", { name: /Página do Gupy/ });
  await image.click({ position: { x: 100, y: 80 } });
  await page.keyboard.insertText("fixture@example.test");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("fixture-password");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Login confirmado pelo portal", { exact: true }),
  ).toBeVisible();
  expect(
    actions.filter((a) => a.type !== "refresh").map((a) => a.type),
  ).toEqual(["click", "text", "key", "text", "key"]);
  expect(actions.filter((a) => a.type === "text").map((a) => a.value)).toEqual([
    "fixture@example.test",
    "fixture-password",
  ]);
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(confirm).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "Conta conectada", exact: true }),
  ).toBeVisible();
  expect(confirmed).toBe(true);
  await page.goto("/app?portal=gupy");
  expect(closed).toBe(0);
  signed = false;
  await page.clock.install();
  await page
    .getByRole("button", { name: "Abrir navegador remoto", exact: true })
    .click();
  await expect(image).toBeVisible();
  const beforeClosing = actions.length;
  await page
    .getByRole("button", { name: "Cancelar conexão", exact: true })
    .click();
  await expect.poll(() => closed).toBe(1);
  await page.clock.fastForward(15000);
  expect(actions.length).toBe(beforeClosing);
  finishClose?.();
});
