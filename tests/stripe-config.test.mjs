import { describe, expect, it, vi } from "vitest";
import { configureStripe } from "../scripts/stripe-config.mjs";

function fixture(live = false) {
  const prices = [
    {
      id: "price_plus",
      product: "prod_plus",
      currency: "brl",
      unit_amount: 2000,
      recurring: { interval: "month", interval_count: 1 },
      livemode: live,
    },
    {
      id: "price_pro",
      product: "prod_pro",
      currency: "brl",
      unit_amount: 5000,
      recurring: { interval: "month", interval_count: 1 },
      livemode: live,
    },
  ];
  return {
    accounts: {
      retrieve: vi
        .fn()
        .mockResolvedValue({
          id: "acct_fixture",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        }),
    },
    products: {
      list: vi
        .fn()
        .mockResolvedValue({
          data: ["plus", "pro"].map((plan) => ({
            id: `prod_${plan}`,
            livemode: live,
            metadata: { app: "empregatos", plan },
          })),
        }),
      create: vi.fn(),
    },
    prices: {
      list: vi
        .fn()
        .mockImplementation(async ({ product }) => ({
          data: prices.filter((p) => p.product === product),
        })),
      create: vi.fn(),
    },
    billingPortal: {
      configurations: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: vi
          .fn()
          .mockResolvedValue({ id: "bpc_fixture", livemode: live }),
        update: vi.fn(),
      },
    },
    webhookEndpoints: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi
        .fn()
        .mockResolvedValue({
          id: "we_fixture",
          livemode: live,
          secret: "whsec_fixture",
        }),
      update: vi.fn(),
    },
  };
}

describe("Configuração Stripe de teste e produção", () => {
  it("recusa chave do ambiente errado antes de acessar a conta", async () => {
    const stripe = fixture();
    await expect(
      configureStripe({ stripe, key: "sk_test_fixture", mode: "live" }),
    ).rejects.toMatchObject({ code: "LIVE_KEY_REQUIRED" });
    expect(stripe.accounts.retrieve).not.toHaveBeenCalled();
  });
  it("exige ativação de cobranças e recebimentos antes de criar recursos reais", async () => {
    for (const field of [
      "charges_enabled",
      "payouts_enabled",
      "details_submitted",
    ]) {
      const stripe = fixture(true);
      stripe.accounts.retrieve.mockResolvedValue({
        id: "acct_fixture",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        [field]: false,
      });
      await expect(
        configureStripe({ stripe, key: "sk_live_fixture", mode: "live" }),
      ).rejects.toMatchObject({ code: "LIVE_ACCOUNT_NOT_READY" });
      expect(stripe.products.list).not.toHaveBeenCalled();
      expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled();
    }
  });
  it("permite sandbox sem ativação e retorna somente credenciais completas", async () => {
    const stripe = fixture();
    stripe.accounts.retrieve.mockResolvedValue({
      id: "acct_fixture",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });
    const current = { STRIPE_SECRET_KEY: "sk_test_fixture" };
    const result = await configureStripe({
      stripe,
      key: "sk_test_fixture",
      current,
    });
    expect(result.values).toMatchObject({
      STRIPE_PRICE_PLUS: "price_plus",
      STRIPE_PRICE_PRO: "price_pro",
      STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    });
    expect(result.report).toMatchObject({
      mode: "test",
      paymentCreated: false,
    });
    expect(current).toEqual({ STRIPE_SECRET_KEY: "sk_test_fixture" });
    expect(JSON.stringify(result.report)).not.toContain("sk_test_fixture");
    expect(JSON.stringify(result.report)).not.toContain("whsec_fixture");
  });
  it("prepara catálogo e webhook reais sem aproveitar o segredo de teste", async () => {
    const stripe = fixture(true);
    const result = await configureStripe({
      stripe,
      key: "sk_live_fixture",
      mode: "live",
      current: {
        STRIPE_SECRET_KEY: "sk_test_fixture",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
      },
    });
    expect(result.values.STRIPE_WEBHOOK_SECRET).toBe("whsec_fixture");
    expect(result.report.mode).toBe("live");
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
  });
  it("preserva endpoint existente e aceita rotação de chave na mesma conta", async () => {
    const stripe = fixture(true);
    stripe.webhookEndpoints.list.mockResolvedValue({
      data: [
        {
          id: "we_existing",
          url: "https://curriculoautomatico.vercel.app/api/billing/webhook",
          metadata: { app: "empregatos" },
          livemode: true,
        },
      ],
    });
    const result = await configureStripe({
      stripe,
      key: "sk_live_new",
      mode: "live",
      current: {
        STRIPE_SECRET_KEY: "sk_live_old",
        STRIPE_ACCOUNT_ID: "acct_fixture",
        STRIPE_WEBHOOK_SECRET: "whsec_existing",
      },
    });
    expect(result.values.STRIPE_WEBHOOK_SECRET).toBe("whsec_existing");
    expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(stripe.webhookEndpoints.update).toHaveBeenCalledWith(
      "we_existing",
      expect.objectContaining({ disabled: false }),
    );
  });
  it("recusa segredo de outra conta antes de alterar catálogo ou webhook", async () => {
    const stripe = fixture(true);
    stripe.webhookEndpoints.list.mockResolvedValue({
      data: [
        {
          id: "we_existing",
          url: "https://curriculoautomatico.vercel.app/api/billing/webhook",
          metadata: { app: "empregatos" },
          livemode: true,
        },
      ],
    });
    await expect(
      configureStripe({
        stripe,
        key: "sk_live_new",
        mode: "live",
        current: {
          STRIPE_SECRET_KEY: "sk_live_old",
          STRIPE_ACCOUNT_ID: "acct_other",
          STRIPE_WEBHOOK_SECRET: "whsec_other",
        },
      }),
    ).rejects.toMatchObject({ code: "WEBHOOK_SECRET_REQUIRED" });
    expect(stripe.products.list).not.toHaveBeenCalled();
    expect(stripe.webhookEndpoints.update).not.toHaveBeenCalled();
  });
  it("recusa preço de ambiente diferente e não altera o ambiente recebido", async () => {
    const stripe = fixture(true);
    stripe.prices.list.mockResolvedValue({
      data: [
        {
          id: "price_test",
          currency: "brl",
          unit_amount: 2000,
          recurring: { interval: "month", interval_count: 1 },
          livemode: false,
        },
      ],
    });
    const current = { STRIPE_SECRET_KEY: "sk_test_old" };
    await expect(
      configureStripe({
        stripe,
        key: "sk_live_fixture",
        mode: "live",
        current,
      }),
    ).rejects.toMatchObject({ code: "PRICE_MODE_MISMATCH" });
    expect(current).toEqual({ STRIPE_SECRET_KEY: "sk_test_old" });
    expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled();
  });
});
