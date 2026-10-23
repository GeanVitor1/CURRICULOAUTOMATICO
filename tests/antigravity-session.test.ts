import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  stop: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { get: mocks.get } }));
import {
  searchAntigravity,
  withAntigravitySearchSession,
} from "../server/antigravity";
import { withDiscoveryBudget } from "../server/discovery-budget";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.stop.mockResolvedValue(undefined);
  vi.stubEnv("ANTIGRAVITY_ENABLED", "true");
  vi.stubEnv("ANTIGRAVITY_OWNER_ID", "owner");
  mocks.get.mockResolvedValue({
    stop: mocks.stop,
    readFileToBuffer: mocks.read,
    writeFiles: mocks.write,
    runCommand: mocks.run,
  });
  mocks.read.mockResolvedValue(
    Buffer.from(JSON.stringify({ connected: true, model: "test-model" })),
  );
  mocks.run.mockResolvedValue({
    wait: async () => ({
      exitCode: 0,
      stdout: async () =>
        JSON.stringify({
          event: "result",
          result: { status: "SUCCESS", structured_output: { jobs: [] } },
        }),
    }),
  });
});
afterEach(() => vi.unstubAllEnvs());
it("reuses one VM across a discovery and snapshots once after all queries", async () => {
  await withAntigravitySearchSession(async () => {
    await searchAntigravity("owner", "query 1");
    await searchAntigravity("owner", "query 2");
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  expect(mocks.get).toHaveBeenCalledTimes(1);
  expect(mocks.run).toHaveBeenCalledTimes(2);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.stop.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
});
it("reports malformed responses without claiming quota exhaustion and still stops", async () => {
  mocks.run.mockResolvedValue({
    wait: async () => ({ exitCode: 0, stdout: async () => "{truncated" }),
    kill: async () => {},
  });
  await expect(
    withAntigravitySearchSession(() => searchAntigravity("owner", "query")),
  ).rejects.toThrow("fora do formato esperado");
  expect(mocks.stop).toHaveBeenCalledOnce();
});
it("does not start another VM after the discovery deadline", async () => {
  await expect(
    withDiscoveryBudget(1, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await withAntigravitySearchSession(() =>
        searchAntigravity("owner", "query"),
      );
    }),
  ).rejects.toThrow();
  expect(mocks.get).not.toHaveBeenCalled();
});
