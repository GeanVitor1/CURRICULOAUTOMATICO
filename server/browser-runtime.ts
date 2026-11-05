import { accessSync, constants } from "node:fs";
import { isAbsolute } from "node:path";
import { chromium } from "playwright";

let cachedKey: string | undefined;
let cachedRuntime:
  | { available: boolean; executablePath: string | undefined }
  | undefined;

export function portalBrowserRuntime() {
  const key = process.env.PORTAL_BROWSER_EXECUTABLE_PATH?.trim() ?? "__default__";
  if (cachedKey === key && cachedRuntime) return cachedRuntime;
  try {
    const executablePath =
      process.env.PORTAL_BROWSER_EXECUTABLE_PATH?.trim() ||
      chromium.executablePath();
    if (!isAbsolute(executablePath)) throw new Error("Invalid executable path");
    accessSync(executablePath, constants.X_OK);
    cachedKey = key;
    cachedRuntime = { available: true, executablePath };
    return cachedRuntime;
  } catch {
    cachedKey = key;
    cachedRuntime = { available: false, executablePath: undefined };
    return cachedRuntime;
  }
}

