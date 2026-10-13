import Stripe from "stripe";
import { parse } from "dotenv";
import { readFile, writeFile, chmod, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { configureStripe } from "./stripe-config.mjs";

const args = process.argv.slice(2);
const mode = args.includes("--live") ? "live" : "test";
// Stage live credentials separately; publishing them is a separate operation.
const filename =
  mode === "live"
    ? ".env.stripe.live.local"
    : args.includes("--production-env")
      ? ".env.production.local"
      : ".env";
const destination = resolve(filename);
try {
  const currentContent = await readFile(destination, "utf8").catch(() => "");
  const current = parse(currentContent);
  let payload = {};
  if (!args.includes("--from-env")) {
    if (process.stdin.isTTY) fail("USE_PRIVATE_ENV_FILE");
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.includes("\n") || input.includes("\r")) break;
    }
    payload = input.trim() ? JSON.parse(input) : {};
  }
  const key = payload.secretKey || current.STRIPE_SECRET_KEY;
  if (!key?.startsWith(`sk_${mode}_`) || /\s/.test(key))
    fail(mode === "live" ? "LIVE_KEY_REQUIRED" : "TEST_KEY_REQUIRED");
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
  const { values, report } = await configureStripe({
    stripe,
    key,
    mode,
    current,
  });
  let content = currentContent;
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    const line = `${name}=${JSON.stringify(value)}`;
    content = pattern.test(content)
      ? content.replace(pattern, () => line)
      : `${content.trimEnd()}\n${line}\n`;
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  console.log(
    JSON.stringify({
      ...report,
      credentialsSavedPrivately: true,
      publishedApplicationChanged: false,
      destination: filename,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      configured: false,
      mode,
      code: error?.code || "SETUP_FAILED",
      parameter: error?.param || null,
      type: error?.type || "ConfigurationError",
    }),
  );
  process.exitCode = 1;
}
function fail(code) {
  throw Object.assign(new Error(code), { code });
}
