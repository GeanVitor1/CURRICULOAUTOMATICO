import type { Job } from "../shared/types";
import { store } from "./db";
import { and, eq, gt } from "./storage-types";
import { companyIdentity, opportunityKey } from "./job-identity";
import { publicJob } from "./ats-registry";
import { randomUUID } from "node:crypto";

export async function publishOpportunities(jobs: Job[]) {
  // Bounded writes. Each record is independent, usable by every account.
  const pending = jobs
    .slice(0, 1000)
    .filter((job) => !job.demo && job.url && job.company);
  for (let offset = 0; offset < pending.length; offset += 4) {
    await Promise.all(
      pending.slice(offset, offset + 4).map(async (job) => {
        const row = {
          key: opportunityKey(job),
          companyKey: companyIdentity(job.company),
          job: publicJob(job),
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        };
        await store.transaction(async (tx) => {
          const [old] = await tx.select("opportunityCatalog", {
            where: eq("key", row.key),
            lock: true,
          });
          if (
            !row.job.resolution &&
            old?.job.description === job.description &&
            old.job.title === job.title
          ) {
            row.job.resolution = old.job.resolution;
            row.job.destinations = old.job.destinations;
          }
          await tx.insert("opportunityCatalog", row, { conflict: row });
        });
      }),
    );
  }
}
export async function claimPublicResolution(job: Job) {
  await publishOpportunities([job]);
  const key = opportunityKey(job),
    token = randomUUID();
  return store.transaction(async (tx) => {
    const [row] = await tx.select("opportunityCatalog", {
      where: eq("key", key),
      lock: true,
    });
    if (
      row.job.resolution &&
      Date.parse(row.job.resolution.retryAt) > Date.now()
    )
      return { key, token: null, cached: row.job };
    if (row.leaseUntil && row.leaseUntil > new Date())
      throw new Error(
        "Uma atualização pública desta oportunidade já está em andamento.",
      );
    await tx.update(
      "opportunityCatalog",
      { leaseToken: token, leaseUntil: new Date(Date.now() + 120000) },
      eq("key", key),
    );
    return { key, token, cached: null };
  });
}
export async function finishPublicResolution(
  key: string,
  token: string,
  job?: Job,
) {
  const updated = await store.update(
    "opportunityCatalog",
    {
      ...(job ? { job: publicJob(job), fetchedAt: new Date() } : {}),
      leaseToken: null,
      leaseUntil: null,
    },
    and(eq("key", key), eq("leaseToken", token)),
    ["key"],
  );
  if (!updated.length)
    throw new Error("A reserva de atualização pública expirou.");
}
export async function companyOpportunities(company: string) {
  const rows = await store.select("opportunityCatalog", {
    where: and(
      eq("companyKey", companyIdentity(company)),
      gt("expiresAt", new Date()),
    ),
    limit: 100,
  });
  return rows.map((row) => row.job);
}
