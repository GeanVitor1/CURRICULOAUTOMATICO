import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  timeout: 60000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1100 },
    headless: true,
    screenshot: "only-on-failure",
    actionTimeout: 10000,
  },
  reporter: "list",
});
