import dotenv from "dotenv";
import { randomBytes, createHash } from "node:crypto";
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { candidatePortalLoginUrls } from "../shared/portals";
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
try {
  const sitesResponse = await context.request.get(
    origin + "/api/automation/sites",
  );
  if (!sitesResponse.ok()) throw new Error("Capabilities unavailable");
  const sites = await sitesResponse.json();
  const gupy = sites.find((s: any) => s.id === "gupy");
  if (!gupy?.externalLoginOnly || gupy.connectable || gupy.automatic)
    throw new Error(
      "Official login must not advertise a shared portal session",
    );
  const page = await context.newPage();
  await page.goto(origin + "/app#automacao");
  await page.getByText("Contas dos sites", { exact: true }).click();
  const card = page
    .locator(".connection-card")
    .filter({ has: page.getByText("Gupy", { exact: true }) });
  const link = card.getByRole("link", {
    name: "Fazer login no site oficial",
    exact: true,
  });
  if (
    (await link.getAttribute("href")) !== candidatePortalLoginUrls.gupy ||
    (await link.getAttribute("target")) !== "_blank"
  )
    throw new Error("Official login link does not target Gupy in a new tab");
  const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
  await popup.waitForURL(candidatePortalLoginUrls.gupy);
  if (
    (await page.getByRole("dialog").count()) ||
    (await card
      .getByRole("button", { name: /Conectar|Confirmar currículo/ })
      .count())
  )
    throw new Error("The panel must not open a credential relay");
  await popup.close();
  for (const operation of ["open", "action", "confirm"]) {
    const response = await context.request.post(
      origin + `/api/connections/gupy/${operation}`,
      { headers: { Origin: origin, "X-Orbita-Request": "1" }, data: {} },
    );
    if (response.status() !== 400)
      throw new Error("Remote credential endpoint was not disabled");
  }
  const after = await (
    await context.request.get(origin + "/api/automation/sites")
  ).json();
  if (after.find((s: any) => s.id === "gupy")?.connected)
    throw new Error(
      "Closing the official tab must not be treated as connection proof",
    );
  console.log(
    JSON.stringify({
      productionPortal: "gupy",
      officialLoginOpenedInNewTab: true,
      portalCredentialFieldsInApp: false,
      credentialRelayEndpointsDisabled: true,
      closingTabDoesNotConnect: true,
      automaticWithoutLogin: false,
      applicationsSubmitted: 0,
    }),
  );
} finally {
  await browser.close();
  await db.delete(sessions).where(eq(sessions.token, hash));
  await closeDb();
}
