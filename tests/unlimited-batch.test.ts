import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: null as any, usage: 0 }));
vi.mock("../server/db", () => {
  const tx = {
    select: vi.fn(async (table: string) => table === "workspaces" ? [state.row] : table === "subscriptions" ? [] : []),
    count: vi.fn(async () => state.usage),
    insert: vi.fn(async () => []),
    update: vi.fn(async () => []),
  };
  return { store: { ...tx, transaction: async (run: any) => run(tx) }, mutateWorkspace: vi.fn() };
});
vi.mock("../server/vercel-dispatch", () => ({ dispatchDiscovery: vi.fn() }));
vi.mock("../server/operations", () => ({ discover: vi.fn(), notify: vi.fn(), processAutomaticApplications: vi.fn(), recoverInterruptedSends: vi.fn() }));
import { enqueueDiscovery } from "../server/discovery-queue";
const workspace = (dailyLimit: number) => ({ id: "w", userId: "owner", demo: false, data: {
  routine: { dailyLimit }, runs: [], jobs: [], applications: [{ status: "Aguardando aprovação", history: [] }],
  sources: [{ enabled: true, discovery: true }] } });
afterEach(() => { delete process.env.UNLIMITED_ACCOUNT_IDS; });
it("releases one free-plan batch per new search on top of today's usage", async () => {
  process.env.UNLIMITED_ACCOUNT_IDS = "owner";
  state.row = workspace(5); state.usage = 7;
  await enqueueDiscovery("w");
  expect(state.row.data.routine.dailyLimit).toBe(7 + 1 + 5);
  state.usage = 98; await enqueueDiscovery("w");
  expect(state.row.data.routine.dailyLimit).toBe(100);
});
it("leaves continuations and regular accounts untouched", async () => {
  process.env.UNLIMITED_ACCOUNT_IDS = "owner";
  state.row = workspace(5); state.usage = 7;
  await enqueueDiscovery("w", "user_triggered_automation", true);
  expect(state.row.data.routine.dailyLimit).toBe(5);
  process.env.UNLIMITED_ACCOUNT_IDS = "someone-else";
  await enqueueDiscovery("w");
  expect(state.row.data.routine.dailyLimit).toBe(5);
});
