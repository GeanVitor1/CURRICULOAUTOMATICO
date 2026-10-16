import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  applicationUsage,
  billingEvents,
  subscriptions,
  users,
  workspaces,
} from "./schema";
import { appOrigins } from "./auth-config";
import { DailyLimitError, RequestError } from "./errors";
import { plans, type BillingSummary, type PlanId } from "../shared/plans";
import { dailySubmissionAttempts } from "./submission-routing";
import type { Workspace } from "../shared/types";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;
const priceId = (plan: string) =>
  plan === "plus"
    ? process.env.STRIPE_PRICE_PLUS
    : plan === "pro"
      ? process.env.STRIPE_PRICE_PRO
      : undefined;
export const billingConfigured = () =>
  !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    priceId("plus") &&
    priceId("pro") &&
    appOrigins().length
  );
export const billingDay = (date = new Date()) =>
  date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const stripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new RequestError(
      "O pagamento ainda não foi configurado. O plano gratuito continua disponível.",
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 10000,
    maxNetworkRetries: 1,
  });
};
export function effectivePlan(
  subscription?: Subscription | null,
  time = Date.now(),
) {
  const active =
    subscription?.status === "active" &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() > time;
  return (
    plans.find((p) => p.id === (active ? subscription!.plan : "free")) ||
    plans[0]
  );
}
export async function accountPlan(
  userId: string,
  connection: Transaction | typeof db = db,
) {
  const [subscription] = await connection
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return effectivePlan(subscription);
}
export async function billingSummary(userId: string): Promise<BillingSummary> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  const plan = effectivePlan(subscription);
  const [{ used }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(applicationUsage)
    .where(
      and(
        eq(applicationUsage.userId, userId),
        eq(applicationUsage.day, billingDay()),
      ),
    );
  // Preserve the quota for applications sent before the ledger migration.
  const rows = await db
    .select({
      data: sql<
        Pick<Workspace, "applications">
      >`jsonb_build_object('applications', COALESCE(${workspaces.data}->'applications', '[]'::jsonb))`,
    })
    .from(workspaces)
    .where(eq(workspaces.userId, userId));
  const historical = rows.reduce(
    (total, row) => total + dailySubmissionAttempts(row.data),
    0,
  );
  const usedToday = Math.max(used, historical);
  return {
    paymentMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
      ? "test"
      : process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
        ? "live"
        : "unconfigured",
    plan: plan.id,
    name: plan.name,
    dailyLimit: plan.dailyLimit,
    usedToday,
    remainingToday: Math.max(0, plan.dailyLimit - usedToday),
    status: subscription?.status || "free",
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() || null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
    checkoutAvailable: billingConfigured(),
    portalAvailable: !!(subscription && process.env.STRIPE_SECRET_KEY),
  };
}
export async function workspaceDailyLimit(
  tx: Transaction,
  workspaceId: string,
  preferred: number,
) {
  const [owner] = await tx
    .select({ userId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!owner) throw new RequestError("Conta não encontrada.");
  return Math.min(preferred, (await accountPlan(owner.userId, tx)).dailyLimit);
}
export async function reserveApplication(
  tx: Transaction,
  userId: string,
  applicationId: string,
  preferred: number,
  historical: number,
) {
  // A lock per account serializes concurrent sends even across workspaces/workers.
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  const plan = await accountPlan(userId, tx);
  const [{ used }] = await tx
    .select({ used: sql<number>`count(*)::int` })
    .from(applicationUsage)
    .where(
      and(
        eq(applicationUsage.userId, userId),
        eq(applicationUsage.day, billingDay()),
      ),
    );
  if (Math.max(used, historical) >= Math.min(preferred, plan.dailyLimit))
    throw new DailyLimitError();
  const inserted = await tx
    .insert(applicationUsage)
    .values({ applicationId, userId, day: billingDay() })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length)
    throw new RequestError(
      "Esta candidatura já teve uma tentativa de envio. Confira o resultado no portal.",
    );
}
function requirePrice(
  price: Stripe.Price,
  plan: PlanId,
  requireActive = false,
) {
  const expected = plans.find((p) => p.id === plan)!;
  if (
    (requireActive && !price.active) ||
    price.currency !== "brl" ||
    price.unit_amount !== expected.price * 100 ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  )
    throw new RequestError(
      "O preço da assinatura precisa corresponder ao plano mensal em reais. Confira a configuração de cobrança.",
    );
}
export async function createCheckout(userId: string, plan: "plus" | "pro") {
  if (!billingConfigured())
    throw new RequestError(
      "As assinaturas ainda não estão disponíveis. Você pode começar pelo plano gratuito.",
    );
  const stripe = stripeClient();
  const price = await stripe.prices.retrieve(priceId(plan)!);
  requirePrice(price, plan, true);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new RequestError("Conta não encontrada.");
    let [billing] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    if (!billing) {
      const customer = await stripe.customers.create(
        { email: user.email, name: user.name, metadata: { userId } },
        { idempotencyKey: `empregatos-customer-${userId}` },
      );
      [billing] = await tx
        .insert(subscriptions)
        .values({ userId, customerId: customer.id })
        .returning();
    }
    // Block a second subscription, including payment retries and cancellation at period end.
    const existing = await stripe.subscriptions.list({
      customer: billing.customerId,
      status: "all",
      limit: 100,
    });
    if (
      existing.has_more ||
      existing.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      throw new RequestError(
        "Você já possui uma assinatura ou pagamento pendente. Use Gerenciar assinatura para alterar o plano.",
      );
    if (
      billing.checkoutId &&
      billing.checkoutExpiresAt &&
      billing.checkoutExpiresAt > new Date()
    ) {
      const pending = await stripe.checkout.sessions.retrieve(
        billing.checkoutId,
      );
      if (pending.status === "complete")
        throw new RequestError(
          "Seu pagamento está em confirmação. Aguarde a atualização do plano.",
        );
      if (pending.status === "open") {
        if (pending.metadata?.plan === plan && pending.url)
          return { url: pending.url };
        await stripe.checkout.sessions.expire(pending.id);
      }
    }
    const origin = appOrigins()[0];
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: billing.customerId,
        client_reference_id: userId,
        metadata: { plan },
        line_items: [{ price: price.id, quantity: 1 }],
        subscription_data: { metadata: { userId } },
        allowed_payment_method_types: ["card"],
        locale: "pt-BR",
        success_url: `${origin}/app?billing=success#conta`,
        cancel_url: `${origin}/app?billing=canceled#conta`,
      },
      {
        idempotencyKey: `empregatos-checkout-${userId}-${plan}-${billing.checkoutId || "initial"}-${Math.floor(Date.now() / 1800000)}`,
      },
    );
    if (!session.url) throw new Error("Checkout unavailable");
    await tx
      .update(subscriptions)
      .set({
        checkoutId: session.id,
        checkoutUrl: session.url,
        checkoutExpiresAt: new Date(session.expires_at * 1000),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));
    return { url: session.url };
  });
}
export async function createBillingPortal(userId: string) {
  const [billing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  if (!billing) throw new RequestError("Você ainda não possui uma assinatura.");
  const session = await stripeClient().billingPortal.sessions.create({
    customer: billing.customerId,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION
      ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION }
      : {}),
    return_url: `${appOrigins()[0]}/app#conta`,
  });
  return { url: session.url };
}
const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
export async function processBillingEvent(
  event: Stripe.Event,
  stripe = stripeClient(),
) {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(billingEvents)
      .values({ id: event.id })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return { received: true, duplicate: true };
    const object = event.data.object as any;
    const relevant = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.payment_action_required",
    ].includes(event.type);
    if (!relevant) return { received: true };
    const customer = objectId(object.customer);
    if (!customer) return { received: true };
    const [billing] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer));
    if (!billing) return { received: true };
    const accountWorkspaces = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, billing.userId))
      .orderBy(workspaces.id)
      .for("update");
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, billing.userId))
      .for("update");
    const subscriptionId = event.type.startsWith("customer.subscription.")
      ? object.id
      : objectId(object.subscription) ||
        objectId(object.parent?.subscription_details?.subscription);
    if (!subscriptionId) return { received: true };
    // Retrieve live state under the account lock: delayed events cannot restore expired access.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    });
    if (objectId(subscription.customer) !== billing.customerId)
      throw new Error("Customer mismatch");
    const item = subscription.items.data[0];
    const plan = plans.find(
      (p) => p.id !== "free" && item?.price.id === priceId(p.id),
    );
    let eligible = false;
    if (plan && subscription.items.data.length === 1 && item.quantity === 1) {
      requirePrice(item.price, plan.id);
      const invoice = subscription.latest_invoice;
      eligible =
        subscription.status === "active" &&
        !!invoice &&
        typeof invoice !== "string" &&
        invoice.status === "paid";
    }
    const periodEnd = item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null;
    const previousLimit = effectivePlan(billing).dailyLimit;
    const nextLimit =
      eligible && periodEnd && periodEnd > new Date()
        ? plan!.dailyLimit
        : plans[0].dailyLimit;
    for (const row of accountWorkspaces) {
      const preferred = row.data.routine.dailyLimit;
      row.data.routine.dailyLimit =
        preferred === previousLimit
          ? nextLimit
          : Math.min(preferred, nextLimit);
      if (row.data.interview)
        row.data.interview.answers.dailyLimit = row.data.routine.dailyLimit;
      await tx
        .update(workspaces)
        .set({ data: row.data, updatedAt: new Date() })
        .where(eq(workspaces.id, row.id));
    }
    await tx
      .update(subscriptions)
      .set({
        subscriptionId: subscription.id,
        plan: eligible ? plan!.id : "free",
        status: subscription.status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        checkoutId: null,
        checkoutUrl: null,
        checkoutExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, billing.userId));
    return { received: true };
  });
}
export function verifyBillingEvent(raw: Buffer, signature: string) {
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    throw Object.assign(new Error("Billing unavailable"), { statusCode: 503 });
  try {
    return stripeClient().webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new RequestError("Assinatura do webhook inválida.");
  }
}
export async function cancelAccountSubscription(
  userId: string,
  connection: Transaction | typeof db = db,
) {
  const [billing] = await connection
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  if (!billing) return;
  const stripe = stripeClient();
  if (billing.checkoutId) {
    const session = await stripe.checkout.sessions.retrieve(billing.checkoutId);
    if (session.status === "open")
      await stripe.checkout.sessions.expire(session.id);
  }
  const existing = await stripe.subscriptions.list({
    customer: billing.customerId,
    status: "all",
    limit: 100,
  });
  if (existing.has_more)
    throw new RequestError(
      "Gerencie suas assinaturas antes de excluir a conta.",
    );
  for (const subscription of existing.data)
    if (!["canceled", "incomplete_expired"].includes(subscription.status))
      await stripe.subscriptions.cancel(subscription.id);
}
