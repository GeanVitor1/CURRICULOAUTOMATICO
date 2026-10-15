import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";

// Public sign-in screens only. Never submit provider credentials or applications.
const provider = process.argv[2];
if (!["google", "linkedin"].includes(provider)) throw Error("Invalid provider");
const origin = "https://curriculoautomatico.vercel.app";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1024, height: 760 },
});
const headers = { Origin: origin, "X-Orbita-Request": "1" };
const password = `Remote-QA-${randomUUID()}`;
let registered = false;
let latest: {
  address?: string;
  navigationError?: string;
  authenticated?: boolean;
} = {};
let frames = 0;
const until = async (page: Page, check: () => boolean) => {
  const deadline = Date.now() + 20000;
  while (!check()) {
    if (Date.now() > deadline)
      throw Error("Provider navigation did not complete");
    await page.waitForTimeout(200);
  }
};
try {
  const account = await context.request.post(origin + "/api/auth/register", {
    headers,
    data: {
      name: "Social login QA",
      email: `social-qa-${randomUUID()}@example.test`,
      password,
    },
  });
  if (!account.ok()) throw Error("Synthetic registration failed");
  registered = true;
  const page = await context.newPage();
  let ready = false;
  page.on("websocket", (socket) =>
    socket.on("framereceived", (event) => {
      try {
        const message = JSON.parse(String(event.payload));
        if (message.type === "ready") ready = true;
        if (message.type === "frame") frames++;
        if (message.type === "status") latest = message;
      } catch {}
    }),
  );
  const opened = page.waitForResponse(
    (r) =>
      r.url().includes("/connections/gupy/open") &&
      r.request().method() === "POST",
    { timeout: 65000 },
  );
  await page.goto(origin + "/app?portal=gupy");
  const response = await opened;
  if (!response.ok()) throw Error("Remote open failed: " + response.status());
  const initial = await response.json();
  await until(page, () => ready);
  await page.waitForTimeout(2500);
  const image = page.locator(".remote-screen img");
  await image.waitFor();
  const click = async (x: number, y: number) => {
    const box = await image.boundingBox();
    if (!box) throw Error("Missing remote image");
    await image.click({
      position: {
        x: (x * box.width) / initial.width,
        y: (y * box.height) / initial.height,
      },
    });
  };
  await mkdir(".data", { recursive: true });
  await page.screenshot({ path: `.data/social-${provider}-initial.png` });
  // Dismiss the portal's cookie banner, then click its native provider button.
  await click(600, 638);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `.data/social-${provider}-before.png` });
  const before = frames;
  await click(provider === "google" ? 428 : 590, 623);
  try {
    await until(
      page,
      () =>
        !!latest.navigationError ||
        (latest.address?.includes(
          provider === "google" ? "accounts.google.com" : "linkedin.com",
        ) ??
          false),
    );
  } catch (error) {
    await page.screenshot({ path: `.data/social-${provider}-failed.png` });
    const diagnostic = await context.request.post(
      origin + "/api/connections/gupy/action",
      {
        headers: { ...headers, "X-Portal-Viewer": initial.viewerId },
        data: { type: "refresh" },
      },
    );
    const result = await diagnostic.json();
    console.log(
      JSON.stringify({
        latest,
        frames,
        diagnosticStatus: diagnostic.status(),
        diagnosticAddress: result.address,
        navigationError: result.navigationError,
        fields: result.fields?.map((f: any) => ({
          label: f.label,
          type: f.type,
        })),
        error: result.error,
      }),
    );
    throw error;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `.data/social-${provider}-result.png` });
  if (frames <= before) throw Error("Provider display did not update");
  if (latest.authenticated)
    throw Error("Provider screen incorrectly treated as portal authentication");
  const refused = !!latest.navigationError;
  if (refused) {
    await page
      .getByRole("button", { name: "Voltar ao login do portal" })
      .click();
    await until(
      page,
      () =>
        !latest.navigationError &&
        (latest.address?.includes("login.gupy.io/candidates/signin") ?? false),
    );
  }
  console.log(
    JSON.stringify({
      provider,
      address: latest.address,
      displayUpdated: true,
      providerRefused: refused,
      recoveryVerified: refused,
      connectedWithoutLogin: false,
      applicationsSubmitted: 0,
    }),
  );
  await page.close();
} finally {
  if (registered) {
    await context.request
      .delete(origin + "/api/connections/gupy", { headers })
      .catch(() => {});
    const deleted = await context.request.delete(origin + "/api/account", {
      headers,
      data: { password },
    });
    if (!deleted.ok()) throw Error("Synthetic account cleanup failed");
  }
  await browser.close();
}
