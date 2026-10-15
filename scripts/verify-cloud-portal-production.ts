import dotenv from "dotenv";
import { randomBytes, createHash } from "node:crypto";
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { mkdir } from "node:fs/promises";
dotenv.config({ path: ".env.production.local", quiet: true });
dotenv.config({ path: ".env.antigravity-owner.local", quiet: true });
const { db, closeDb, readWorkspace } = await import("../server/db");
const { sessions } = await import("../server/schema");
const userId =
  process.env.PORTAL_CLOUD_OWNER_ID || process.env.ANTIGRAVITY_OWNER_ID;
if (!userId) throw new Error("Owner not configured");
const portal = process.argv[2] || "gupy";
if (!["gupy", "infojobs", "glassdoor"].includes(portal))
  throw new Error("Invalid portal");
const name =
  portal === "gupy" ? "Gupy" : portal === "infojobs" ? "InfoJobs" : "Glassdoor";
const state = await readWorkspace(`${userId}:live`);
if (state?.infrastructure.portalConnections?.[portal])
  throw new Error(
    "Do not replace a connected portal session during verification",
  );
const origin = "https://curriculoautomatico.vercel.app";
// Short-lived first-party QA session, kept in memory and deleted in finally.
// No portal credentials, login submission, or job application is used in this probe.
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
await db.insert(sessions).values({
  token: hash,
  userId,
  expiresAt: new Date(Date.now() + 10 * 60000),
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
await context.addCookies([
  {
    name: "orbita_session",
    value: token,
    url: origin,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);
let openedViewerId = "";
try {
  const sitesResponse = await context.request.get(
    origin + "/api/automation/sites",
  );
  if (!sitesResponse.ok()) throw new Error("Capabilities unavailable");
  const sites = await sitesResponse.json();
  const gupy = sites.find((s: any) => s.id === portal);
  if (
    !gupy?.remoteLogin ||
    gupy.externalLoginOnly ||
    !gupy.connectable ||
    gupy.automatic
  )
    throw new Error("Remote browser must require a real portal login");
  const page = await context.newPage();
  await page.goto(origin + "/app#automacao");
  await page.getByText("Contas dos sites", { exact: true }).click();
  const card = page
    .locator(".connection-card")
    .filter({ has: page.getByText(name, { exact: true }) });
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    card
      .getByRole("button", {
        name: "Conectar no navegador remoto",
        exact: true,
      })
      .click(),
  ]);
  await popup.waitForURL(origin + `/app?portal=${portal}`);
  if (process.argv[3] === "mobile")
    await popup.setViewportSize({ width: 390, height: 844 });
  await popup
    .getByRole("button", { name: "Abrir navegador remoto", exact: true })
    .waitFor();
  if (await popup.locator("input[type=email],input[type=password]").count())
    throw new Error("Remote viewer must not present app credential fields");
  const denied = await context.request.post(
    origin + `/api/connections/${portal}/open`,
    { headers: { Origin: origin, "X-Orbita-Request": "1" }, data: {} },
  );
  if (denied.status() !== 400)
    throw new Error("Remote browser consent is required");
  const opened = popup.waitForResponse(
    (r) =>
      r.url().includes(`/connections/${portal}/open`) &&
      r.request().method() === "POST",
    { timeout: 65000 },
  );
  await popup
    .getByRole("button", { name: "Abrir navegador remoto", exact: true })
    .click();
  const response = await opened;
  if (!response.ok())
    throw new Error("Cloud portal open failed: " + response.status());
  const frame = await response.json();
  openedViewerId = frame.viewerId || "";
  if (
    !frame.viewerId ||
    !frame.image?.startsWith("data:image/jpeg;base64,") ||
    !frame.address.includes(
      portal === "gupy"
        ? "gupy.io"
        : portal === "infojobs"
          ? "infojobs.com.br"
          : "glassdoor.com",
    ) ||
    (process.argv[3] === "mobile" && frame.width !== 375) ||
    frame.authenticated
  )
    throw new Error("Unexpected real Gupy frame");
  await popup
    .getByRole("img", { name: new RegExp(name + ".*navegador remoto") })
    .waitFor();
  const confirm = popup.getByRole("button", {
    name: "Conectar e iniciar envios",
    exact: true,
  });
  if (await confirm.isEnabled())
    throw new Error("Unauthenticated portal cannot enable automatic sends");
  const stale = await context.request.post(
    origin + `/api/connections/${portal}/close`,
    {
      headers: {
        Origin: origin,
        "X-Orbita-Request": "1",
        "X-Portal-Viewer": "00000000-0000-4000-8000-000000000000",
      },
    },
  );
  if (stale.status() !== 400) throw new Error("Stale viewer was not rejected");
  await popup
    .getByRole("button", { name: "Atualizar imagem", exact: true })
    .click();
  await popup
    .getByRole("button", { name: "Atualizar imagem", exact: true })
    .waitFor({ state: "visible" });
  await popup.waitForFunction(
    () =>
      !document
        .querySelector(".remote-screen")
        ?.getAttribute("aria-busy")
        ?.includes("true"),
  );
  if (await popup.getByRole("alert").count())
    throw new Error("Stale viewer damaged active browser");
  await mkdir(".data", { recursive: true });
  await popup.screenshot({
    path: `.data/remote-${portal}-production-initial.png`,
    fullPage: true,
  });
  await popup.setViewportSize({ width: 390, height: 844 });
  if (
    await popup.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
  )
    throw new Error("Mobile layout overflows");
  await popup.screenshot({
    path: `.data/remote-${portal}-production-mobile.png`,
    fullPage: true,
  });
  const cancelled = popup.waitForResponse(
    (r) =>
      r.url().includes(`/connections/${portal}/close`) &&
      r.request().method() === "POST",
    { timeout: 65000 },
  );
  await popup.getByRole("button", { name: /^Cancelar conex/ }).click();
  const cancelledResponse = await cancelled;
  if (!cancelledResponse.ok())
    throw new Error(
      "Remote cancellation failed: " +
        JSON.stringify(await cancelledResponse.json()),
    );
  await popup.waitForEvent("close", { timeout: 15000 }).catch(() => {
    if (!popup.isClosed()) throw new Error("Viewer did not close");
  });
  const after = await (
    await context.request.get(origin + "/api/automation/sites")
  ).json();
  if (after.find((s: any) => s.id === portal)?.connected)
    throw new Error("Closing an unauthenticated viewer must not connect");
  console.log(
    JSON.stringify({
      productionPortal: portal,
      remoteViewport: frame.width,
      realCloudBrowserOpened: true,
      installRequired: false,
      appCredentialFields: false,
      consentRequired: true,
      staleViewerRejected: true,
      activeViewerSurvived: true,
      mobileOverflow: false,
      automaticWithoutLogin: false,
      applicationsSubmitted: 0,
    }),
  );
} finally {
  if (openedViewerId)
    await context.request
      .post(origin + `/api/connections/${portal}/close`, {
        headers: {
          Origin: origin,
          "X-Orbita-Request": "1",
          "X-Portal-Viewer": openedViewerId,
        },
      })
      .catch(() => {});
  await browser.close();
  await db.delete(sessions).where(eq(sessions.token, hash));
  await closeDb();
}
