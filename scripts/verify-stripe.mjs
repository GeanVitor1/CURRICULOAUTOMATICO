import "dotenv/config";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";

if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
  throw new Error("Esta verificação exige a chave Stripe de teste.");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  timeout: 15000,
  maxNetworkRetries: 1,
});
const origin = "http://127.0.0.1:3001",
  password = randomUUID() + randomUUID();
let cookie = "",
  customer = "";
async function request(path, method = "GET", payload) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      "x-orbita-request": "1",
      origin: "http://127.0.0.1:5173",
      ...(cookie ? { cookie } : {}),
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(`Verificação ${path}: HTTP ${response.status}`);
  return { response, body };
}
try {
  const registration = await request("/api/auth/register", "POST", {
    name: "Verificação Stripe temporária",
    email: `stripe-check-${randomUUID()}@example.test`,
    password,
  });
  cookie = registration.response.headers.get("set-cookie").split(";")[0];
  const checkout = await request("/api/billing/checkout", "POST", {
    plan: "plus",
  });
  if (!checkout.body.url.startsWith("https://checkout.stripe.com/"))
    throw new Error("Checkout inesperado");
  const sessions = await stripe.checkout.sessions.list({ limit: 10 });
  const session = sessions.data.find(
    (item) => item.client_reference_id === registration.body.id,
  );
  if (!session || session.livemode || session.mode !== "subscription")
    throw new Error("Checkout de teste não localizado");
  customer =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const items = await stripe.checkout.sessions.listLineItems(session.id);
  if (
    items.data[0]?.price?.id !== process.env.STRIPE_PRICE_PLUS ||
    items.data[0].amount_total !== 2000
  )
    throw new Error("Preço incorreto");
  const billing = (await request("/api/billing")).body;
  if (billing.plan !== "free") throw new Error("Plano liberado antes de pagar");
  const portal = await request("/api/billing/portal", "POST", {});
  if (!portal.body.url.startsWith("https://billing.stripe.com/"))
    throw new Error("Portal inesperado");
  console.log(
    JSON.stringify({
      realStripeSandbox: true,
      checkoutCreated: true,
      correctMonthlyPrice: true,
      portalCreated: true,
      planRemainedFreeBeforePayment: true,
      cardEntered: false,
      paymentMade: false,
    }),
  );
} finally {
  if (cookie) await request("/api/account", "DELETE", { password });
  if (customer) await stripe.customers.del(customer);
}
