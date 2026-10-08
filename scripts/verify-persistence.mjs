import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const mode of ["capture", "verify"])
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [require.resolve("tsx/cli"), "scripts/verify-persistence.ts", mode],
      { stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Verificação interrompida.")),
    );
  });
