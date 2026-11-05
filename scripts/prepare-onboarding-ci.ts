import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createWorkspace } from "../server/workspace";

if (!process.env.VERCEL || process.env.VERIFY_ONBOARDING_QA !== "1")
  throw Error(
    "This browser QA setup runs only in an explicitly requested remote build",
  );
const directory = resolve(".data/onboarding-runtime");
await mkdir(directory, { recursive: true });
const w = createWorkspace("Ana de teste", "demo@example.test");
w.infrastructure.candidateDetailsRequired = true;
await writeFile(".data/onboarding-fixture.json", JSON.stringify(w));
await new Promise<void>((success, failure) => {
  const child = spawn(
    "npm",
    [
      "install",
      "--prefix",
      directory,
      "--no-save",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
      "@sparticuz/chromium@153.0.0",
    ],
    { stdio: "inherit", windowsHide: true },
  );
  child.on("error", failure);
  child.on("exit", (code) =>
    code === 0
      ? success()
      : failure(Error("Remote test browser installation failed")),
  );
});
