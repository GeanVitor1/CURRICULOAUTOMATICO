import "dotenv/config";
import { parse } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const environments = [
  process.env,
  parse(
    await readFile(resolve(".env.production.local"), "utf8").catch(() => ""),
  ),
  parse(
    await readFile(resolve(".env.stripe.live.local"), "utf8").catch(() => ""),
  ),
];
const privateNames = [
  "GEMINI_API_KEY",
  "OPENCODE_ZEN_API_KEY",
  "OPENCODE_API_KEY",
  "GOOGLE_CLIENT_SECRET",
  "LINKEDIN_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "API_PROXY_SECRET",
  "APPLICATION_WEBHOOK_TOKEN",
  "ENCRYPTION_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "POSTGRES_PASSWORD",
];
const keys = environments
  .flatMap((environment) => privateNames.map((name) => environment[name]))
  .filter(Boolean);
let checked = 0,
  leaked = false;
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await check(path);
    else {
      checked++;
      const content = await readFile(path);
      if (keys.some((key) => content.includes(Buffer.from(key)))) leaked = true;
    }
  }
}
await check(resolve("dist"));
const ignored = (await readFile(".gitignore", "utf8"))
  .split(/\r?\n/)
  .includes(".env");
console.log(
  JSON.stringify({
    frontendFilesChecked: checked,
    configuredSecretFoundInFrontend: leaked,
    environmentFileIgnored: ignored,
  }),
);
if (leaked || !ignored) process.exitCode = 1;
