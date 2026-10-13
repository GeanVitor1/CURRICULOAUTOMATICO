import "dotenv/config";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import type { Workspace } from "../shared/types";
import { TARGETS_VERSION } from "./resume-targets";
import { upgradeResumeTargets } from "./workspace-upgrade";
import { lockLocalDatabase } from "./local-database-lock";
import { hostedOnVercel, validateHostedRuntime } from "./auth-config";
validateHostedRuntime();
export const dataDir = hostedOnVercel()
  ? resolve(tmpdir(), "empregatos")
  : resolve(process.env.DATA_DIR || ".data");
if (process.env.REDIS_URL && !process.env.DATABASE_URL)
  throw new Error(
    "Configure DATABASE_URL junto com REDIS_URL para utilizar workers separados.",
  );
export const databaseKind = process.env.DATABASE_URL
  ? "PostgreSQL"
  : "PostgreSQL embarcado (local)";
await mkdir(dataDir, { recursive: true });
const pg = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, {
      max: hostedOnVercel() ? 2 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: !hostedOnVercel(),
    })
  : null;
const releaseLocalLock = pg ? null : await lockLocalDatabase(dataDir);
const local = pg ? null : new PGlite(resolve(dataDir, "postgres"));
export const db = (
  pg ? pgDrizzle(pg, { schema }) : localDrizzle(local!, { schema })
) as ReturnType<typeof pgDrizzle<typeof schema>>;
const migrations = await Promise.all(
  (await readdir(resolve("migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => readFile(resolve("migrations", file), "utf8")),
);
if (pg) {
  await pg.begin(async (tx) => {
    // Concurrent cold starts must not race while creating authentication tables.
    await tx`SELECT pg_advisory_xact_lock(184732901)`;
    for (const migration of migrations) await tx.unsafe(migration);
  });
} else for (const migration of migrations) await local!.exec(migration);
export async function closeDb() {
  if (pg) await pg.end();
  else {
    await local!.close();
    await releaseLocalLock?.();
  }
}
export async function readWorkspace(id: string): Promise<Workspace | null> {
  const [row] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id));
  if (!row) return null;
  if (row.data.resumes.some((r) => r.targetsVersion !== TARGETS_VERSION))
    return mutateWorkspace(id, (w) => structuredClone(w));
  return row.data;
}
export async function mutateWorkspace<T>(
  id: string,
  fn: (
    w: Workspace,
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T> | T,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .for("update");
    if (!row) throw new Error("Workspace não encontrado");
    upgradeResumeTargets(row.data);
    const result = await fn(row.data, tx);
    await tx
      .update(schema.workspaces)
      .set({ data: row.data, updatedAt: new Date() })
      .where(eq(schema.workspaces.id, id));
    return result;
  });
}
export async function healthDb() {
  await db.execute(sql`SELECT 1`);
}
