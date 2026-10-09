import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let dir = "";
let sessions: typeof import("../server/portal-sessions");
let db: typeof import("../server/db");
let blockedFixture = false;
let stepFixture = false;
let buttonFixture = false;
let codeFixture = false;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "portal-session-test-"));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.PORTAL_CONNECTIONS_ENABLED;
  process.env.PORTAL_BROWSER_AUTHORIZED = "linkedin,gupy,glassdoor,infojobs";
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, "launch").mockImplementation(async (options) => {
    const browser = await launch(options);
    const createContext = browser.newContext.bind(browser);
    vi.spyOn(browser, "newContext").mockImplementation(async (options) => {
      const context = await createContext(options);
      const createPage = context.newPage.bind(context);
      vi.spyOn(context, "newPage").mockImplementation(async () => {
        const page = await createPage();
        // All page traffic is fulfilled locally. No candidate credentials or applications leave this test.
        await page.route("**/*", async (route) => {
          if (blockedFixture)
            return route.fulfill({
              status: 403,
              contentType: "text/html",
              body: "<h1>Humans only</h1>",
            });
          if (codeFixture)
            return route.fulfill({
              contentType: "text/html; charset=utf-8",
              body: '<form><label>Conta<input readonly value="candidate@example.test"></label><label>Código de verificação<input name="otp" autocomplete="one-time-code" required></label><button>Verificar</button></form>',
            });
          const signed = (await context.cookies()).some(
            (c) =>
              c.name === "candidate_session" &&
              c.value === "private-fixture-token",
          );
          const stage = (await context.cookies()).some(
            (c) => c.name === "fixture_stage",
          );
          if (buttonFixture && !signed)
            return route.fulfill({
              contentType: "text/html",
              body: `<form onsubmit="event.preventDefault()"><label>Email<input type="email"></label><label>Senha<input type="password"></label><button type="button" onclick="document.cookie='candidate_session=private-fixture-token; Secure; SameSite=Lax; path=/';location.href='/candidates/applications'">Entrar</button></form>`,
            });
          if (stepFixture && !signed && !stage)
            return route.fulfill({
              contentType: "text/html",
              body: `<form onsubmit="event.preventDefault();document.cookie='fixture_stage=1; Secure; SameSite=Lax; path=/';location.reload()"><label>Email<input type="email"></label><button>Continuar</button></form>`,
            });
          return route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: signed
              ? "<h1>Minhas candidaturas</h1><button>Sair</button>"
              : `<form onsubmit="event.preventDefault();document.cookie='candidate_session=private-fixture-token; Secure; SameSite=Lax; path=/';location.href='/candidates/applications'">${stepFixture ? "" : '<label>E-mail<input type="email"></label>'}<label>Senha<input type="password"></label><button>Entrar</button></form>`,
          });
        });
        return page;
      });
      return context;
    });
    return browser;
  });
  sessions = await import("../server/portal-sessions");
  db = await import("../server/db");
}, 30000);
afterAll(async () => {
  await sessions?.closePortalBrowsers();
  await db?.closeDb();
  vi.restoreAllMocks();
  if (dir.startsWith(join(tmpdir(), "portal-session-test-")))
    await rm(dir, { recursive: true, force: true });
});
describe("Sessão nativa autenticada e privada", () => {
  it("abre o formulário sem considerar a página de login como conexão", async () => {
    const frame = await sessions.startPortalLogin("alice", "gupy");
    expect(frame.fields.map((f) => f.label)).toEqual(["E-mail", "Senha"]);
    expect(frame.image).toContain("data:image/jpeg;base64,");
    expect(frame.authenticated).toBe(false);
    expect(frame.fields[0].autocomplete).toBe("username");
    expect(frame.fields[1].autocomplete).toBe("current-password");
    await expect(
      sessions.finishPortalLogin("alice", "gupy", null),
    ).rejects.toThrow("confirmar o login");
    expect(await sessions.connectedPortals("alice")).toEqual([]);
  }, 15000);
  it("confirma login com sinal de conta autenticada e guarda somente sessão cifrada", async () => {
    await sessions.portalLoginAction("alice", "gupy", {
      type: "fill",
      index: 0,
      value: "alice@example.test",
    });
    await sessions.portalLoginAction("alice", "gupy", {
      type: "fill",
      index: 1,
      value: "not-a-real-password",
    });
    await sessions.portalLoginAction("alice", "gupy", {
      type: "key",
      value: "Enter",
    });
    await sessions.finishPortalLogin("alice", "gupy", "resume-alice");
    expect(await sessions.connectedPortals("alice")).toEqual(["gupy"]);
    expect(await sessions.readyPortals("alice", "resume-alice")).toEqual([
      "gupy",
    ]);
    expect(await sessions.readyPortals("alice", "new-resume")).toEqual([]);
    const files = await readdir(join(dir, "portal-sessions"));
    const encrypted = await readFile(
      join(
        dir,
        "portal-sessions",
        files.find((f) => f.endsWith(".enc"))!,
      ),
      "utf8",
    );
    expect(encrypted).not.toContain("private-fixture-token");
    expect(encrypted).not.toContain("not-a-real-password");
    expect(encrypted).not.toContain("alice@example.test");
    const status = await sessions.connectionStatuses("alice");
    expect(status.find((s) => s.id === "gupy")?.profileResumeId).toBe(
      "resume-alice",
    );
    expect(JSON.stringify(status)).not.toContain("private-fixture-token");
  }, 15000);
  it("outro usuário não acessa a conexão ou a janela da pessoa", async () => {
    expect(await sessions.connectedPortals("bob")).toEqual([]);
    await expect(
      sessions.portalLoginAction("bob", "gupy", { type: "refresh" }),
    ).rejects.toThrow("expirou");
    await sessions.disconnectPortal("bob", "gupy");
    expect(await sessions.connectedPortals("alice")).toEqual(["gupy"]);
  });
  it("restaura a sessão após fechar o navegador e remove a sessão ao desconectar", async () => {
    await sessions.closePortalBrowsers();
    const frame = await sessions.startPortalLogin("alice", "gupy");
    expect(frame.fields).toHaveLength(0);
    expect(frame.authenticated).toBe(true);
    expect(frame.address).toContain("/candidates/applications");
    await sessions.finishPortalLogin("alice", "gupy", "resume-alice");
    await sessions.deletePortalConnections("alice");
    expect(await sessions.connectedPortals("alice")).toEqual([]);
    expect(await readdir(join(dir, "portal-sessions"))).toEqual([]);
  }, 15000);
  for (const portal of ["linkedin", "gupy", "glassdoor", "infojobs"] as const) {
    it(`${portal}: envia o formulário junto e reutiliza o login sem pedir senha novamente`, async () => {
      const user = `fixture-${portal}`;
      const first = await sessions.startPortalLogin(user, portal);
      expect(first.authenticated).toBe(false);
      const next = await sessions.portalLoginAction(user, portal, {
        type: "submit",
        fields: [
          { index: 0, value: "candidate@example.test" },
          { index: 1, value: "fixture-password" },
        ],
      });
      expect(next.authenticated).toBe(true);
      await sessions.finishPortalLogin(user, portal, null);
      const reused = await sessions.startPortalLogin(user, portal);
      expect(reused.authenticated).toBe(true);
      expect(reused.fields).toHaveLength(0);
      await sessions.cancelPortalLogin(user, portal);
      await sessions.disconnectPortal(user, portal);
    }, 20000);
  }
  it("acompanha email e senha em etapas separadas, como no InfoJobs", async () => {
    stepFixture = true;
    try {
      const first = await sessions.startPortalLogin("steps", "infojobs");
      expect(first.fields).toHaveLength(1);
      const password = await sessions.portalLoginAction("steps", "infojobs", {
        type: "submit",
        fields: [{ index: 0, value: "candidate@example.test" }],
      });
      expect(password.fields).toHaveLength(1);
      expect(password.fields[0].type).toBe("password");
      expect(password.authenticated).toBe(false);
      const done = await sessions.portalLoginAction("steps", "infojobs", {
        type: "submit",
        fields: [{ index: 0, value: "fixture-password" }],
      });
      expect(done.authenticated).toBe(true);
    } finally {
      stepFixture = false;
      await sessions.cancelPortalLogin("steps", "infojobs");
    }
  }, 20000);
  it("explica bloqueio do portal sem considerar a conta conectada", async () => {
    blockedFixture = true;
    try {
      const frame = await sessions.startPortalLogin("blocked", "glassdoor");
      expect(frame.blocked).toBe(true);
      expect(frame.notice).toContain("bloqueou");
      expect(frame.authenticated).toBe(false);
      expect(await sessions.connectedPortals("blocked")).toEqual([]);
    } finally {
      blockedFixture = false;
      await sessions.cancelPortalLogin("blocked", "glassdoor");
    }
  }, 15000);
  it("usa o botão do formulário quando Enter não envia o login", async () => {
    buttonFixture = true;
    try {
      const first = await sessions.startPortalLogin("button", "linkedin");
      const done = await sessions.portalLoginAction("button", "linkedin", {
        type: "submit",
        fields: first.fields.map((f) => ({
          index: f.index,
          key: f.key,
          value:
            f.type === "password"
              ? "fixture-password"
              : "candidate@example.test",
        })),
      });
      expect(done.authenticated).toBe(true);
    } finally {
      buttonFixture = false;
      await sessions.cancelPortalLogin("button", "linkedin");
    }
  }, 15000);
  it("não preenche campos com uma identidade antiga ou alterada", async () => {
    const first = await sessions.startPortalLogin("stale", "gupy");
    try {
      await expect(
        sessions.portalLoginAction("stale", "gupy", {
          type: "submit",
          fields: [
            {
              index: 0,
              key: first.fields[0].key,
              value: "candidate@example.test",
            },
            { index: 1, key: "0".repeat(64), value: "fixture-password" },
          ],
        }),
      ).rejects.toThrow("formulário mudou");
      const after = await sessions.portalLoginAction("stale", "gupy", {
        type: "refresh",
      });
      expect(after.fields.every((field) => !field.hasValue)).toBe(true);
      expect(after.authenticated).toBe(false);
    } finally {
      await sessions.cancelPortalLogin("stale", "gupy");
    }
  }, 15000);
  it("reconhece código de verificação e exclui campos de leitura", async () => {
    codeFixture = true;
    try {
      const first = await sessions.startPortalLogin("code", "infojobs");
      expect(first.fields).toHaveLength(1);
      expect(first.fields[0]).toMatchObject({
        autocomplete: "one-time-code",
        inputMode: "numeric",
        required: true,
        hasValue: false,
      });
    } finally {
      codeFixture = false;
      await sessions.cancelPortalLogin("code", "infojobs");
    }
  }, 15000);
  it("uma sessão antiga fica expirada sem expor cookies nem habilitar envio", async () => {
    const first = await sessions.startPortalLogin("expired", "gupy");
    await sessions.portalLoginAction("expired", "gupy", {
      type: "submit",
      fields: first.fields.map((field) => ({
        index: field.index,
        key: field.key,
        value:
          field.type === "password"
            ? "fixture-password"
            : "fixture@example.test",
      })),
    });
    await sessions.finishPortalLogin("expired", "gupy", "resume-fixture");
    const timestamp = Date.now();
    try {
      vi.spyOn(Date, "now").mockReturnValue(timestamp + 13 * 3600000);
      const statuses = await sessions.connectionStatuses("expired");
      expect(statuses.find((status) => status.id === "gupy")).toMatchObject({
        sessionState: "expired",
        sessionSaved: true,
        connected: false,
      });
      expect(await sessions.readyPortals("expired", "resume-fixture")).toEqual(
        [],
      );
      expect(JSON.stringify(statuses)).not.toContain("private-fixture-token");
    } finally {
      vi.mocked(Date.now).mockRestore();
      await sessions.disconnectPortal("expired", "gupy");
    }
  }, 15000);
});
