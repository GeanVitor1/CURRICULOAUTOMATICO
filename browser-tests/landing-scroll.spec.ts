import { expect, test } from "@playwright/test";

for (const width of [1440, 375]) {
  for (const demo of ["workflow", "organization"] as const) {
    test(`landing keeps its scroll position during ${demo} autoplay at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", (route) =>
        route.fulfill({ status: 401, json: { error: "No session" } }),
      );
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      const selector =
        demo === "workflow" ? ".workflow-demo" : ".organization-cards";
      await page.locator(selector).scrollIntoViewIfNeeded();
      // Leave the end of the changing content visible, where browser scroll
      // anchoring can select it. Do not interact while the automatic timers run.
      await page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        window.scrollTo(0, rect.bottom + scrollY - 240);
      });
      await expect(page.locator(selector)).toBeVisible();
      const result = await page.evaluate(
        async ({ selector, duration }) => {
          const samples: {
            y: number;
            height: number;
            panelHeight: number;
            state: string | null;
          }[] = [];
          const start = performance.now();
          await new Promise<void>((resolve) => {
            const sample = () => {
              const panel = document.querySelector<HTMLElement>(selector)!;
              samples.push({
                y: scrollY,
                height: document.documentElement.scrollHeight,
                panelHeight: panel.offsetHeight,
                state:
                  panel.getAttribute("data-demo-stage") ??
                  panel.getAttribute("data-organization-state"),
              });
              if (performance.now() - start >= duration) resolve();
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          const range = (key: "y" | "height" | "panelHeight") => {
            const values = samples.map((sample) => sample[key]);
            return Math.max(...values) - Math.min(...values);
          };
          return {
            scrollRange: range("y"),
            documentHeightRange: range("height"),
            panelHeightRange: range("panelHeight"),
            states: [...new Set(samples.map((sample) => sample.state))],
          };
        },
        { selector, duration: demo === "workflow" ? 23000 : 11000 },
      );
      await testInfo.attach("autoplay-scroll", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      console.log({ width, demo, ...result });
      expect(errors).toEqual([]);
      expect(result.states.length).toBe(demo === "workflow" ? 6 : 2);
      expect(result.scrollRange).toBeLessThanOrEqual(1);
      expect(result.documentHeightRange).toBeLessThanOrEqual(1);
      expect(result.panelHeightRange).toBeLessThanOrEqual(1);
    });
  }
}

test("workflow stages keep their height and expose only the selected content at narrow widths", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const demo = page.locator(".workflow-demo");
    const tabs = page
      .getByRole("tablist", { name: "Como funciona", exact: true })
      .getByRole("tab");
    const height = await demo.evaluate((element) => element.clientHeight);
    const titles = [
      "Suas preferências, salvas",
      "Buscando oportunidades",
      "Novas oportunidades",
      "O que combina com você",
      "Cada envio tem uma etapa",
      "Tudo em um só lugar",
    ];
    for (let stage = 0; stage < titles.length; stage++) {
      await tabs.nth(stage).click();
      await expect(demo.getByRole("heading")).toHaveCount(1);
      await expect(demo.getByRole("heading")).toHaveText(titles[stage]);
      expect(await demo.evaluate((element) => element.clientHeight)).toBe(
        height,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await demo.screenshot({
      path: testInfo.outputPath(`workflow-${width}.png`),
    });
  }
});
