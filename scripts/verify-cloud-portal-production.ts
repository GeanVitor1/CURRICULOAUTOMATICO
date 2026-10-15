import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "https://curriculoautomatico.vercel.app";
const portal = process.argv[2] || "gupy";
if (!["gupy", "infojobs", "glassdoor"].includes(portal))
  throw new Error("Invalid portal");
const mobile = process.argv[3] === "mobile";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: mobile ? 390 : 1024, height: mobile ? 844 : 760 },
});
const headers = { Origin: origin, "X-Orbita-Request": "1" };
const password = `Remote-QA-${randomUUID()}`;
let registered = false;
// Separate, disposable account: never replace the user's active portal login.
// No portal credential or job application is submitted by this verification.
try {
  const account = await context.request.post(origin + "/api/auth/register", {
    headers,
    data: {
      name: "Remote login QA",
      email: `remote-qa-${randomUUID()}@example.test`,
      password,
    },
  });
  if (!account.ok()) throw new Error("Synthetic registration failed");
  registered = true;
  const page = await context.newPage();
  let opens = 0;
  page.on("request", (request) => {
    if (
      request.url().includes(`/connections/${portal}/open`) &&
      request.method() === "POST"
    )
      opens++;
  });
  const opened = page.waitForResponse(
    (response) =>
      response.url().includes(`/connections/${portal}/open`) &&
      response.request().method() === "POST",
    { timeout: 65000 },
  );
  await page.goto(origin + `/app?portal=${portal}`);
  const response = await opened;
  if (!response.ok())
    throw new Error("Remote open failed: " + response.status());
  const frame = await response.json();
  if (
    !frame.viewerId ||
    !frame.image?.startsWith("data:image/jpeg;base64,") ||
    frame.authenticated ||
    frame.blocked
  )
    throw new Error("Unexpected public login frame");
  const image = page.locator(".remote-screen img");
  await image.waitFor();
  if (opens !== 1) throw new Error("Login opened more than once");
  if (
    (await page.getByRole("button").count()) ||
    (await page.getByRole("heading").count()) ||
    (await page.locator("input[type=email],input[type=password]").count())
  )
    throw new Error("Extra interface surrounds the portal login");
  if ((await page.locator(".remote-login").innerText()).trim())
    throw new Error("Extra login text is visible");
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
  )
    throw new Error("Viewport overflow");
  await mkdir(".data", { recursive: true });
  await page.screenshot({
    path: `.data/login-only-${portal}-${mobile ? "mobile" : "desktop"}.png`,
  });
  const scrolled = page.waitForResponse(
    (response) =>
      response.url().includes(`/connections/${portal}/action`) &&
      response.request().postDataJSON()?.type === "scroll",
    { timeout: 65000 },
  );
  await image.hover();
  await page.mouse.wheel(0, 300);
  if (!(await scrolled).ok())
    throw new Error("Native wheel did not reach the remote browser");
  await page.close();
  const sites = await (
    await context.request.get(origin + "/api/automation/sites")
  ).json();
  if (sites.find((site: any) => site.id === portal)?.connected)
    throw new Error("Unauthenticated login was saved");
  console.log(
    JSON.stringify({
      portal,
      mobile,
      directLogin: true,
      introduction: false,
      surroundingControls: false,
      openRequests: opens,
      nativeScroll: true,
      connectedWithoutLogin: false,
      applicationsSubmitted: 0,
    }),
  );
} finally {
  if (registered) {
    await context.request
      .delete(origin + `/api/connections/${portal}`, { headers })
      .catch(() => {});
    const deleted = await context.request.delete(origin + "/api/account", {
      headers,
      data: { password },
    });
    if (!deleted.ok()) throw new Error("Synthetic account cleanup failed");
  }
  await browser.close();
}
