import Stripe from "stripe";
import { parse } from "dotenv";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// Receives credentials on stdin, never in shell arguments or output.
const destination = resolve(
  process.argv.includes("--production-env") ? ".env.production.local" : ".env",
);
const origin = "https://curriculoautomatico.vercel.app";
const events = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
];
async function save(values) {
  let content = await readFile(destination, "utf8").catch(() => "");
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${name}=.*$`, "m"),
      line = `${name}=${JSON.stringify(value)}`;
    content = pattern.test(content)
      ? content.replace(pattern, () => line)
      : `${content.trimEnd()}\n${line}\n`;
  }
  await writeFile(destination, content, { mode: 0o600 });
  await chmod(destination, 0o600);
}
async function setup(key) {
  if (!key?.startsWith("sk_test_") || /[\r\n]/.test(key))
    throw Object.assign(new Error("Test key required"), {
      code: "TEST_KEY_REQUIRED",
    });
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
  const account = await stripe.accounts.retrieve();
  const namespace = createHash("sha256")
    .update(origin)
    .digest("hex")
    .slice(0, 12);
  await save({ STRIPE_SECRET_KEY: key });
  const current = parse(await readFile(destination, "utf8"));
  const catalog = [];
  const products = await stripe.products.list({ active: true, limit: 100 });
  for (const plan of [
    { id: "plus", name: "Essencial", amount: 2000, limit: 50 },
    { id: "pro", name: "Pro", amount: 5000, limit: 100 },
  ]) {
    let product = products.data.find(
      (p) => p.metadata.app === "empregatos" && p.metadata.plan === plan.id,
    );
    if (!product)
      product = await stripe.products.create(
        {
          name: `EmpreGatos ${plan.name}`,
          description: `Até ${plan.limit} candidaturas automáticas por dia, conforme disponibilidade de integração e vagas compatíveis.`,
          metadata: { app: "empregatos", plan: plan.id },
        },
        { idempotencyKey: `empregatos-${namespace}-product-${plan.id}-v1` },
      );
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });
    let price = prices.data.find(
      (p) =>
        p.currency === "brl" &&
        p.unit_amount === plan.amount &&
        p.recurring?.interval === "month" &&
        p.recurring.interval_count === 1,
    );
    if (!price)
      price = await stripe.prices.create(
        {
          product: product.id,
          currency: "brl",
          unit_amount: plan.amount,
          recurring: { interval: "month" },
          metadata: { app: "empregatos", plan: plan.id },
        },
        { idempotencyKey: `empregatos-${namespace}-price-${plan.id}-v1` },
      );
    catalog.push({
      plan: plan.id,
      product: product.id,
      price: price.id,
      amount: plan.amount,
    });
    await save({
      [plan.id === "plus" ? "STRIPE_PRICE_PLUS" : "STRIPE_PRICE_PRO"]: price.id,
    });
  }
  const portalSettings = {
    business_profile: {
      headline: "Gerencie sua assinatura EmpreGatos",
      privacy_policy_url: `${origin}/privacy`,
    },
    default_return_url: `${origin}/app#conta`,
    metadata: { app: "empregatos", origin },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "always_invoice",
        products: catalog.map((item) => ({
          product: item.product,
          prices: [item.price],
        })),
      },
    },
  };
  const configurations = await stripe.billingPortal.configurations.list({
    limit: 100,
  });
  const found = configurations.data.find(
    (c) => c.metadata?.app === "empregatos" && c.metadata?.origin === origin,
  );
  const portal = found
    ? await stripe.billingPortal.configurations.update(found.id, portalSettings)
    : await stripe.billingPortal.configurations.create(portalSettings, {
        idempotencyKey: `empregatos-${namespace}-portal-v1`,
      });
  await save({ STRIPE_PORTAL_CONFIGURATION: portal.id });
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpointUrl = `${origin}/api/billing/webhook`;
  let webhook = endpoints.data.find(
    (w) => w.url === endpointUrl && w.metadata?.app === "empregatos",
  );
  if (webhook) {
    await stripe.webhookEndpoints.update(webhook.id, {
      enabled_events: events,
      disabled: false,
    });
    if (!current.STRIPE_WEBHOOK_SECRET)
      throw Object.assign(new Error("Webhook secret unavailable"), {
        code: "WEBHOOK_SECRET_REQUIRED",
      });
  } else {
    webhook = await stripe.webhookEndpoints.create(
      {
        url: endpointUrl,
        enabled_events: events,
        description: "EmpreGatos: confirmação de assinatura (teste)",
        metadata: { app: "empregatos" },
      },
      { idempotencyKey: `empregatos-${namespace}-webhook-v1` },
    );
    if (!webhook.secret)
      throw Object.assign(new Error("Webhook secret unavailable"), {
        code: "WEBHOOK_SECRET_REQUIRED",
      });
    await save({ STRIPE_WEBHOOK_SECRET: webhook.secret });
  }
  console.log(
    JSON.stringify({
      configured: true,
      mode: "test",
      chargesEnabledForAccount: account.charges_enabled,
      products: catalog,
      portalConfiguration: portal.id,
      webhookId: webhook.id,
      webhookUrl: endpointUrl,
      credentialsSavedPrivately: true,
    }),
  );
}
try {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on("data", (chunk) => {
      if (chunk.includes(3)) process.exit(130);
    });
  }
  console.log("Pronto para configuração privada do Stripe via stdin.");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.includes("\n") || input.includes("\r")) break;
  }
  const payload = input.trim() ? JSON.parse(input) : {};
  const previous = parse(await readFile(destination, "utf8").catch(() => ""));
  await setup(payload.secretKey || previous.STRIPE_SECRET_KEY);
} catch (error) {
  console.error(
    JSON.stringify({
      configured: false,
      code: error?.code || "SETUP_FAILED",
      parameter: error?.param || null,
      type: error?.type || "ConfigurationError",
    }),
  );
  process.exitCode = 1;
}
