import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { createWorkspace } from "../server/workspace";

const stripe = vi.hoisted(() => ({
  prices: { retrieve: vi.fn() },
  customers: { create: vi.fn() },
  subscriptions: { retrieve: vi.fn(), list: vi.fn(), cancel: vi.fn() },
  checkout: {
    sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() },
  },
  billingPortal: { sessions: { create: vi.fn() } },
}));
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  const real = new actual.default("sk_test_fixture");
  return {
    default: class {
      constructor() {
        return { ...stripe, webhooks: real.webhooks };
      }
    },
  };
});
let directory = "",
  app: FastifyInstance,
  userId = "",
  cookie = "";
let database: typeof import("../server/db"),
  schema: typeof import("../server/schema"),
  billing: typeof import("../server/billing");
const headers = () => ({
  cookie,
  origin: "http://127.0.0.1:5173",
  "x-orbita-request": "1",
});
const paid = (plan = "plus") => ({
  userId,
  customerId: `cus_${userId}`,
  plan,
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 86400000),
});
const price = (id = "price_plus", amount = 2000) => ({
  id,
  active: true,
  currency: "brl",
  unit_amount: amount,
  recurring: { interval: "month", interval_count: 1 },
});
const subscription = (overrides = {}) => ({
  id: `sub_${userId}`,
  customer: `cus_${userId}`,
  status: "active",
  cancel_at_period_end: false,
  latest_invoice: { status: "paid" },
  items: {
    data: [
      {
        price: price(),
        quantity: 1,
        current_period_end: Math.floor(Date.now() / 1000) + 86400,
      },
    ],
  },
  ...overrides,
});
const event = (type = "customer.subscription.updated", overrides = {}) =>
  ({
    id: `evt_${randomUUID()}`,
    type,
    data: {
      object: { id: `sub_${userId}`, customer: `cus_${userId}`, ...overrides },
    },
  }) as unknown as Stripe.Event;
async function webhook(body: Stripe.Event, signature?: string) {
  const raw = JSON.stringify(body),
    timestamp = Math.floor(Date.now() / 1000);
  const signed = `t=${timestamp},v1=${createHmac("sha256", "whsec_fixture").update(`${timestamp}.${raw}`).digest("hex")}`;
  return app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature || signed,
    },
    payload: raw,
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-billing-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  database = await import("../server/db");
  schema = await import("../server/schema");
  billing = await import("../server/billing");
  app = await (await import("../server/app")).buildApp({ serveStatic: false });
}, 30000);
beforeEach(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
  vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus");
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION", "");
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:5173");
  vi.stubEnv("API_PROXY_SECRET", "");
  userId = randomUUID();
  const token = randomUUID();
  cookie = `orbita_session=${token}`;
  await database.db.insert(schema.users).values({
    id: userId,
    email: `${userId}@example.test`,
    name: "Billing test",
  });
  await database.db.insert(schema.sessions).values({
    token: createHash("sha256").update(token).digest("hex"),
    userId,
    expiresAt: new Date(Date.now() + 86400000),
  });
  await database.db.insert(schema.workspaces).values({
    id: `${userId}:live`,
    userId,
    data: createWorkspace("Billing test", `${userId}@example.test`),
  });
  stripe.prices.retrieve.mockResolvedValue(price());
  stripe.customers.create.mockResolvedValue({ id: `cus_${userId}` });
  stripe.subscriptions.list.mockResolvedValue({ data: [], has_more: false });
  stripe.subscriptions.retrieve.mockResolvedValue(subscription());
  stripe.checkout.sessions.create.mockResolvedValue({
    id: "cs_fixture",
    url: "https://checkout.stripe.com/fixture",
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  });
  stripe.checkout.sessions.retrieve.mockResolvedValue({
    id: "cs_fixture",
    status: "open",
  });
  stripe.billingPortal.sessions.create.mockResolvedValue({
    url: "https://billing.stripe.com/fixture",
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-billing-")))
    await rm(directory, { recursive: true, force: true });
});

describe("Planos, pagamento e cota protegida", () => {
  it("começa gratuitamente com 5 e mantém os planos públicos sem expor dados financeiros", async () => {
    expect(
      (await app.inject("/api/plans"))
        .json()
        .map((p: any) => [p.price, p.dailyLimit]),
    ).toEqual([
      [0, 5],
      [20, 50],
      [50, 100],
    ]);
    expect(
      (await app.inject({ url: "/api/billing", headers: headers() })).json(),
    ).toMatchObject({
      paymentMode: "test",
      plan: "free",
      dailyLimit: 5,
      usedToday: 0,
      remainingToday: 5,
    });
    expect((await app.inject("/api/billing")).statusCode).toBe(401);
  });
  it("não libera planos com query de sucesso nem com JSON escolhido pelo navegador", async () => {
    expect(
      (
        await app.inject({
          url: "/api/billing?billing=success&plan=pro",
          headers: headers(),
        })
      ).json().plan,
    ).toBe("free");
    const result = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: headers(),
      payload: { plan: "pro", price: 1, userId: "victim" },
    });
    expect(result.statusCode).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("limita a preferência gratuita no servidor mesmo se o cliente pedir 100", async () => {
    await database.mutateWorkspace(`${userId}:live`, (w) =>
      w.sources.push({
        id: "fixture",
        type: "greenhouse",
        company: "Fixture",
        board: "fixture",
        discovery: true,
        application: false,
        enabled: true,
        status: "",
      }),
    );
    const result = await app.inject({
      method: "PUT",
      url: "/api/routine",
      headers: headers(),
      payload: {
        enabled: false,
        mode: "discovery",
        dailyLimit: 100,
        minScore: 0,
        time: "08:00",
      },
    });
    expect(result.statusCode).toBe(200);
    expect(
      (await database.readWorkspace(`${userId}:live`))!.routine.dailyLimit,
    ).toBe(5);
  });
  it("libera 50 e 100 apenas durante a vigência paga e respeita a virada do dia de Brasília", async () => {
    await database.db.insert(schema.subscriptions).values(paid());
    expect((await billing.billingSummary(userId)).dailyLimit).toBe(50);
    await database.db
      .update(schema.subscriptions)
      .set({ plan: "pro" })
      .where(eq(schema.subscriptions.userId, userId));
    expect((await billing.billingSummary(userId)).dailyLimit).toBe(100);
    await database.db
      .update(schema.subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() - 1000) })
      .where(eq(schema.subscriptions.userId, userId));
    expect((await billing.billingSummary(userId)).dailyLimit).toBe(5);
    expect(billing.billingDay(new Date("2026-10-14T02:59:59Z"))).toBe(
      "2026-10-13",
    );
    expect(billing.billingDay(new Date("2026-10-14T03:00:00Z"))).toBe(
      "2026-10-14",
    );
  });
  it("envios concorrentes reservam só cinco tentativas e apagar o histórico não repõe a cota", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        database.mutateWorkspace(`${userId}:live`, async (_w, tx) =>
          billing.reserveApplication(tx, userId, randomUUID(), 100, 0),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect((await billing.billingSummary(userId)).remainingToday).toBe(0);
    await database.mutateWorkspace(
      `${userId}:live`,
      (w) => (w.applications = []),
    );
    await expect(
      database.db.transaction((tx) =>
        billing.reserveApplication(tx, userId, randomUUID(), 100, 0),
      ),
    ).rejects.toThrow("Limite diário");
  });
  it("não reserva duas vezes a mesma candidatura, nem cobra a cota de outro usuário", async () => {
    const id = randomUUID();
    await database.db.transaction((tx) =>
      billing.reserveApplication(tx, userId, id, 100, 0),
    );
    await expect(
      database.db.transaction((tx) =>
        billing.reserveApplication(tx, userId, id, 100, 0),
      ),
    ).rejects.toThrow("já teve uma tentativa");
    expect((await billing.billingSummary(userId)).usedToday).toBe(1);
  });
  it("cota paga usa 50 ou 100 em vez de aceitar limite arbitrário", async () => {
    await database.db.insert(schema.subscriptions).values(paid("pro"));
    expect(
      await database.db.transaction((tx) =>
        billing.workspaceDailyLimit(tx, `${userId}:live`, 100),
      ),
    ).toBe(100);
    await database.db
      .update(schema.subscriptions)
      .set({ plan: "plus" })
      .where(eq(schema.subscriptions.userId, userId));
    expect(
      await database.db.transaction((tx) =>
        billing.workspaceDailyLimit(tx, `${userId}:live`, 100),
      ),
    ).toBe(50);
    await database.db
      .update(schema.subscriptions)
      .set({ status: "past_due" })
      .where(eq(schema.subscriptions.userId, userId));
    expect(
      await database.db.transaction((tx) =>
        billing.workspaceDailyLimit(tx, `${userId}:live`, 100),
      ),
    ).toBe(5);
  });
  it("checkout exige conta, CSRF, configuração completa e preço mensal BRL correto", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/billing/checkout",
          payload: { plan: "plus" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/billing/checkout",
          headers: { ...headers(), cookie: "" },
          payload: { plan: "plus" },
        })
      ).statusCode,
    ).toBe(401);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    await expect(billing.createCheckout(userId, "plus")).rejects.toThrow(
      "não estão disponíveis",
    );
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
    stripe.prices.retrieve.mockResolvedValue(price("price_plus", 1));
    await expect(billing.createCheckout(userId, "plus")).rejects.toThrow(
      "preço",
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("checkout usa preço do servidor, identifica o cliente e não ativa o plano antes de pagar", async () => {
    const result = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: headers(),
      payload: { plan: "plus" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().url).toContain("checkout.stripe.com");
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      mode: "subscription",
      customer: `cus_${userId}`,
      client_reference_id: userId,
      line_items: [{ price: "price_plus", quantity: 1 }],
    });
    expect((await billing.billingSummary(userId)).plan).toBe("free");
  });
  it("impede duas assinaturas, inclusive quando a primeira está pendente", async () => {
    await database.db.insert(schema.subscriptions).values(paid());
    stripe.subscriptions.list.mockResolvedValue({
      data: [{ status: "incomplete" }],
      has_more: false,
    });
    await expect(billing.createCheckout(userId, "plus")).rejects.toThrow(
      "já possui",
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("um novo checkout expira o anterior para impedir pagamentos duplicados", async () => {
    await billing.createCheckout(userId, "plus");
    await billing.createCheckout(userId, "plus");
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_fixture");
  });
  it("retoma checkout aberto do mesmo plano e usa chave idempotente", async () => {
    await billing.createCheckout(userId, "plus");
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_fixture",
      status: "open",
      url: "https://checkout.stripe.com/fixture",
      metadata: { plan: "plus" },
    });
    await billing.createCheckout(userId, "plus");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledOnce();
    expect(
      stripe.checkout.sessions.create.mock.calls[0][1].idempotencyKey,
    ).toContain(userId);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });
  it("webhook recebe bytes originais, valida assinatura, libera pagamento confirmado e é idempotente", async () => {
    await database.db
      .insert(schema.subscriptions)
      .values({ ...paid(), plan: "free", status: "inactive" });
    const payload = event();
    expect((await webhook(payload, "t=1,v1=bad")).statusCode).toBe(400);
    expect((await billing.billingSummary(userId)).plan).toBe("free");
    expect((await webhook(payload)).statusCode).toBe(200);
    expect((await billing.billingSummary(userId)).plan).toBe("plus");
    expect(
      (await database.readWorkspace(`${userId}:live`))!.routine.dailyLimit,
    ).toBe(50);
    expect((await webhook(payload)).json().duplicate).toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledOnce();
  });
  it("fatura ainda não paga não libera a assinatura mesmo com subscription active", async () => {
    await database.db
      .insert(schema.subscriptions)
      .values({ ...paid(), plan: "free" });
    stripe.subscriptions.retrieve.mockResolvedValue(
      subscription({ latest_invoice: { status: "open" } }),
    );
    expect(
      (
        await webhook(
          event("checkout.session.completed", {
            subscription: `sub_${userId}`,
          }),
        )
      ).statusCode,
    ).toBe(200);
    expect((await billing.billingSummary(userId)).plan).toBe("free");
  });
  it("eventos atrasados consultam o estado atual e não restauram plano cancelado", async () => {
    await database.db.insert(schema.subscriptions).values(paid());
    stripe.subscriptions.retrieve.mockResolvedValue(
      subscription({ status: "canceled" }),
    );
    expect((await webhook(event())).statusCode).toBe(200);
    expect((await billing.billingSummary(userId)).plan).toBe("free");
  });
  it("cancelamento no fim do mês preserva o acesso até a data paga", async () => {
    await database.db.insert(schema.subscriptions).values(paid());
    stripe.subscriptions.retrieve.mockResolvedValue(
      subscription({ cancel_at_period_end: true }),
    );
    expect((await webhook(event())).statusCode).toBe(200);
    expect(await billing.billingSummary(userId)).toMatchObject({
      plan: "plus",
      cancelAtPeriodEnd: true,
    });
  });
  it("falha temporária na Stripe permite repetir o webhook sem perder confirmação", async () => {
    await database.db
      .insert(schema.subscriptions)
      .values({ ...paid(), plan: "free" });
    const payload = event();
    stripe.subscriptions.retrieve.mockRejectedValueOnce(new Error("offline"));
    expect((await webhook(payload)).statusCode).toBe(500);
    expect((await webhook(payload)).statusCode).toBe(200);
    expect((await billing.billingSummary(userId)).plan).toBe("plus");
  });
  it("portal usa somente o cliente da conta autenticada", async () => {
    await database.db.insert(schema.subscriptions).values(paid());
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/billing/portal",
          headers: headers(),
        })
      ).statusCode,
    ).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: `cus_${userId}`,
      return_url: "http://127.0.0.1:5173/app#conta",
    });
  });
  it("exclusão cancela cobranças ativas e expira checkout aberto", async () => {
    await database.db
      .insert(schema.subscriptions)
      .values({ ...paid(), checkoutId: "cs_fixture" });
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        { id: "sub_active", status: "active" },
        { id: "sub_old", status: "canceled" },
      ],
      has_more: false,
    });
    await billing.cancelAccountSubscription(userId);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledOnce();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_active");
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_fixture");
  });
  it("currículo fica criptografado em disco, recupera bytes e recusa adulteração", async () => {
    const storage = await import("../server/resume-storage");
    const path = join(directory, "private-resume.pdf"),
      bytes = Buffer.from("%PDF-1.7 private contact 123");
    await storage.writePrivateResume(path, bytes);
    expect((await readFile(path)).includes(bytes)).toBe(false);
    expect(await storage.readPrivateResume(path)).toEqual(bytes);
    const stored = await readFile(path, "utf8");
    await writeFile(
      path,
      stored.replace("EMPREGATOS-RESUME-V1\n", "EMPREGATOS-RESUME-V1\nAAAA"),
    );
    await expect(storage.readPrivateResume(path)).rejects.toThrow();
    const legacy = join(directory, "legacy.docx");
    await writeFile(legacy, bytes);
    expect(await storage.readPrivateResume(legacy)).toEqual(bytes);
  });
});
