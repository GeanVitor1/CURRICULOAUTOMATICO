import { expect, it } from "vitest";
import { capacity } from "../scripts/firestore-capacity";
it("exposes the transfer bottleneck at twenty full Pro subscribers without assuming cache hits", () => {
  const full = {
    users: 20,
    days: 30,
    attemptsPerDay: 100,
    readsPerAttempt: 14,
    writesPerAttempt: 6,
    metadataKiBPerAttempt: 24,
    fileKiB: 1024,
    fileCacheHit: 0,
    watchMinutesPerUser: 20,
  };
  const cold = capacity(full),
    warm = capacity({ ...full, fileKiB: 200, fileCacheHit: 0.9 });
  expect(cold.attemptsPerMonth).toBe(60000);
  expect(cold.outboundGiBPerMonth).toBeGreaterThan(80);
  expect(cold.maximumTotalKiBPerAttempt).toBe(174.8);
  expect(warm.readsPerDay).toBe(34400);
  expect(warm.writesPerDay).toBe(12000);
  expect(warm.outboundGiBPerMonth).toBeLessThan(4);
  const slow = capacity({ ...full, readsPerAttempt: 24, writesPerAttempt: 18 });
  expect(slow.writesPerDay).toBeGreaterThan(20000);
  expect(slow.remainingReadsPerDay).toBeLessThan(0);
});
