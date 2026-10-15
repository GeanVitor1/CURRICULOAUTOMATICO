import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv } from "node:crypto";
import { PortalBrowserService } from "../server/portal-browser-service";

vi.mock("../server/portal-browser-policy", async (original) => {
  const actual =
    await original<typeof import("../server/portal-browser-policy")>();
  return {
    ...actual,
    protectBrowser: async (context: import("playwright").BrowserContext) => {
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        const signed = (await context.cookies("https://login.gupy.io")).some(
          (c) => c.name === "candidate_session",
        );
        let body: string;
        if (
          url.hostname === "accounts.google.com" ||
          url.hostname === "www.linkedin.com"
        ) {
          if (url.pathname === "/refused")
            body = "<h1>Este navegador ou app pode não ser seguro</h1>";
          else
            body = `<h1 style="margin:0;height:50px">${url.hostname}</h1><input style="display:block;height:30px" aria-label="Email"><button style="display:block;width:180px;height:60px" onclick="location.href='https://login.gupy.io/callback'">Continuar</button>`;
        } else if (url.pathname === "/callback") {
          await context.addCookies([
            {
              name: "candidate_session",
              value: "portal-only-secret",
              domain: "login.gupy.io",
              path: "/",
              secure: true,
            },
            {
              name: "google_session",
              value: "never-persist-google",
              domain: "accounts.google.com",
              path: "/",
              secure: true,
            },
            {
              name: "linkedin_session",
              value: "never-persist-linkedin",
              domain: ".linkedin.com",
              path: "/",
              secure: true,
            },
          ]);
          body = `<button>Sair</button><h1>Candidaturas</h1><script>if(window.opener){window.opener.location.href='https://login.gupy.io/callback';window.close()}</script>`;
        } else if (signed) body = "<button>Sair</button><h1>Candidaturas</h1>";
        else
          body = `<style>button{display:block;width:180px;height:50px;margin:10px}</style><button onclick="location.href='https://accounts.google.com/signin'">Google</button><button onclick="window.open('https://www.linkedin.com/oauth/v2/authorization')">LinkedIn</button><button onclick="location.href='https://accounts.google.com/refused'">Recusado</button><input aria-label="Email">`;
        await route.fulfill({ contentType: "text/html; charset=utf-8", body });
      });
    },
  };
});
let directory: string;
const browsers: Browser[] = [];
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "portal-social-"));
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, "launch").mockImplementation(async (options) => {
    const browser = await launch(options);
    browsers.push(browser);
    return browser;
  });
});
afterAll(async () => {
  await Promise.all(browsers.map((b) => b.close()));
  vi.restoreAllMocks();
  if (directory.startsWith(join(tmpdir(), "portal-social-")))
    await rm(directory, { recursive: true, force: true });
});
it.each(["google", "linkedin"])(
  "acompanha %s, volta ao portal e salva somente a sessão do candidato",
  async (provider) => {
    const service = new PortalBrowserService("gupy", join(directory, provider));
    const frame = await service.open();
    const statuses: { address?: string; authenticated: boolean }[] = [];
    let images = 0;
    const stop = await service.startLive(
      frame.viewerId,
      () => images++,
      (s) => statuses.push(s),
      () => {},
    );
    try {
      await service.liveInput(frame.viewerId, {
        type: "click",
        x: 70,
        y: provider === "google" ? 30 : 90,
      });
      await expect
        .poll(() => statuses.at(-1)?.address)
        .toContain(
          provider === "google" ? "accounts.google.com" : "www.linkedin.com",
        );
      expect(statuses.at(-1)?.authenticated).toBe(false);
      await service.liveInput(frame.viewerId, { type: "click", x: 80, y: 70 });
      const previous = images;
      await service.liveInput(frame.viewerId, {
        type: "text",
        value: "fixture-only",
      });
      await expect.poll(() => images).toBeGreaterThan(previous);
      const refreshed = await service.action({ type: "refresh" });
      expect(refreshed.address).toContain(
        provider === "google" ? "accounts.google.com" : "www.linkedin.com",
      );
      await service.liveInput(frame.viewerId, { type: "click", x: 80, y: 120 });
      await expect.poll(() => statuses.at(-1)?.authenticated).toBe(true);
      await service.execute({
        op: "confirm",
        viewerId: frame.viewerId,
        resumeId: "resume-fixture",
      });
      const bytes = await readFile(join(directory, provider, "session.enc"));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        await readFile(join(directory, provider, "session.key")),
        bytes.subarray(0, 12),
      );
      decipher.setAuthTag(bytes.subarray(12, 28));
      const saved = Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString();
      expect(saved).toContain("portal-only-secret");
      expect(saved).not.toContain("never-persist-google");
      expect(saved).not.toContain("never-persist-linkedin");
    } finally {
      await stop();
      await service.close();
    }
  },
  20000,
);
it("exibe a recusa do provedor e permite voltar ao login sem encerrar a conexão", async () => {
  const service = new PortalBrowserService("gupy", join(directory, "refused"));
  const frame = await service.open();
  let latest: { address?: string; navigationError?: string } = {};
  const stop = await service.startLive(
    frame.viewerId,
    () => {},
    (s) => {
      latest = s;
    },
    () => {},
  );
  try {
    await service.liveInput(frame.viewerId, { type: "click", x: 70, y: 150 });
    await expect.poll(() => latest.navigationError).toContain("recusou");
    await service.liveInput(frame.viewerId, { type: "login" });
    await expect
      .poll(() => latest.address)
      .toContain("login.gupy.io/candidates/signin");
    expect(latest.navigationError).toBe("");
  } finally {
    await stop();
    await service.close();
  }
}, 15000);

it("recupera a imagem quando o screencast para de entregar frames", async () => {
  const service = new PortalBrowserService("gupy", join(directory, "stalled"));
  const frame = await service.open();
  const context = browsers.at(-1)!.contexts()[0];
  // Simulate a compositor stream that never delivers another frame.
  vi.spyOn(context, "newCDPSession").mockResolvedValue({
    send: async () => ({}),
    on: () => {},
    detach: async () => {},
  } as any);
  let images = 0;
  const stop = await service.startLive(
    frame.viewerId,
    () => images++,
    () => {},
    () => {},
  );
  try {
    await expect.poll(() => images).toBeGreaterThan(0);
    const previous = images;
    await service.liveInput(frame.viewerId, { type: "click", x: 70, y: 30 });
    await expect
      .poll(() => images, { timeout: 4000 })
      .toBeGreaterThan(previous);
    expect((await service.action({ type: "refresh" })).address).toContain(
      "accounts.google.com",
    );
  } finally {
    await stop();
    await service.close();
  }
}, 15000);
