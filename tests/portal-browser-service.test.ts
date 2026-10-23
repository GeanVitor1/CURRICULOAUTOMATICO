import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortalBrowserService } from "../server/portal-browser-service";
import { defaultProfile } from "../shared/types";
import * as applicationEngine from "../server/portal-application";
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
              ? "<h1>Desenvolvedor</h1><button>Sair</button><button onclick=\"location.href='/receipt'\">Candidatar-se</button>"
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
it("verifica sessão do Chrome sem salvar ou liberar envios antes da confirmação", async () => {
  const isolated = await mkdtemp(join(tmpdir(), "cloud-portal-test-"));
  const imported = new PortalBrowserService("gupy", isolated);
  const state = {cookies:[{name:"candidate_session",value:"fixture-import",domain:"login.gupy.io",path:"/",expires:-1,httpOnly:true,secure:true as const,sameSite:"Lax" as const}],origins:[]};
  try {
    const frame = await imported.execute({op:"import-browser-session",browserSession:state}) as any;
    expect(frame.authenticated).toBe(true);
    expect(frame.viewerId).toBeTruthy();
    expect(await imported.metadata()).toBeNull();
    await imported.execute({op:"confirm",viewerId:frame.viewerId,resumeId:"resume-chrome"});
    expect(await imported.metadata()).toMatchObject({profileResumeId:"resume-chrome"});
    expect((await readFile(join(isolated,'session.enc'))).toString()).not.toContain('fixture-import');
    await expect(imported.execute({op:"import-browser-session",browserSession:{cookies:[],origins:[]}})).rejects.toThrow();
    expect(await imported.metadata()).toMatchObject({profileResumeId:"resume-chrome"});
  } finally { await imported.close(); await rm(isolated,{recursive:true,force:true}); }
}, 20000);
it("não conecta uma sessão expirada ou aceita credenciais do Google", async () => {
  const imported = new PortalBrowserService("gupy", directory);
  const cookie = {name:"unrelated",value:"fake",domain:"login.gupy.io",path:"/",expires:-1,httpOnly:true,secure:true as const,sameSite:"Lax" as const};
  try {
    await expect(imported.execute({op:"import-browser-session",browserSession:{cookies:[cookie],origins:[]}})).rejects.toThrow("não foi aceito");
    await expect(imported.execute({op:"import-browser-session",browserSession:{cookies:[{...cookie,domain:"accounts.google.com"}],origins:[]}})).rejects.toThrow();
  } finally { await imported.close(); }
}, 20000);
it("salva login cifrado, restaura a sessão e não repete a candidatura após reiniciar", async () => {
  const obsolete = (await service.execute({ op: "open" })) as any;
  const mobile = (await service.execute({
    op: "open",
    viewportWidth: 375,
  })) as any;
  expect(mobile.width).toBe(375);
  expect(mobile.height).toBe(720);
  const first = (await service.execute({ op: "open" })) as any;
  expect(first.viewerId).not.toBe(obsolete.viewerId);
  for (const op of ["action", "confirm", "close"]) {
    await expect(
      service.execute({
        op,
        viewerId: obsolete.viewerId,
        action: { type: "refresh" },
      }),
    ).rejects.toThrow("substituída");
    expect(service.isBusy()).toBe(false);
  }
  expect(first.authenticated).toBe(false);
  expect(await service.metadata()).toBeNull();
  let liveImages = 0;
  const stopLive = await service.startLive(
    first.viewerId,
    (image) => {
      expect(image).toMatch(/^data:image\/(jpeg|png);base64,/);
      liveImages++;
    },
    () => {},
    () => {},
  );
  await service.liveInput(first.viewerId, { type: "key", value: "Tab" });
  await service.liveInput(first.viewerId, {
    type: "text",
    value: "live-fixture@example.test",
  });
  await expect.poll(() => liveImages).toBeGreaterThan(0);
  await stopLive();
  await expect(
    service.liveInput(obsolete.viewerId, { type: "text", value: "not-used" }),
  ).rejects.toThrow("substituída");
  await expect(
    service.execute({ op: "confirm", viewerId: first.viewerId }),
  ).rejects.toThrow("login ainda");
  const frame = (await service.execute({
    op: "action",
    viewerId: first.viewerId,
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
  await service.execute({
    op: "confirm",
    resumeId: "resume-1",
    viewerId: first.viewerId,
  });
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

it("retoma uma pausa segura após respostas novas e mantém o recibo sem repetir envio", async () => {
  const run = vi
    .spyOn(applicationEngine, "applyOnPage")
    .mockResolvedValueOnce({
      status: "action_required",
      message: "Resposta pendente",
      retryable: true,
      missingQuestions: ["PJ?"],
    })
    .mockResolvedValueOnce({
      status: "sent",
      message: "Confirmada",
      receipt: "gupy-resumed-receipt",
    });
  const resumed = new PortalBrowserService("gupy", directory);
  const request = {
    op: "apply",
    resumeId: "resume-1",
    input: {
      applicationId: "resume-after-answer",
      job: {
        url: "https://login.gupy.io/jobs/12345",
        title: "Desenvolvedor",
        company: "Fixture",
      },
      profile: defaultProfile,
      resume: { name: "resume.pdf" },
    },
  };
  try {
    expect(((await resumed.execute(request)) as any).status).toBe(
      "action_required",
    );
    const result = await resumed.execute(request);
    expect(result).toMatchObject({
      status: "sent",
      receipt: "gupy-resumed-receipt",
    });
    expect(
      await new PortalBrowserService("gupy", directory).execute(request),
    ).toEqual(result);
    expect(run).toHaveBeenCalledTimes(2);
  } finally {
    run.mockRestore();
    await resumed.close();
  }
}, 15000);

it("uma tentativa com resultado desconhecido não pode ser repetida ao reiniciar", async () => {
  const run = vi
    .spyOn(applicationEngine, "applyOnPage")
    .mockResolvedValue({ status: "unknown", message: "Confira no portal" });
  const pending = new PortalBrowserService("gupy", directory);
  const request = {
    op: "apply",
    resumeId: "resume-1",
    input: {
      applicationId: "unknown-result",
      job: {
        url: "https://login.gupy.io/jobs/12345",
        title: "Desenvolvedor",
        company: "Fixture",
      },
      profile: defaultProfile,
      resume: { name: "resume.pdf" },
    },
  };
  try {
    expect(((await pending.execute(request)) as any).status).toBe("unknown");
    expect(
      (
        (await new PortalBrowserService("gupy", directory).execute(
          request,
        )) as any
      ).status,
    ).toBe("unknown");
    expect(run).toHaveBeenCalledOnce();
  } finally {
    run.mockRestore();
    await pending.close();
  }
}, 15000);
