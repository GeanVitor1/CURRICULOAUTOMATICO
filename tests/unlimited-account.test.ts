import { afterEach, expect, it, vi } from "vitest";
vi.mock("../server/db", () => ({ store: { select: vi.fn(async () => []) } }));
import { accountPlan, unlimitedAccount } from "../server/billing";
afterEach(() => { delete process.env.UNLIMITED_ACCOUNT_IDS; });
it("gives listed accounts the highest daily ceiling without a subscription", async () => {
  process.env.UNLIMITED_ACCOUNT_IDS = "other, owner-1";
  expect(unlimitedAccount("owner-1")).toBe(true);
  expect((await accountPlan("owner-1")).dailyLimit).toBe(100);
});
it("keeps every other account on its subscription plan", async () => {
  process.env.UNLIMITED_ACCOUNT_IDS = "owner-1";
  expect(unlimitedAccount("someone")).toBe(false);
  expect(unlimitedAccount(undefined)).toBe(false);
  expect((await accountPlan("someone")).dailyLimit).toBe(5);
});
