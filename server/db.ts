import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import { and, eq, notInArray, sql } from "drizzle-orm";
import * as schema from "./schema";
import type { Resume, Workspace } from "../shared/types";
import { TARGETS_VERSION } from "./resume-targets";
import { upgradeResumeTargets } from "./workspace-upgrade";
import { lockLocalDatabase } from "./local-database-lock";
import { hostedOnVercel, validateHostedRuntime } from "./auth-config";
import { applyMigrations } from "./database-migrations";
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
if (pg) {
  await pg.begin(async (tx) => {
    // Concurrent cold starts must not race while creating authentication tables.
    await tx`SELECT pg_advisory_xact_lock(184732901)`;
    await applyMigrations((query, parameters) =>
      tx.unsafe(query, parameters || []),
    );
  });
} else
  await local!.transaction((tx) =>
    applyMigrations(async (query, parameters) =>
      parameters
        ? tx.query(query, parameters)
        : query.startsWith("SELECT")
          ? tx.query(query)
          : tx.exec(query),
    ),
  );
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
  if (row.data.resumes.some((r) => r.targetsVersion !== TARGETS_VERSION)) {
    await mutateWorkspace(id, () => {});
    return readWorkspace(id);
  }
  return { ...row.data, revision: row.updatedAt.toISOString() };
}
export async function workspaceRevision(id: string) {
  const [row] = await db
    .select({ revision: schema.workspaces.updatedAt })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id));
  return row?.revision.toISOString() || null;
}
export async function readResumeArchive(
  workspaceId: string,
  resumeId: string,
  connection:
    typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
): Promise<NonNullable<Resume["storedFile"]> | null> {
  const [file] = await connection
    .select({
      extension: schema.resumeFiles.extension,
      ciphertext: schema.resumeFiles.ciphertext,
    })
    .from(schema.resumeFiles)
    .where(
      and(
        eq(schema.resumeFiles.workspaceId, workspaceId),
        eq(schema.resumeFiles.resumeId, resumeId),
      ),
    );
  return file || null;
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
    const previousResumeIds = row.data.resumes.map((resume) => resume.id);
    upgradeResumeTargets(row.data);
    const result = await fn(row.data, tx);
    // A new original is written once, in the same transaction as its metadata.
    // Ordinary reads and mutations never fetch ciphertext.
    for (const resume of row.data.resumes) {
      if (!resume.storedFile) continue;
      await tx
        .insert(schema.resumeFiles)
        .values({ workspaceId: id, resumeId: resume.id, ...resume.storedFile })
        .onConflictDoUpdate({
          target: [schema.resumeFiles.workspaceId, schema.resumeFiles.resumeId],
          set: resume.storedFile,
        });
      delete resume.storedFile;
      resume.originalFileAvailable = true;
    }
    const resumeIds = row.data.resumes.map((resume) => resume.id);
    if (previousResumeIds.some((previous) => !resumeIds.includes(previous)))
      await tx
        .delete(schema.resumeFiles)
        .where(
          and(
            eq(schema.resumeFiles.workspaceId, id),
            resumeIds.length
              ? notInArray(schema.resumeFiles.resumeId, resumeIds)
              : undefined,
          ),
        );
    delete row.data.revision;
    await tx
      .update(schema.workspaces)
      .set({
        data: row.data,
        updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)),
      })
      .where(eq(schema.workspaces.id, id));
    return result;
  });
}
export async function healthDb() {
  await db.execute(sql`SELECT 1`);
}
