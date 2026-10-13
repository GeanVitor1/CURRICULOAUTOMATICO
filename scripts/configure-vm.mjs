import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";

const destination = resolve(".env.production.local");
const source = parse(await readFile(resolve(".env"), "utf8").catch(() => ""));
const existing = parse(await readFile(destination, "utf8").catch(() => ""));
const names = [
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PLUS",
  "STRIPE_PRICE_PRO",
  "STRIPE_PORTAL_CONFIGURATION",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "APPLICATION_WEBHOOK_URL",
  "APPLICATION_WEBHOOK_TOKEN",
  "APPLICATION_WEBHOOK_AUTHORIZED",
  "APPLICATION_WEBHOOK_PORTALS",
];
const values = {};
for (const name of names) values[name] = existing[name] || source[name] || "";
const args = process.argv.slice(2),
  index = args.indexOf("--hostname");
const hostname = index >= 0 ? args[index + 1] : existing.BACKEND_HOSTNAME || "";
if (
  hostname &&
  (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) ||
    !hostname.includes(".") ||
    hostname.includes("..") ||
    hostname.endsWith(".localhost"))
) {
  console.error(
    "Informe somente o hostname público do backend, sem protocolo nem caminhos.",
  );
  process.exit(1);
}
let master = existing.ENCRYPTION_KEY || source.ENCRYPTION_KEY;
if (!master)
  master = (
    await readFile(resolve(source.DATA_DIR || ".data", "encryption.key")).catch(
      () => randomBytes(32),
    )
  ).toString("base64");
if (Buffer.from(master, "base64").length !== 32) {
  console.error("A chave de criptografia existente precisa conter 32 bytes.");
  process.exit(1);
}
Object.assign(values, {
  APP_ORIGIN: "https://curriculoautomatico.vercel.app",
  BACKEND_HOSTNAME: hostname,
  ENCRYPTION_KEY: master,
  API_PROXY_SECRET:
    existing.API_PROXY_SECRET || randomBytes(32).toString("hex"),
  POSTGRES_PASSWORD:
    existing.POSTGRES_PASSWORD || randomBytes(32).toString("hex"),
  APPLICATION_WEBHOOK_AUTHORIZED:
    values.APPLICATION_WEBHOOK_AUTHORIZED || "false",
  PORTAL_BROWSER_AUTHORIZED: "",
  PORTAL_DISCOVERY_AUTHORIZED: "",
  NODE_ENV: "production",
});
const content =
  Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n") + "\n";
await writeFile(destination, content, { mode: 0o600 });
await chmod(destination, 0o600);
console.log(
  JSON.stringify({
    environmentPrepared: true,
    credentialsPrinted: false,
    hostnameConfigured: !!hostname,
    googleConfigured: !!(
      values.GOOGLE_CLIENT_ID && values.GOOGLE_CLIENT_SECRET
    ),
    stripeConfigured: !!(
      values.STRIPE_SECRET_KEY &&
      values.STRIPE_WEBHOOK_SECRET &&
      values.STRIPE_PRICE_PLUS &&
      values.STRIPE_PRICE_PRO
    ),
    destination: ".env.production.local",
  }),
);
