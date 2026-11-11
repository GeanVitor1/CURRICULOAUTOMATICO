import { randomUUID } from "node:crypto";
import type { Store } from "./storage-types";
import { and, eq, asc } from "./storage-types";
import { store } from "./db";
import type { subscriptions } from "./schema";
import { appOrigins } from "./auth-config";
import { DailyLimitError, RequestError } from "./errors";
import { plans, type BillingSummary, type PlanId } from "../shared/plans";
import type { Workspace } from "../shared/types";
import { pausedBeforeSubmission } from "./submission-attempts";

type Transaction = Parameters<Parameters<typeof store.transaction>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;
export async function releasePausedReservations(tx: Transaction, userId: string, w: Workspace) {
  const paused=w.applications.filter(pausedBeforeSubmission);
  if(!paused.length) return;
  await tx.select("users",{where:eq("id",userId),columns:["id"],lock:true});
  for(const a of paused) await tx.delete("applicationUsage",and(eq("applicationId",a.id),eq("userId",userId)));
}
export const billingDay = (date = new Date()) =>
  date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
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
  connection: Transaction | Store = store,
) {
  const [subscription] = await connection.select("subscriptions", {
    where: eq("userId", userId),
  });
  return effectivePlan(subscription);
}
export async function billingSummary(userId: string): Promise<BillingSummary> {
  const [subscription] = await store.select("subscriptions", {
    where: eq("userId", userId),
  });
  const plan = effectivePlan(subscription);
  const used = await store.count(
    "applicationUsage",
    and(eq("userId", userId), eq("day", billingDay())),
  );
  const historical = await store.historicalAttempts(userId, billingDay());
  const usedToday = Math.max(used, historical);
  return {
    paymentMode: billingConfigured() ? "live" : "unconfigured",
    plan: plan.id,
    name: plan.name,
    dailyLimit: plan.dailyLimit,
    usedToday,
    remainingToday: Math.max(0, plan.dailyLimit - usedToday),
    status: subscription?.status || "free",
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() || null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
    checkoutAvailable: billingConfigured(),
    portalAvailable: false,
  };
}
export async function workspaceDailyLimit(
  tx: Transaction,
  workspaceId: string,
  preferred: number,
) {
  const [owner] = await tx.select("workspaces", {
    where: eq("id", workspaceId),
    columns: ["userId"],
  });
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
  await tx.select("users", {
    where: eq("id", userId),
    columns: ["id"],
    lock: true,
  });
  const plan = await accountPlan(userId, tx);
  const used = await tx.count(
    "applicationUsage",
    and(eq("userId", userId), eq("day", billingDay())),
  );
  if (Math.max(used, historical) >= Math.min(preferred, plan.dailyLimit))
    throw new DailyLimitError();
  const inserted = await tx.insert(
    "applicationUsage",
    { applicationId, userId, day: billingDay() },
    { conflict: "ignore", returning: true },
  );
  if (!inserted.length)
    throw new RequestError(
      "Esta candidatura já teve uma tentativa de envio. Confira o resultado no portal.",
    );
}

// ---- InfinitePay (Checkout Integrado): pagamentos avulsos de 30 dias. ----
// A API não tem assinatura recorrente nem assinatura de webhook: todo evento é
// confirmado em /payment_check antes de liberar o plano.
const INFINITEPAY_API = "https://api.checkout.infinitepay.io";
const PERIOD_DAYS = 30;
const handle = () => process.env.INFINITEPAY_HANDLE?.trim().replace(/^\$/, "");
export const billingConfigured = () => !!(handle() && appOrigins().length);
const paidPlan = (plan: string) =>
  plans.find((p) => p.id === plan && p.id !== "free");
async function infinitePay<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.INFINITEPAY_API_KEY?.trim();
  const response = await fetch(INFINITEPAY_API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-Api-Key": key } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json().catch(() => null)) as any;
  if (!response.ok)
    throw new RequestError(
      "Não foi possível falar com a InfinitePay agora. Tente novamente em instantes.",
    );
  return data as T;
}
// order_nsu = "<plano>.<id aleatório>": identifica o pedido sem expor dados pessoais.
const orderPlan = (orderNsu: string) => paidPlan(orderNsu.split(".", 1)[0]);

export async function createCheckout(userId: string, plan: "plus" | "pro") {
  if (!billingConfigured())
    throw new RequestError(
      "Os planos pagos ainda não estão disponíveis. Você pode começar pelo plano gratuito.",
    );
  const selected = paidPlan(plan)!;
  const [user] = await store.select("users", { where: eq("id", userId) });
  if (!user) throw new RequestError("Conta não encontrada.");
  let [billing] = await store.select("subscriptions", {
    where: eq("userId", userId),
  });
  if (
    billing?.checkoutId?.startsWith(plan + ".") &&
    billing.checkoutUrl &&
    billing.checkoutExpiresAt &&
    billing.checkoutExpiresAt > new Date()
  )
    return { url: billing.checkoutUrl };
  const orderNsu = `${plan}.${randomUUID()}`;
  const origin = appOrigins()[0];
  const key = process.env.INFINITEPAY_API_KEY?.trim();
  const link = await infinitePay<{ url?: string; link?: string }>("/links", {
    handle: handle(),
    order_nsu: orderNsu,
    items: [
      {
        quantity: 1,
        price: selected.price * 100,
        description: `EmpreGatos ${selected.name} - ${PERIOD_DAYS} dias`,
      },
    ],
    redirect_url: `${origin}/app?billing=return#conta`,
    webhook_url: `${origin}/api/billing/webhook`,
    customer: { name: user.name, email: user.email },
    ...(key
      ? {
          options: {
            single_payment: true,
            payment_methods_enabled: ["credit_card", "pix"],
          },
        }
      : {}),
  });
  const url = link?.url || link?.link;
  if (!url) throw new Error("InfinitePay checkout unavailable");
  const pending = {
    checkoutId: orderNsu,
    checkoutUrl: url,
    checkoutExpiresAt: new Date(Date.now() + 24 * 3600000),
    updatedAt: new Date(),
  };
  if (billing)
    await store.update("subscriptions", pending, eq("userId", userId));
  else
    await store.insert("subscriptions", {
      userId,
      customerId: `infinitepay:${userId}`,
      ...pending,
    });
  return { url };
}

export async function createBillingPortal(_userId: string) {
  throw new RequestError(
    "Os planos são pagos por período de 30 dias, sem renovação automática. Para renovar, escolha o plano novamente quando quiser.",
  );
}

type PaymentCheck = {
  success?: boolean;
  paid?: boolean;
  amount?: number;
  paid_amount?: number;
};
/** Confirma um pagamento na InfinitePay e libera 30 dias do plano. Idempotente por transaction_nsu. */
export async function confirmPayment(input: {
  order_nsu?: unknown;
  transaction_nsu?: unknown;
  slug?: unknown;
  invoice_slug?: unknown;
}) {
  const orderNsu = typeof input.order_nsu === "string" ? input.order_nsu : "";
  const transactionNsu =
    typeof input.transaction_nsu === "string" ? input.transaction_nsu : "";
  const slug =
    typeof input.slug === "string"
      ? input.slug
      : typeof input.invoice_slug === "string"
        ? input.invoice_slug
        : "";
  const plan = orderPlan(orderNsu);
  if (!plan || !transactionNsu || !slug || !handle())
    return { received: true, paid: false };
  const check = await infinitePay<PaymentCheck>("/payment_check", {
    handle: handle(),
    order_nsu: orderNsu,
    transaction_nsu: transactionNsu,
    slug,
  });
  const expected = plan.price * 100;
  if (
    !check?.success ||
    !check.paid ||
    Number(check.paid_amount ?? check.amount) < expected
  )
    return { received: true, paid: false };
  return store.transaction(async (tx) => {
    const [billing] = await tx.select("subscriptions", {
      where: eq("checkoutId", orderNsu),
    });
    if (!billing) return { received: true, paid: false };
    const inserted = await tx.insert(
      "billingEvents",
      { id: `infinitepay:${transactionNsu}` },
      { conflict: "ignore", returning: true },
    );
    if (!inserted.length) return { received: true, paid: true, duplicate: true };
    const accountWorkspaces = await tx.select("workspaces", {
      where: eq("userId", billing.userId),
      orderBy: [asc("id")],
      lock: true,
    });
    await tx.select("users", {
      where: eq("id", billing.userId),
      columns: ["id"],
      lock: true,
    });
    const now = Date.now();
    const current = effectivePlan(billing);
    // Renovar o mesmo plano soma 30 dias ao período restante; trocar de plano começa agora.
    const start =
      current.id === plan.id && billing.currentPeriodEnd
        ? Math.max(now, billing.currentPeriodEnd.getTime())
        : now;
    const periodEnd = new Date(start + PERIOD_DAYS * 86400000);
    const previousLimit = current.dailyLimit;
    for (const row of accountWorkspaces) {
      const preferred = row.data.routine.dailyLimit;
      row.data.routine.dailyLimit =
        preferred === previousLimit
          ? plan.dailyLimit
          : Math.min(preferred, plan.dailyLimit);
      if (row.data.interview)
        row.data.interview.answers.dailyLimit = row.data.routine.dailyLimit;
      await tx.update(
        "workspaces",
        { data: row.data, updatedAt: new Date() },
        eq("id", row.id),
      );
    }
    await tx.update(
      "subscriptions",
      {
        subscriptionId: `infinitepay:${transactionNsu}`,
        plan: plan.id,
        status: "active",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
        checkoutId: null,
        checkoutUrl: null,
        checkoutExpiresAt: null,
        updatedAt: new Date(),
      },
      eq("userId", billing.userId),
    );
    return { received: true, paid: true };
  });
}

export async function cancelAccountSubscription(
  userId: string,
  connection: Transaction | Store = store,
) {
  // Sem cobrança recorrente: só descarta o link pendente.
  await connection.update(
    "subscriptions",
    { checkoutId: null, checkoutUrl: null, checkoutExpiresAt: null },
    eq("userId", userId),
  );
}
