import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { PortalBrowserService } from "../server/portal-browser-service";

// Anonymous access demonstration, NOT an authenticated application PoC.
// No private env, production database, personal browser profile or account data.
// Use the product's existing managed-browser service, without importing a session.
const directory = await mkdtemp(join(tmpdir(), "empregatos-gupy-readonly-"));
const launched: Browser[] = [];
const launch = chromium.launch.bind(chromium);
const methods: Record<string, number> = {};
let preventedWrites = 0;
chromium.launch = async (options) => {
  const browser = await launch(options);
  launched.push(browser);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (settings) => {
    assert.equal(settings?.storageState, undefined);
    const context = await newContext(settings);
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      // Page routes precede context routes. Refuse every network mutation,
      // including anonymous analytics; this probe cannot submit a form.
      await page.route("**/*", async (route) => {
        const method = route.request().method();
        methods[method] = (methods[method] || 0) + 1;
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
          preventedWrites++;
          await route.abort("blockedbyclient");
        } else await route.fallback();
      });
      return page;
    };
    return context;
  };
  return browser;
};

const service = new PortalBrowserService("gupy", directory);
const report: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  kind: "anonymous_managed_browser_read_only",
  implementation: "server/portal-browser-service.ts",
  environment: "local_isolated_chromium_not_vercel_sandbox",
  extensionUsed: false,
  personalSessionImported: false,
  credentialsProvided: false,
  accountCreated: false,
  authenticatedSessionPersistenceTested: false,
  authenticatedSessionExpiryTested: false,
  formFillingTested: false,
  applicationConfirmationTested: false,
  applicationOperationsInvoked: 0,
};
try {
  const frame = await service.open(1024, 720);
  report.page = {
    address: frame.address,
    authenticated: frame.authenticated,
    blocked: frame.blocked,
    challenge: frame.challenge || false,
    notice: frame.notice,
    navigationError: frame.navigationError || null,
    fields: frame.fields.map(({ label, type }) => ({ label, type })),
  };
  assert.equal(frame.authenticated, false);
  await writeFile(
    "artifacts/gupy-managed-anonymous-2026-10-23.png",
    Buffer.from(frame.image.split(",")[1], "base64"),
  );
  try {
    await service.confirm(null);
    throw new Error("Anonymous page incorrectly accepted as authenticated");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("O login ainda não foi confirmado"))
      throw error;
    report.anonymousConfirmationRejected = true;
  }
  report.savedConnection = await service.metadata();
  assert.equal(report.savedConnection, null);
  report.completed = true;
} catch (error) {
  report.completed = false;
  process.exitCode = 1;
  // No raw URLs, request bodies, cookies, provider tokens or stack traces.
  report.errorClass = error instanceof Error ? error.name : "UnknownError";
} finally {
  await service.close();
  for (const browser of launched) await browser.close();
  chromium.launch = launch;
  Object.assign(report, {
    finishedAt: new Date().toISOString(),
    observedRequestMethods: methods,
    preventedNonReadRequests: preventedWrites,
    transmittedNonReadRequests: 0,
    realApplications: 0,
    receipts: 0,
  });
  await writeFile("artifacts/gupy-managed-access-2026-10-23.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
