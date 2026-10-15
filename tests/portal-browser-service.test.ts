import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortalBrowserService } from "../server/portal-browser-service";
import { defaultProfile } from "../shared/types";
let directory = "";
let service: PortalBrowserService;
const browsers: Awaited<ReturnType<typeof chromium.launch>>[] = [];
let submits = 0;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "cloud-portal-test-"));
  const launch = chromium.launch.bind(chromium);
  vi.spyOn(chromium, "launch").mockImplementation(async (options) => {
    const browser = await launch(options);
    browsers.push(browser);
    const create = browser.newContext.bind(browser);
    vi.spyOn(browser, "newContext").mockImplementation(async (options) => {
      const context = await create(options);
      const newPage = context.newPage.bind(context);
      vi.spyOn(context, "newPage").mockImplementation(async () => {
        const page = await newPage();
        // Real Chromium, with all traffic fulfilled locally. No live application or credential is sent.
        await page.route("**/*", async (route) => {
          const signed = (await context.cookies()).some(
            (c) => c.name === "candidate_session",
          );
          if (route.request().url().includes("/receipt")) {
            submits++;
            return route.fulfill({
              contentType: "text/html",
              body: "<button>Sair</button><p>Candidatura realizada</p>",
            });
          }
          return route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: signed
              ? "<button>Sair</button><button onclick=\"location.href='/receipt'\">Candidatar-se</button>"
              : '<form onsubmit="event.preventDefault();document.cookie=\'candidate_session=fixture-private-token; Secure; SameSite=Lax; path=/\';location.href=\'/candidates/applications\'"><label>E-mail<input type="email"></label><label>Senha<input type="password"></label><button>Entrar</button></form>',
          });
        });
        return page;
      });
      return context;
    });
    return browser;
  });
  service = new PortalBrowserService("gupy", directory);
});
afterAll(async () => {
  await service?.close();
  await Promise.all(browsers.map((b) => b.close()));
  vi.restoreAllMocks();
  if (directory.startsWith(join(tmpdir(), "cloud-portal-test-")))
    await rm(directory, { recursive: true, force: true });
});
it("salva login cifrado, restaura a sessão e não repete a candidatura após reiniciar", async () => {
  const first = (await service.execute({ op: "open" })) as any;
  expect(first.authenticated).toBe(false);
  expect(await service.metadata()).toBeNull();
  await expect(service.execute({ op: "confirm" })).rejects.toThrow(
    "login ainda",
  );
  const frame = (await service.execute({
    op: "action",
    action: {
      type: "submit",
      fields: first.fields.map((f: any) => ({
        index: f.index,
        key: f.key,
        value:
          f.type === "password" ? "fixture-password" : "fixture@example.test",
      })),
    },
  })) as any;
  expect(frame.authenticated).toBe(true);
  await service.execute({ op: "confirm", resumeId: "resume-1" });
  expect(await service.metadata()).toMatchObject({
    profileResumeId: "resume-1",
  });
  const encrypted = await readFile(join(directory, "session.enc"), "utf8");
  expect(encrypted).not.toContain("fixture-private-token");
  expect(encrypted).not.toContain("fixture-password");
  expect(JSON.stringify(await service.metadata())).not.toContain(
    "fixture-private-token",
  );
  const request = {
    op: "apply",
    resumeId: "resume-1",
    input: {
      applicationId: "fixture-1",
      job: {
        url: "https://login.gupy.io/jobs/12345",
        title: "Desenvolvedor",
        company: "Fixture",
      },
      profile: {
        ...defaultProfile,
        name: "Pessoa",
        email: "fixture@example.test",
      },
      resume: { name: "resume.pdf" },
    },
  };
  const restored = new PortalBrowserService("gupy", directory);
  const result = (await restored.execute(request)) as any;
  expect(result.status).toBe("sent");
  expect(result.receipt).toContain("Candidatura realizada");
  expect(submits).toBe(1);
  expect(
    await new PortalBrowserService("gupy", directory).execute(request),
  ).toEqual(result);
  expect(submits).toBe(1);
}, 30000);
it("valida sessão importada no portal antes de salvar e confirma uma candidatura sem pedir senha", async () => {
  const imported = new PortalBrowserService(
    "gupy",
    join(directory, "imported"),
  );
  const cookies = [
    {
      name: "candidate_session",
      value: "fixture-imported-token",
      domain: "login.gupy.io",
      path: "/",
      secure: true as const,
      httpOnly: true,
      expires: -1,
      sameSite: "Lax" as const,
    },
  ];
  await imported.execute({
    op: "import",
    resumeId: "import-resume",
    state: { cookies, origins: [] },
  });
  expect(await imported.metadata()).toMatchObject({
    profileResumeId: "import-resume",
  });
  const result = await imported.apply("import-resume", {
    applicationId: "import-fixture",
    job: {
      url: "https://login.gupy.io/jobs/23456",
      title: "Desenvolvedor",
      company: "Fixture",
    },
    profile: {
      ...defaultProfile,
      name: "Pessoa",
      email: "fixture@example.test",
    },
    resume: { name: "resume.pdf" },
  });
  expect(result.status).toBe("sent");
  expect(
    await readFile(join(directory, "imported", "session.enc"), "utf8"),
  ).not.toContain("fixture-imported-token");
  const refused = new PortalBrowserService("gupy", join(directory, "refused"));
  await expect(
    refused.execute({
      op: "import",
      resumeId: "import-resume",
      state: {
        cookies: [{ ...cookies[0], name: "not-authenticated" }],
        origins: [],
      },
    }),
  ).rejects.toThrow("não foi confirmado");
  expect(await refused.metadata()).toBeNull();
}, 20000);
