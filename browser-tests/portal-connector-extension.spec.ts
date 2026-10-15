import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { portalConnectorId } from "../shared/portal-connector";
import { validatePortalState } from "../server/portal-session-import";
import { createWorkspace } from "../server/workspace";
import type { Resume } from "../shared/types";
test("conector real só compartilha o portal escolhido após autorização, sem senha ou sessão Google", async () => {
  const dir = await mkdtemp(join(tmpdir(), "empregatos-connector-"));
  const extension = join(dir, "extension");
  await cp(resolve("browser-connector"), extension, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  expect(manifest.permissions).not.toContain("cookies");
  // Test-only copy pre-grants the native browser prompt. Production keeps optional permissions.
  manifest.permissions = manifest.optional_permissions;
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_permissions;
  delete manifest.optional_host_permissions;
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(join(dir, "profile"), {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    await context.route("http://127.0.0.1:4173/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<h1>Trusted app fixture</h1>",
      }),
    );
    await context.route("https://login.gupy.io/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: '<h1>Portal fixture</h1><input type="password" value="fixture-password-must-not-transfer">',
      }),
    );
    await context.addCookies([
      {
        name: "candidate_session",
        value: "fixture-gupy-session",
        domain: "login.gupy.io",
        path: "/",
        secure: true,
        httpOnly: true,
      },
      {
        name: "google_session",
        value: "fixture-google-must-not-transfer",
        domain: "accounts.google.com",
        path: "/",
        secure: true,
        httpOnly: true,
      },
    ]);
    const portal = await context.newPage();
    await portal.goto("https://login.gupy.io/candidates/applications");
    await portal.evaluate(() => {
      localStorage.setItem("accessToken", "fixture-token");
      localStorage.setItem("password", "fixture-password-must-not-transfer");
    });
    await portal.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("firebaseLocalStorageDb", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("firebaseLocalStorage", {
              keyPath: "fbase_key",
            });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("firebaseLocalStorage", "readwrite");
            tx.objectStore("firebaseLocalStorage").put({
              fbase_key: "firebase:authUser:fixture",
              value: { accessToken: "fixture-firebase-token" },
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    const app = await context.newPage();
    await app.goto("http://127.0.0.1:4173/");
    const ping = await app.evaluate(
      (id) =>
        new Promise((resolve) =>
          (window as any).chrome.runtime.sendMessage(
            id,
            { type: "empregatos:ping" },
            resolve,
          ),
        ),
      portalConnectorId,
    );
    expect(ping).toEqual({ version: 1 });
    const opened = context.waitForEvent("page");
    await app.evaluate((id) => {
      (window as any).connectorResult = null;
      (window as any).chrome.runtime.sendMessage(
        id,
        { type: "empregatos:connect", portal: "gupy" },
        (result: unknown) => {
          (window as any).connectorResult = result;
        },
      );
    }, portalConnectorId);
    const popup = await opened;
    await popup.waitForURL(/^chrome-extension:/);
    await expect(
      popup.getByRole("button", { name: "Autorizar conexão", exact: true }),
    ).toBeDisabled();
    expect(
      await app.evaluate(() => (window as any).connectorResult),
    ).toBeNull();
    await popup.getByRole("checkbox").check();
    await popup
      .getByRole("button", { name: "Autorizar conexão", exact: true })
      .click();
    await expect
      .poll(() => app.evaluate(() => (window as any).connectorResult?.ok), {
        timeout: 15000,
      })
      .toBe(true);
    const result = await app.evaluate(() => (window as any).connectorResult);
    expect(validatePortalState("gupy", result.state).cookies).toHaveLength(1);
    expect(JSON.stringify(result)).toContain("fixture-gupy-session");
    expect(JSON.stringify(result)).not.toContain(
      "fixture-google-must-not-transfer",
    );
    expect(JSON.stringify(result)).not.toContain(
      "fixture-password-must-not-transfer",
    );
    expect(result.state.origins[0].localStorage).toEqual([
      { name: "accessToken", value: "fixture-token" },
    ]);
    expect(
      result.state.origins[0].indexedDB[0].stores[0].records[0].value.value
        .accessToken,
    ).toBe("fixture-firebase-token");
    await expect(popup.getByRole("status")).toContainText("Volte ao painel");
    await popup.close();
    // Now exercise the built product UI with the same real extension. Backend traffic is
    // controlled locally; the separate API/service tests verify validation and real receipts.
    const workspace = createWorkspace("Pessoa QA", "fixture@example.test");
    workspace.profile.confirmed = true;
    workspace.resumes = [
      { id: "fixture-resume", name: "curriculo.pdf", approved: true } as Resume,
    ];
    workspace.interview = {
      completed: true,
      step: 5,
      answers: {
        resumeId: "fixture-resume",
        titles: ["Desenvolvedor"],
        modalities: ["Remoto"],
        city: "",
        sameCityOnly: false,
        salaryMin: 0,
        salaryMax: 0,
        includeUnknownSalary: true,
        ageDays: 7,
        contracts: [],
        sites: ["gupy"],
        dailyLimit: 5,
      },
    };
    if (workspace.onboarding) workspace.onboarding.completed = true;
    let imported = false;
    await context.route("http://127.0.0.1:4173/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/")) {
        let json: unknown = {};
        if (url.pathname === "/api/auth/me")
          json = {
            id: "fixture",
            name: "Pessoa QA",
            email: "fixture@example.test",
          };
        if (url.pathname === "/api/workspace") json = workspace;
        if (url.pathname === "/api/billing")
          json = { name: "Gratuito", remainingToday: 5, dailyLimit: 5 };
        if (url.pathname === "/api/antigravity")
          json = { available: false, connected: false };
        if (url.pathname === "/api/automation/sites")
          json = [
            {
              id: "gupy",
              name: "Gupy",
              externalLoginOnly: true,
              sessionImportAvailable: true,
              automatic: imported,
              connected: imported,
            },
          ];
        if (url.pathname === "/api/connections/gupy/import") {
          const payload = route.request().postDataJSON();
          expect(payload.authorizeAutomation).toBe(true);
          expect(payload.profileResumeId).toBe("fixture-resume");
          expect(
            validatePortalState("gupy", payload.state).cookies,
          ).toHaveLength(1);
          imported = true;
          workspace.routine.enabled = true;
          workspace.routine.mode = "automatic";
          json = { ok: true, automatic: true };
        }
        return route.fulfill({ json });
      }
      const dist = resolve("dist"),
        file = resolve(
          dist,
          url.pathname === "/app" || url.pathname === "/"
            ? "index.html"
            : "." + decodeURIComponent(url.pathname),
        );
      if (!file.startsWith(dist)) return route.abort();
      const contentType =
        (
          {
            ".js": "application/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".woff2": "font/woff2",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
          } as Record<string, string>
        )[extname(file)] || "application/octet-stream";
      const body = await readFile(file).catch(() => null);
      return route.fulfill({
        status: body ? 200 : 404,
        contentType,
        body: body || "",
      });
    });
    await app.goto("http://127.0.0.1:4173/app#automacao");
    await app.getByText("Contas dos sites", { exact: true }).click();
    await app
      .getByRole("button", { name: "Conectar com a automação", exact: true })
      .click();
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("status")).toContainText(
      "Conector instalado",
    );
    await expect(
      dialog.getByRole("button", {
        name: "Autorizar conexão e envios",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    const nextWindow = context.waitForEvent("page");
    await dialog
      .getByRole("button", { name: "Autorizar conexão e envios", exact: true })
      .click();
    const approval = await nextWindow;
    await approval.waitForURL(/^chrome-extension:/);
    expect(imported).toBe(false);
    await approval.getByRole("checkbox").check();
    await approval
      .getByRole("button", { name: "Autorizar conexão", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(imported).toBe(true);
    await expect(
      app.getByRole("heading", { name: "Envio automático ativo", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    if (dir.startsWith(join(tmpdir(), "empregatos-connector-")))
      await rm(dir, { recursive: true, force: true });
  }
});
