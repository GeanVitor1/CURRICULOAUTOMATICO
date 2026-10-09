import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get("/api/health");
          return response.ok() && (await response.json()).status === "ok";
        } catch {
          return false;
        }
      },
      { timeout: 30000, intervals: [500, 1000] },
    )
    .toBe(true);
});
