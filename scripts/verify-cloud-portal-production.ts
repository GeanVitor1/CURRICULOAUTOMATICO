import dotenv from "dotenv";
import { randomBytes, createHash } from "node:crypto";
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
dotenv.config({ path: ".env.production.local", quiet: true });
dotenv.config({ path: ".env.antigravity-owner.local", quiet: true });
const { db, closeDb, readWorkspace } = await import("../server/db");
const { sessions } = await import("../server/schema");
const userId =
  process.env.PORTAL_CLOUD_OWNER_ID || process.env.ANTIGRAVITY_OWNER_ID;
if (!userId) throw new Error("Owner not configured");
const state = await readWorkspace(`${userId}:live`);
if (state?.infrastructure.portalConnections?.gupy)
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
let opened = false;
try {
  const sitesResponse = await context.request.get(
    origin + "/api/automation/sites",
  );
  if (!sitesResponse.ok()) throw new Error("Capabilities unavailable");
  const sites = await sitesResponse.json();
  const gupy = sites.find((s: any) => s.id === "gupy");
  if (!gupy?.cloud || !gupy?.connectable || gupy.automatic)
    throw new Error("Cloud capabilities must require a real portal login");
  const page = await context.newPage();
  await page.goto(origin + "/app#automacao");
  await page.getByText("Contas dos sites", { exact: true }).click();
  const card = page
    .locator(".connection-card")
    .filter({ has: page.getByText("Gupy", { exact: true }) });
  await card
    .getByRole("button", {
      name: "Conectar para envio automático",
      exact: true,
    })
    .click();
  opened = true;
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(/E-mail ou CPF/)
    .waitFor({ state: "visible", timeout: 55000 });
  const password = dialog.getByLabel("Senha*", { exact: true });
  if ((await password.getAttribute("type")) !== "password")
    throw new Error("Password field not masked");
  if (
    await dialog
      .getByRole("button", { name: "Conectar e iniciar envios", exact: true })
      .count()
  )
    throw new Error("Unauthenticated login cannot activate sends");
  console.log(
    JSON.stringify({
      productionPortal: "gupy",
      realLoginLoadedThroughUI: true,
      passwordMasked: true,
      automaticWithoutLogin: false,
      applicationsSubmitted: 0,
    }),
  );
  await dialog
    .getByText("Abrir janela do site para verificação", { exact: true })
    .click();
  await dialog
    .locator(".portal-screen img")
    .screenshot({ path: ".data/cloud-gupy-panel.png" });
} finally {
  if (opened)
    await context.request
      .post(origin + "/api/connections/gupy/close", {
        headers: { Origin: origin, "X-Orbita-Request": "1" },
      })
      .catch(() => {});
  await browser.close();
  await db.delete(sessions).where(eq(sessions.token, hash));
  await closeDb();
}
