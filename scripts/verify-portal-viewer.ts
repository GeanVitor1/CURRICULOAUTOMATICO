import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Disposable application account. No provider credentials, CAPTCHA answers,
// authorization to send, or job applications are submitted by this check.
const origin = "https://curriculoautomatico.vercel.app";
const requested = process.argv.slice(2);
const portals = requested.length
  ? requested
  : ["gupy", "infojobs", "glassdoor"];
if (
  portals.some((portal) => !["gupy", "infojobs", "glassdoor"].includes(portal))
)
  throw new Error("Invalid portal");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const headers = { Origin: origin, "X-Orbita-Request": "1" };
const password = `Viewer-QA-${randomUUID()}`;
let registered = false;
const results: unknown[] = [];
try {
  const registration = await context.request.post(
    origin + "/api/auth/register",
    {
      headers,
      data: {
        name: "Viewer QA",
        email: `viewer-qa-${randomUUID()}@example.test`,
        password,
      },
    },
  );
  if (!registration.ok()) throw new Error("Disposable registration failed");
  registered = true;
  await mkdir(".data", { recursive: true });
  for (const portal of portals) {
    const page = await context.newPage();
    let latest: any = {};
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("websocket", (socket) =>
      socket.on("framereceived", (event) => {
        try {
          latest = { ...latest, ...JSON.parse(String(event.payload)) };
        } catch {}
      }),
    );
    try {
      const opening = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith(
            `/connections/${portal}/open`,
          ),
        { timeout: 65000 },
      );
      await page.goto(`${origin}/app?portal=${portal}`);
      const response = await opening;
      if (!response.ok())
        throw new Error(`Open ${portal}: ${response.status()}`);
      const frame = await response.json();
      console.log(
        JSON.stringify({ portal, stage: "opened", blocked: frame.blocked }),
      );
      if (!frame.image?.startsWith("data:image/png;base64,"))
        throw new Error("Lossless opening frame missing");
      const png = Buffer.from(frame.image.split(",")[1], "base64");
      const pixels = {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      };
      if (pixels.width !== 1920 || pixels.height !== 1350)
        throw new Error("Unexpected pixel density");
      await page.waitForFunction(() => {
        const image =
          document.querySelector<HTMLImageElement>(".remote-screen img");
        return image?.complete && image.naturalWidth > 0;
      });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `.data/viewer-${portal}-desktop.png` });
      let resized = false;
      let inputAckMs: number | undefined;
      if (!frame.blocked && !latest.blocked && !latest.navigationError) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(
          () =>
            document
              .querySelector(".remote-screen img")
              ?.getAttribute("width") === "390",
          undefined,
          { timeout: 15000 },
        );
        resized = true;
        const image = page.locator(".remote-screen img");
        await image.focus();
        await page.keyboard.press("Tab");
        await page.waitForFunction(() =>
          performance
            .getEntriesByName("remote-input")
            .some(
              (entry) => (entry as PerformanceMeasure).detail?.type === "key",
            ),
        );
        inputAckMs = await page.evaluate(() =>
          Math.round(
            performance
              .getEntriesByName("remote-input")
              .filter(
                (entry) => (entry as PerformanceMeasure).detail?.type === "key",
              )
              .at(-1)!.duration,
          ),
        );
        await page.screenshot({ path: `.data/viewer-${portal}-mobile.png` });
      }
      if (pageErrors.length)
        throw new Error("Viewer raised a browser exception");
      results.push({
        portal,
        css: { width: frame.width, height: frame.height },
        pixels,
        resized,
        inputAckMs,
        address: latest.address || frame.address,
        blocked: latest.blocked || frame.blocked,
        navigationError: latest.navigationError || "",
        pageErrors: pageErrors.length,
        applicationsSubmitted: 0,
      });
      console.log(JSON.stringify(results.at(-1)));
    } finally {
      await page.close();
      const removed = await context.request.delete(
        `${origin}/api/connections/${portal}`,
        { headers },
      );
      if (!removed.ok()) throw new Error("QA browser cleanup failed");
    }
  }
  await writeFile(
    ".data/portal-viewer-verification.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  try {
    if (registered) {
      const removed = await context.request.delete(origin + "/api/account", {
        headers,
        data: { password },
      });
      if (!removed.ok()) throw new Error("QA account cleanup failed");
      console.log(JSON.stringify({ qaAccountRemoved: true }));
    }
  } finally {
    await browser.close();
  }
}
