import { accessSync, constants } from "node:fs";
import { isAbsolute } from "node:path";
import { chromium } from "playwright";

export function portalBrowserRuntime() {
  try {
    const executablePath =
      process.env.PORTAL_BROWSER_EXECUTABLE_PATH?.trim() ||
      chromium.executablePath();
    if (!isAbsolute(executablePath)) throw new Error("Invalid executable path");
    accessSync(executablePath, constants.X_OK);
    return { available: true, executablePath };
  } catch {
    return { available: false, executablePath: undefined };
  }
}
