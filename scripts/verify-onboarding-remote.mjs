import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import {verifyConnectorUi} from './verify-connector-ui-remote.mjs';

const fromBuild = process.env.VERIFY_ONBOARDING_QA === "1";
const webDirectory = fromBuild ? "dist" : "build";
const outputDirectory = fromBuild ? "dist/qa" : ".";
await mkdir(outputDirectory, { recursive: true });
const output = (name) => resolve(outputDirectory, name);
if (!fromBuild)
  await build({
    configFile: false,
    plugins: [react(), tailwindcss()],
    build: { outDir: "build", chunkSizeWarningLimit: 650 },
  });
const entryHtml = await readFile(webDirectory + "/index.html", "utf8");
const blank = JSON.parse(
  await readFile(
    fromBuild ? ".data/onboarding-fixture.json" : "fixture.json",
    "utf8",
  ),
);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"),
    path = decodeURIComponent(url.pathname);
  if(path.startsWith('/qa-extension/')){
    const name=path.slice('/qa-extension/'.length);
    if(!['popup.html','popup.css','popup.js','config.js'].includes(name)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
    return res.end(await readFile(resolve('browser-extension/gupy-session',name)));
  }
  if (!extname(path)) {
    res.setHeader("Content-Type", "text/html");
    return res.end(entryHtml);
  }
  const root = resolve(webDirectory),
    publicRoot = resolve("public"),
    file = resolve(
      path.startsWith("/assets/") || ["/app.js", "/app.css"].includes(path)
        ? root
        : publicRoot,
      "." + path,
    );
  if (!file.startsWith(root + "/") && !file.startsWith(publicRoot + "/")) {
    res.statusCode = 404;
    return res.end();
  }
  try {
    const bytes = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".woff2": "font/woff2",
        ".mp4": "video/mp4",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
let page, browser;
try {
  const launch = { headless: true };
  if (fromBuild) {
    const runtimeRequire = createRequire(
      resolve(".data/onboarding-runtime/package.json"),
    );
    const { default: binary } = await import(
      pathToFileURL(runtimeRequire.resolve("@sparticuz/chromium")).href
    );
    // Multiple QA pages need ordinary renderer processes. The serverless
    // single-process flag can terminate Chromium when a context is closed.
    launch.args = binary.args.filter(arg=>arg!=='--single-process');
    launch.executablePath = await binary.executablePath();
  }
  launch.env=Object.fromEntries(['PATH','HOME','TMPDIR','LD_LIBRARY_PATH','FONTCONFIG_PATH','LANG','TZ'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));
  browser = await chromium.launch(launch);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>{try{localStorage.setItem('orbita-theme','light');}catch{}});
  let logged = false,
    w = structuredClone(blank),userId='synthetic-user',authUnavailable=false;
  const mutations = [],
    external = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (url.origin !== base) {
      external.push(url.hostname);
      return route.abort();
    }
    if (!path.startsWith("/api/")) return route.continue();
    const request = route.request(),
      method = request.method(),
      json = (data) => route.fulfill({ json: data });
    if (method !== "GET") mutations.push(path);
    if (path === "/api/auth/me")
      return authUnavailable?route.fulfill({status:503,json:{error:'Serviço de acesso indisponível no teste.'}}):logged
        ? json({
            id: userId,
            name: w.profile.name,
            email: w.profile.email,
          })
        : route.fulfill({
            status: 401,
            json: { error: "Entre na sua conta." },
          });
    if (path === "/api/auth/register"||path === '/api/auth/login') {
      logged = true;
      return json({
        id: userId,
        name: w.profile.name,
        email: w.profile.email,
      });
    }
    if (path === "/api/workspace") return json(w);
    if (path === "/api/workspace/version") return json({ revision: null });
    if(path==='/api/connections/browser-extension-context')return json({portal:url.searchParams.get('portal'),available:true,mode:'local-browser',notice:'Verificação local de demonstração. Não transfere a sessão.',localLogin:null,account:{id:userId,name:w.profile.name,email:w.profile.email}});
    if (path === "/api/auth/providers" || path === "/api/auth/google/config")
      return json({
        google: false,
        googleSignInUrl: null,
        available: false,
        configured: false,
      });
    if (path === "/api/billing")
      return json({
        plan: "free",
        name: "Gratuito",
        dailyLimit: 5,
        usedToday: 0,
        remainingToday: 5,
        status: "free",
        paymentMode: "unconfigured",
        checkoutAvailable: false,
      });
    if (path === "/api/automation/sites")
      return json(
        ["linkedin", "gupy", "infojobs", "glassdoor"].map((id) => ({
          id,
          name: id === "gupy" ? "Gupy" : id === "linkedin" ? "LinkedIn" : id,
          discovery: true,
          automatic: false,
          connectable: true,
          connected: false,
          independentAutomatic: false,
        })),
      );
    if (path === "/api/resumes" && method === "POST") {
      w.resumes = [
        {
          id: "synthetic-resume",
          name: "curriculo-demonstracao.pdf",
          approved: false,
          text: "Ana de teste\nEnsino médio completo. Organização de documentos e atendimento ao público.",
          skills: ["Atendimento ao público", "Rotinas administrativas"],
          targets: [
            {
              title: "Auxiliar administrativo",
              reason: "Objetivo informado no teste",
              evidence: "Rotinas administrativas",
              caution: "",
            },
          ],
          uploadedAt: new Date().toISOString(),
        },
      ];
      return json(w.resumes[0]);
    }
    if (path === "/api/candidate-details" && method === "PUT") {
      const body = request.postDataJSON();
      Object.assign(w.profile, body, {
        candidateDetailsConfirmedAt: new Date().toISOString(),
        salaryDesired: body.salaryDesired,
      });
      w.infrastructure.candidateDetailsRequired = false;
      return json(w.profile);
    }
    if (path === "/api/interview" && method === "PUT") {
      const body = request.postDataJSON();
      w.interview = {
        step: body.step,
        answers: body.answers,
        completed: !!body.complete,
      };
      if (body.complete) {
        w.profile.confirmed = true;
        w.resumes[0].approved = true;
        w.filters.titles = body.answers.titles;
        w.filters.modalities = body.answers.modalities;
      }
      return json(w);
    }
    if (path === "/api/antigravity")
      return json({ available: false, connected: false, configured: false });
    if (path === "/api/automation/conversion") return json({});
    return json({ available: false, connected: false });
  });
  page = await context.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const noOverflow = async () =>
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Horizontal overflow",
    );
  await page.goto(base + "/register");
  await button("Criar minha conta").waitFor();
  assert.equal(
    await page
      .getByText("Criar a conta não inicia candidaturas.", { exact: true })
      .isVisible(),
    true,
  );
  await page.locator('input[name="name"]').fill("Ana de teste");
  await page.locator('input[name="email"]').fill("demo@example.test");
  await page
    .locator('input[name="password"]')
    .fill("Synthetic-onboarding-only-123");
  await button("Criar minha conta").click();
  await heading("Boas-vindas, Ana!").waitFor();
  assert.equal(await heading("Seus dados para candidaturas").count(), 0);
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Configuração da conta" })
      .getAttribute("aria-valuenow"),
    "0",
  );
  assert.equal(
    await page
      .getByText("Indicadores técnicos da automação", { exact: true })
      .count(),
    0,
  );
  await noOverflow();
  await page.screenshot({
    path: output("onboarding-welcome-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await button("Ativar tema escuro").click();
  await noOverflow();
  await page.screenshot({
    path: output("onboarding-welcome-mobile.png"),
    fullPage: true,
  });
  await button("Como usar o EmpreGatos").click();
  await page.getByRole("dialog").waitFor();
  await noOverflow();
  await page.screenshot({ path: output("onboarding-help-mobile.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await button("Adicionar meu currículo").click();
  await heading("Seu currículo").waitFor();
  assert.equal(await button("Ainda não tenho currículo").isVisible(), true);
  await noOverflow();
  await page.getByLabel("Escolha seu currículo", { exact: true }).setInputFiles({
    name: "curriculo-demonstracao.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 synthetic intercepted fixture"),
  });
  await button("Enviar e continuar").click();
  await heading("Seus dados para candidaturas").waitFor();
  assert.equal(
    await page.getByText("1 de 4 etapas", { exact: true }).isVisible(),
    true,
  );
  await noOverflow();
  await page.screenshot({
    path: output("onboarding-details-mobile.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Cidade e estado onde você mora", { exact: true })
    .fill("Recife, PE");
  await page
    .getByLabel("Telefone com DDD", { exact: true })
    .fill("(11) 99999-0000");
  await page
    .getByLabel("Anos de experiência na área em que deseja trabalhar", {
      exact: true,
    })
    .fill("0");
  await page
    .getByLabel("Ainda não tenho pretensão salarial definida", { exact: true })
    .check();
  await page
    .getByLabel("Você aceita contratação PJ?", { exact: true })
    .selectOption("false");
  await page
    .getByLabel("Remuneração atual ou última e benefícios", { exact: true })
    .selectOption("prefer_not_to_say");
  await page
    .getByLabel(
      "Confirmo que estes dados estão corretos e podem ser usados nas minhas candidaturas.",
      { exact: true },
    )
    .check();
  await button("Salvar e continuar").click();
  await heading("Quais cargos você quer procurar?").waitFor();
  assert.equal(
    await page.getByText("2 de 4 etapas", { exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await page
      .getByText("Outras opções para suas candidaturas", { exact: true })
      .isVisible(),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 1000 });
  await noOverflow();
  await page.screenshot({
    path: output("onboarding-preferences-desktop.png"),
    fullPage: true,
  });
  for (let i = 0; i < 5; i++) await button("Continuar").click();
  await heading("Podemos começar?").waitFor();
  await button("Salvar preferências").click();
  await heading("Sua automação").waitFor();
  assert.equal(await page.locator(".getting-started").count(), 0);
  assert.equal(await page.locator(".setup-progress").count(), 0);
  await noOverflow();
  await page.screenshot({
    path: output("onboarding-complete.png"),
    fullPage: true,
  });
  await page.reload();
  await heading("Sua automação").waitFor();
  assert.equal(await page.locator(".getting-started").count(), 0);

  // Returning from a login keeps the extension's portal, including after
  // switching between registration and login. No real portal is contacted.
  for(const portal of ['gupy','infojobs','glassdoor','linkedin']){
    logged=false;
    await page.goto(base+'/app?portal='+portal);
    await button('Entrar').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/app?portal='+portal);
    await page.locator('.auth-switch').click();
    await button('Criar minha conta').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/app?portal='+portal);
    await page.locator('.auth-switch').click();
    await button('Entrar').waitFor();
    await page.locator('input[name="email"]').fill('demo@example.test');
    await page.locator('input[name="password"]').fill('Synthetic-login-only-123');
    await button('Entrar').click();
    await page.waitForFunction(expected=>location.pathname==='/app'&&new URLSearchParams(location.search).get('portal')===expected,portal);
    await page.locator('.chrome-connection-hero h1').waitFor();
    await noOverflow();
  }
  await page.screenshot({path:output('qa-linkedin-after-login.png'),fullPage:true});

  logged=false;await page.goto(base+'/app?portal=gupy');await button('Entrar').waitFor();
  logged=true;await page.goto(base+'/app'); // Synthetic OAuth callback return.
  await page.waitForURL(url=>url.pathname==='/app'&&url.searchParams.get('portal')==='gupy');
  await page.locator('.chrome-connection-hero h1').waitFor();

  // An identity change in another tab must discard the previous account's
  // dashboard without requiring the person to clear the browser cache.
  await page.goto(base+'/app');await heading('Sua automação').waitFor();
  userId='synthetic-second-user';w=structuredClone(blank);w.profile.name='Beatriz QA';w.profile.email='beatriz@example.test';
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await heading('Boas-vindas, Beatriz!').waitFor();
  assert.equal(await page.getByText('Sua automação',{exact:true}).count(),0);

  authUnavailable=true;
  await page.reload();await heading('Não foi possível acessar sua conta agora.').waitFor();
  authUnavailable=false;await button('Tentar novamente').click();
  await heading('Boas-vindas, Beatriz!').waitFor();
  await page.screenshot({path:output('qa-account-isolation.png'),fullPage:true});

  await context.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Storage blocked by browser','SecurityError');}});
    Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Storage blocked by browser','SecurityError');}});
  });
  logged=false;await page.goto(base+'/app?portal=infojobs');await button('Entrar').waitFor();
  await page.locator('input[name="email"]').fill('demo@example.test');
  await page.locator('input[name="password"]').fill('Synthetic-login-only-123');
  await button('Entrar').click();
  await page.waitForURL(url=>url.pathname==='/app'&&url.searchParams.get('portal')==='infojobs');
  await page.locator('.chrome-connection-hero h1').waitFor();
  await page.goto(base+'/app');await heading('Boas-vindas, Beatriz!').waitFor();
  await button('Ativar tema claro').click();await noOverflow();

  const connector=await verifyConnectorUi(context,base,output);
  assert.equal(
    mutations.some((path) =>
      ["/api/discover", "/api/routine", "/api/routine/process"].includes(path),
    ),
    false,
    "The guide must not start automation",
  );
  assert.deepEqual(failures, []);
  const report = {
    passed: true,
    at: new Date().toISOString(),
    registrationToWelcome: true,
    resumeAccessibleBeforeDataForm: true,
    resumeImportToRequiredDetails: true,
    detailsToPreferences: true,
    savedProgressResumes: true,
    completedAccountsDoNotRestartWelcome: true,
    helpOpensAndClosesByKeyboard: true,
    portalPreservedAfterLogin:['gupy','infojobs','glassdoor','linkedin'],
    portalPreservedAfterOAuthCallback:true,
    blockedBrowserStorageWorks:true,
    accountSwitchDiscardsPreviousWorkspace:true,
    authServiceErrorRecovers:true,
    connector,
    mobileNoOverflow: true,
    desktopNoOverflow: true,
    runtimeErrors: failures,
    automaticSearchesStarted: 0,
    realAccountsUsed: false,
    productionApiRequests: 0,
    externalRequestsBlocked: external.length,
  };
  await writeFile(
    output("onboarding-qa.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  await context.close();
} catch (error) {
  if (page)
    await page
      .screenshot({ path: output("onboarding-error.png"), fullPage: true })
      .catch(() => {});
  await writeFile(
    output("onboarding-qa.json"),
    JSON.stringify({
      passed: false,
      error: String(error.message || error),
      realAccountsUsed: false,
      productionApiRequests: 0,
    }),
  );
  if (!fromBuild) throw error;
  console.error(
    "Onboarding QA failed; inspect the staged deployment artifacts before promotion: " +
      String(error.message || error),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
