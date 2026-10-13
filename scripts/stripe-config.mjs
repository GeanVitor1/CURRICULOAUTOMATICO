import { createHash } from "node:crypto";

export const billingEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
];
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};

// Does not write credentials or create a charge. The caller saves only on success.
export async function configureStripe({
  stripe,
  key,
  mode = "test",
  current = {},
  origin = "https://curriculoautomatico.vercel.app",
}) {
  if (!["test", "live"].includes(mode)) fail("INVALID_PAYMENT_MODE");
  if (!key?.startsWith(`sk_${mode}_`) || /\s/.test(key))
    fail(mode === "live" ? "LIVE_KEY_REQUIRED" : "TEST_KEY_REQUIRED");
  const account = await stripe.accounts.retrieve();
  if (
    mode === "live" &&
    (!account.charges_enabled ||
      !account.payouts_enabled ||
      !account.details_submitted)
  )
    fail("LIVE_ACCOUNT_NOT_READY");
  const live = mode === "live";
  const namespace = createHash("sha256")
    .update(`${origin}:${account.id}:${mode}`)
    .digest("hex")
    .slice(0, 12);
  const endpointUrl = `${origin}/api/billing/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let webhook = endpoints.data.find(
    (w) => w.url === endpointUrl && w.metadata?.app === "empregatos",
  );
  const secretMatchesAccount =
    current.STRIPE_SECRET_KEY?.startsWith(`sk_${mode}_`) &&
    (current.STRIPE_ACCOUNT_ID === account.id ||
      current.STRIPE_SECRET_KEY === key);
  if (webhook && webhook.livemode !== live) fail("WEBHOOK_MODE_MISMATCH");
  if (webhook && (!secretMatchesAccount || !current.STRIPE_WEBHOOK_SECRET))
    fail("WEBHOOK_SECRET_REQUIRED");
  const values = { STRIPE_SECRET_KEY: key, STRIPE_ACCOUNT_ID: account.id };
  const catalog = [];
  const products = await stripe.products.list({ active: true, limit: 100 });
  for (const plan of [
    { id: "plus", name: "Essencial", amount: 2000, limit: 50 },
    { id: "pro", name: "Pro", amount: 5000, limit: 100 },
  ]) {
    let product = products.data.find(
      (p) => p.metadata.app === "empregatos" && p.metadata.plan === plan.id,
    );
    if (product && product.livemode !== live) fail("PRODUCT_MODE_MISMATCH");
    if (!product)
      product = await stripe.products.create(
        {
          name: `EmpreGatos ${plan.name}`,
          description: `Até ${plan.limit} candidaturas automáticas por dia, conforme disponibilidade de integração e vagas compatíveis.`,
          metadata: { app: "empregatos", plan: plan.id },
        },
        { idempotencyKey: `empregatos-${namespace}-product-${plan.id}-v1` },
      );
    if (product.livemode !== live) fail("PRODUCT_MODE_MISMATCH");
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
    if (price && price.livemode !== live) fail("PRICE_MODE_MISMATCH");
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
    if (price.livemode !== live) fail("PRICE_MODE_MISMATCH");
    catalog.push({
      plan: plan.id,
      product: product.id,
      price: price.id,
      amount: plan.amount,
    });
    values[plan.id === "plus" ? "STRIPE_PRICE_PLUS" : "STRIPE_PRICE_PRO"] =
      price.id;
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
        products: catalog.map(({ product, price }) => ({
          product,
          prices: [price],
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
  if (found && found.livemode !== live) fail("PORTAL_MODE_MISMATCH");
  const portal = found
    ? await stripe.billingPortal.configurations.update(found.id, portalSettings)
    : await stripe.billingPortal.configurations.create(portalSettings, {
        idempotencyKey: `empregatos-${namespace}-portal-v1`,
      });
  if (portal.livemode !== live) fail("PORTAL_MODE_MISMATCH");
  values.STRIPE_PORTAL_CONFIGURATION = portal.id;
  if (webhook) {
    await stripe.webhookEndpoints.update(webhook.id, {
      enabled_events: billingEvents,
      disabled: false,
    });
    values.STRIPE_WEBHOOK_SECRET = current.STRIPE_WEBHOOK_SECRET;
  } else {
    webhook = await stripe.webhookEndpoints.create(
      {
        url: endpointUrl,
        enabled_events: billingEvents,
        description: `EmpreGatos: confirmação de assinatura (${mode === "live" ? "produção" : "teste"})`,
        metadata: { app: "empregatos" },
      },
      { idempotencyKey: `empregatos-${namespace}-webhook-v1` },
    );
    if (webhook.livemode !== live) fail("WEBHOOK_MODE_MISMATCH");
    if (!webhook.secret) fail("WEBHOOK_SECRET_REQUIRED");
    values.STRIPE_WEBHOOK_SECRET = webhook.secret;
  }
  return {
    values,
    report: {
      configured: true,
      mode,
      chargesEnabledForAccount: account.charges_enabled,
      payoutsEnabledForAccount: account.payouts_enabled,
      products: catalog,
      portalConfiguration: portal.id,
      webhookId: webhook.id,
      webhookUrl: endpointUrl,
      paymentCreated: false,
    },
  };
}
