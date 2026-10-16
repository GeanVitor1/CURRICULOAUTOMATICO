import { test, expect } from "@playwright/test";

for (const fast of [false, true])
  test(`navegador remoto preserva ordem e confirmação (${fast ? "contínuo" : "compatível"})`, async ({
    page,
  }) => {
    const viewerId = "01234567-1234-4234-8234-012345678901";
    const actions: any[] = [];
    let signed = false;
    let confirmed = false;
    let closed = 0;
    let opens = 0;
    let blocked = false;
    let outstanding = 0;
    let peakOutstanding = 0;
    let httpInputs = 0;
    let finishClose: (() => void) | undefined;
    let view = { width: 1024, height: 720 };
    let failNavigation: (() => void) | undefined;
    const frame = () => ({
      viewerId,
      image: "/login-video-poster.png",
      ...view,
      address: "login.gupy.io/candidates/signin",
      authenticated: signed,
      blocked,
      challenge: !signed && !blocked,
      notice: blocked
        ? "O portal bloqueou o acesso."
        : "Verificação do portal. Conclua manualmente na página.",
      live: fast
        ? {
            url: "wss://fixture.vercel.run/live",
            token: "a".repeat(64),
            expiresAt: Date.now() + 60000,
          }
        : undefined,
    });
    if (fast)
      await page.routeWebSocket("wss://fixture.vercel.run/live", (ws) => {
        failNavigation = () =>
          ws.send(
            JSON.stringify({
              type: "status",
              authenticated: false,
              blocked: false,
              notice: "",
              navigationError: "O provedor recusou o acesso neste navegador.",
            }),
          );
        ws.send(JSON.stringify({ type: "ready" }));
        ws.onMessage((raw) => {
          const message = JSON.parse(String(raw));
          actions.push(message.action);
          if (message.action.type === "resize") {
            view = {
              width: message.action.width,
              height: message.action.height,
            };
            ws.send(
              JSON.stringify({
                type: "frame",
                image:
                  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
                ...view,
              }),
            );
          }
          if (message.action.type === "login")
            ws.send(
              JSON.stringify({
                type: "status",
                authenticated: false,
                blocked: false,
                notice: "",
                navigationError: "",
                address: "login.gupy.io/candidates/signin",
              }),
            );
          outstanding++;
          peakOutstanding = Math.max(peakOutstanding, outstanding);
          setTimeout(() => {
            outstanding--;
            try {
              ws.send(JSON.stringify({ type: "ack", id: message.id }));
            } catch {}
          }, 250);
          if (
            message.action.type === "key" &&
            message.action.value === "Enter"
          ) {
            signed = true;
            ws.send(
              JSON.stringify({
                type: "status",
                authenticated: true,
                blocked: false,
                notice: "",
              }),
            );
          }
        });
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
        opens++;
        expect(body.remoteBrowserConsent).toBe(true);
        expect(body.viewportWidth).toBe(
          Math.max(375, Math.min(1600, page.viewportSize()?.width || 1440)),
        );
        view = { width: body.viewportWidth, height: body.viewportHeight };
        expect(body.viewportHeight).toBe(
          Math.min(1000, page.viewportSize()!.height),
        );
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
      if (body.type === "resize")
        view = { width: body.width, height: body.height };
      httpInputs++;
      if (body.type === "key" && body.value === "Enter") signed = true;
      return route.fulfill({ json: frame() });
    });
    await page.goto("/app?portal=gupy");
    await expect(
      page.locator("input[type=email],input[type=password]"),
    ).toHaveCount(0);
    const confirm = page.getByRole("button", {
      name: "Conectar e iniciar envios",
      exact: true,
    });
    const image = page.getByRole("img", { name: /Página do Gupy/ });
    await expect(image).toBeVisible();
    await expect(
      page.getByText("Verificação do portal. Conclua manualmente na página."),
    ).toBeVisible();
    await expect(page.locator(".remote-overlay")).toHaveCount(0);
    expect((await image.boundingBox())?.y).toBe(0);
    expect(opens).toBe(1);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("heading")).toHaveCount(0);
    await expect(confirm).toHaveCount(0);
    if (fast) {
      failNavigation!();
      await expect(
        page.getByText("O provedor recusou o acesso neste navegador."),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Voltar ao login do portal" })
        .click();
      await expect(page.getByRole("button")).toHaveCount(0);
      await expect
        .poll(() => actions.some((a) => a.type === "login"))
        .toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => view.width).toBe(390);
    await expect(image).toHaveAttribute("width", "390");
    const scaled = (await image.boundingBox())!;
    await image.dispatchEvent("wheel", {
      deltaY: 350,
      clientX: scaled.x + scaled.width / 2,
      clientY: scaled.y + scaled.height / 2,
    });
    await expect
      .poll(() => actions.some((a) => a.type === "scroll" && a.delta === 350))
      .toBe(true);
    const scrollAction = actions.find((a) => a.type === "scroll");
    // Browser wheel coordinates are rounded to a CSS pixel before scaling.
    expect(Math.abs(scrollAction.x - 195)).toBeLessThan(390 / scaled.width);
    expect(Math.abs(scrollAction.y - 422)).toBeLessThan(844 / scaled.height);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await expect.poll(() => view.width).toBe(1440);
    await expect(image).toHaveAttribute("width", "1440");
    await image.click({ position: { x: 100, y: 80 } });
    await page.keyboard.insertText("fixture@example.test");
    await page.keyboard.press("Tab");
    await page.keyboard.insertText("fixture-password");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Login confirmado", exact: true }),
    ).toBeVisible();
    expect(
      actions
        .filter(
          (a) => !["refresh", "scroll", "login", "resize"].includes(a.type),
        )
        .map((a) => a.type),
    ).toEqual(["click", "text", "key", "text", "key"]);
    expect(
      actions.filter((a) => a.type === "text").map((a) => a.value),
    ).toEqual(["fixture@example.test", "fixture-password"]);
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
    if (fast) {
      expect(peakOutstanding).toBeGreaterThan(1);
      expect(httpInputs).toBe(0);
    }
    await page.goto("/app?portal=gupy");
    expect(closed).toBe(0);
    signed = false;
    blocked = true;
    await page.clock.install();
    await expect(image).toBeVisible();
    const beforeClosing = actions.length;
    await page
      .getByRole("button", { name: "Fechar janela", exact: true })
      .click();
    await expect.poll(() => closed).toBe(1);
    await page.clock.fastForward(15000);
    expect(actions.length).toBe(beforeClosing);
    finishClose?.();
  });
