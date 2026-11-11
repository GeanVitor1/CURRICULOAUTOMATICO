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
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createWorkspace } from "../server/workspace";

// InfinitePay é simulada: nenhuma chamada sai da máquina.
let payment: Record<string, unknown> = { success: true, paid: false };
const fetchMock = vi.fn(async (url: string | URL, _init?: any) => {
  const path = String(url);
  if (path.endsWith("/links"))
    return new Response(
      JSON.stringify({ url: "https://checkout.infinitepay.io/fixture" }),
      { status: 200 },
    );
  if (path.endsWith("/payment_check"))
    return new Response(JSON.stringify(payment), { status: 200 });
  return new Response("{}", { status: 404 });
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
  customerId: `infinitepay:${userId}`,
  plan,
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 86400000),
});
async function checkout(plan: "plus" | "pro") {
  await database.db
    .update(schema.subscriptions)
    .set({ checkoutId: null, checkoutUrl: null, checkoutExpiresAt: null })
    .where(eq(schema.subscriptions.userId, userId));
  await billing.createCheckout(userId, plan);
  const [row] = await database.db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId));
  return row.checkoutId!;
}
async function webhook(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(body),
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
}, 120000);
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  payment = { success: true, paid: false };
  vi.stubEnv("INFINITEPAY_HANDLE", "empregatos");
  vi.stubEnv("INFINITEPAY_API_KEY", "");
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
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
      paymentMode: "live",
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
    expect(fetchMock).not.toHaveBeenCalled();
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
      database.store.transaction((tx) =>
        billing.reserveApplication(tx, userId, randomUUID(), 100, 0),
      ),
    ).rejects.toThrow("Limite diário");
  });
  it("não reserva duas vezes a mesma candidatura, nem cobra a cota de outro usuário", async () => {
    const id = randomUUID();
    await database.store.transaction((tx) =>
      billing.reserveApplication(tx, userId, id, 100, 0),
    );
    await expect(
      database.store.transaction((tx) =>
        billing.reserveApplication(tx, userId, id, 100, 0),
      ),
    ).rejects.toThrow("já teve uma tentativa");
    expect((await billing.billingSummary(userId)).usedToday).toBe(1);
  });
  it("cota paga usa 50 ou 100 em vez de aceitar limite arbitrário", async () => {
    await database.db.insert(schema.subscriptions).values(paid("pro"));
    expect(
      await database.store.transaction((tx) =>
        billing.workspaceDailyLimit(tx, `${userId}:live`, 100),
      ),
    ).toBe(100);
    await database.db
      .update(schema.subscriptions)
      .set({ plan: "plus" })
      .where(eq(schema.subscriptions.userId, userId));
    expect(
      await database.store.transaction((tx) =>
        billing.workspaceDailyLimit(tx, `${userId}:live`, 100),
      ),
    ).toBe(50);
    await database.db
      .update(schema.subscriptions)
      .set({ status: "past_due" })
      .where(eq(schema.subscriptions.userId, userId));
    expect(
      await database.store.transaction((tx) =>
        billing.workspaceDailyLimit(tx, `${userId}:live`, 100),
      ),
    ).toBe(5);
  });
  it("checkout exige conta, CSRF e configuração da InfinitePay", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/billing/checkout",
          payload: { plan: "plus" },
        })
      ).statusCode,
    ).toBe(403);
    vi.stubEnv("INFINITEPAY_HANDLE", "");
    const unconfigured = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: headers(),
      payload: { plan: "plus" },
    });
    expect(unconfigured.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("checkout usa preço do servidor, não ativa o plano antes de pagar e reaproveita o link", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: headers(),
      payload: { plan: "plus" },
    });
    expect(first.json()).toEqual({ url: "https://checkout.infinitepay.io/fixture" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    const body = JSON.parse(init.body);
    expect(body.handle).toBe("empregatos");
    expect(body.items).toEqual([
      expect.objectContaining({ quantity: 1, price: 2000 }),
    ]);
    expect(body.order_nsu).toMatch(/^plus\./);
    expect(body.order_nsu).not.toContain(userId);
    expect(body.webhook_url).toBe("http://127.0.0.1:5173/api/billing/webhook");
    expect(
      (await app.inject({ url: "/api/billing", headers: headers() })).json()
        .plan,
    ).toBe("free");
    await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: headers(),
      payload: { plan: "plus" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("webhook só libera após confirmar em /payment_check e é idempotente", async () => {
    const order = await checkout("plus");
    payment = { success: true, paid: true, amount: 2000, paid_amount: 2000 };
    const first = await webhook({ order_nsu: order, transaction_nsu: "tx1", invoice_slug: "s1" });
    expect(first.statusCode).toBe(200);
    const check = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/payment_check"));
    expect(JSON.parse(check![1].body)).toEqual({
      handle: "empregatos",
      order_nsu: order,
      transaction_nsu: "tx1",
      slug: "s1",
    });
    const [row] = await database.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    expect(row.plan).toBe("plus");
    expect(row.status).toBe("active");
    const days = (row.currentPeriodEnd!.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect((await billing.accountPlan(userId)).dailyLimit).toBe(50);
    await webhook({ order_nsu: order, transaction_nsu: "tx1", invoice_slug: "s1" });
    const [again] = await database.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    expect(again.currentPeriodEnd!.getTime()).toBe(row.currentPeriodEnd!.getTime());
  });
  it("webhook forjado, pagamento não confirmado ou valor menor não liberam o plano", async () => {
    const order = await checkout("pro");
    payment = { success: true, paid: false };
    await webhook({ order_nsu: order, transaction_nsu: "tx2", invoice_slug: "s2" });
    expect((await billing.accountPlan(userId)).id).toBe("free");
    payment = { success: true, paid: true, amount: 5000, paid_amount: 100 };
    await webhook({ order_nsu: order, transaction_nsu: "tx3", invoice_slug: "s3" });
    expect((await billing.accountPlan(userId)).id).toBe("free");
    payment = { success: true, paid: true, amount: 5000, paid_amount: 5000 };
    await webhook({ order_nsu: "pro.desconhecido", transaction_nsu: "tx4", invoice_slug: "s4" });
    expect((await billing.accountPlan(userId)).id).toBe("free");
    await webhook({ order_nsu: order });
    expect((await billing.accountPlan(userId)).id).toBe("free");
  });
  it("renovar o mesmo plano soma 30 dias ao período restante", async () => {
    payment = { success: true, paid: true, amount: 2000, paid_amount: 2000 };
    const first = await checkout("plus");
    await webhook({ order_nsu: first, transaction_nsu: "r1", invoice_slug: "a" });
    const second = await checkout("plus");
    expect(second).not.toBe(first);
    await webhook({ order_nsu: second, transaction_nsu: "r2", invoice_slug: "b" });
    const [row] = await database.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    const days = (row.currentPeriodEnd!.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(59.9);
  });
  it("retorno do checkout confirma o pagamento para a conta autenticada", async () => {
    const order = await checkout("plus");
    payment = { success: true, paid: true, amount: 2000, paid_amount: 2000 };
    const anonymous = await app.inject({
      method: "POST",
      url: "/api/billing/confirm",
      headers: { origin: "http://127.0.0.1:5173", "x-orbita-request": "1" },
      payload: { order_nsu: order, transaction_nsu: "c1", slug: "c" },
    });
    expect(anonymous.statusCode).toBe(401);
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/billing/confirm",
      headers: headers(),
      payload: { order_nsu: order, transaction_nsu: "c1", slug: "c" },
    });
    expect(confirmed.json()).toMatchObject({ paid: true });
    expect((await billing.accountPlan(userId)).id).toBe("plus");
  });
  it("portal não existe sem cobrança recorrente e exclusão descarta link pendente", async () => {
    const portal = await app.inject({
      method: "POST",
      url: "/api/billing/portal",
      headers: headers(),
    });
    expect(portal.statusCode).toBe(400);
    await checkout("plus");
    await billing.cancelAccountSubscription(userId);
    const [row] = await database.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    expect(row.checkoutId).toBeNull();
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
