// Capacity model, not telemetry. Values are explicit so production measurements
// can replace each assumption without changing the calculation.
export const firestoreFreeQuota = {
  readsPerDay: 50000,
  writesPerDay: 20000,
  storageBytes: 1024 ** 3,
  outboundBytesPerMonth: 10 * 1024 ** 3,
};
export function capacity(input: {
  users: number;
  attemptsPerDay: number;
  days: number;
  readsPerAttempt: number;
  writesPerAttempt: number;
  metadataKiBPerAttempt: number;
  fileKiB: number;
  fileCacheHit: number;
  watchMinutesPerUser: number;
}) {
  const attempts = input.users * input.attemptsPerDay,
    monthly = attempts * input.days;
  // Four small document reads per authenticated revision request; dashboard refresh
  // requests and discovery/catalog usage must fit in the remaining budget.
  const polling = ((input.users * input.watchMinutesPerUser * 60) / 15) * 4;
  const bytesPerAttempt =
    (input.metadataKiBPerAttempt +
      input.fileKiB * 1.4 * (1 - input.fileCacheHit)) *
    1024;
  return {
    attemptsPerDay: attempts,
    attemptsPerMonth: monthly,
    readsPerDay: Math.ceil(attempts * input.readsPerAttempt + polling),
    writesPerDay: attempts * input.writesPerAttempt,
    outboundGiBPerMonth: Number(
      ((monthly * bytesPerAttempt) / 1024 ** 3).toFixed(2),
    ),
    maximumTotalKiBPerAttempt: Number(
      (firestoreFreeQuota.outboundBytesPerMonth / monthly / 1024).toFixed(1),
    ),
    remainingReadsPerDay: Math.floor(
      firestoreFreeQuota.readsPerDay -
        attempts * input.readsPerAttempt -
        polling,
    ),
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/firestore-capacity.ts")) {
  const common = {
    users: 20,
    days: 30,
    readsPerAttempt: 14,
    writesPerAttempt: 6,
    metadataKiBPerAttempt: 24,
    fileKiB: 200,
    fileCacheHit: 0.9,
    watchMinutesPerUser: 20,
  };
  console.log(
    JSON.stringify(
      {
        kind: "scenario-estimates-not-production-usage",
        assumptions: common,
        scenarios: {
          essential: capacity({ ...common, attemptsPerDay: 50 }),
          pro: capacity({ ...common, attemptsPerDay: 100 }),
          proWithoutFileCache: capacity({
            ...common,
            attemptsPerDay: 100,
            fileCacheHit: 0,
          }),
          proLargeFilesWithoutCache: capacity({
            ...common,
            attemptsPerDay: 100,
            fileKiB: 1024,
            fileCacheHit: 0,
          }),
          proSlowPortals: capacity({
            ...common,
            attemptsPerDay: 100,
            readsPerAttempt: 24,
            writesPerAttempt: 18,
          }),
        },
      },
      null,
      2,
    ),
  );
}
