import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import type { Resume, Workspace } from "../shared/types";
import { TARGETS_VERSION } from "./resume-targets";
import { upgradeResumeTargets } from "./workspace-upgrade";
import { lockLocalDatabase } from "./local-database-lock";
import { hostedOnVercel, validateHostedRuntime } from "./auth-config";
import { applyMigrations } from "./database-migrations";
import { isDeepStrictEqual } from "node:util";
import { postgresStore } from "./storage-postgres";
import type { Store } from "./storage-types";
validateHostedRuntime();
export const dataDir = hostedOnVercel()
  ? resolve(tmpdir(), "empregatos")
  : resolve(process.env.DATA_DIR || ".data");
const useFirestore = process.env.DATABASE_PROVIDER === "firestore";
if (process.env.REDIS_URL && !process.env.DATABASE_URL && !useFirestore)
  throw new Error(
    "Configure DATABASE_URL junto com REDIS_URL para utilizar workers separados.",
  );
export const databaseKind = useFirestore
  ? "Cloud Firestore"
  : process.env.DATABASE_URL
    ? "PostgreSQL"
    : "PostgreSQL embarcado (local)";
await mkdir(dataDir, { recursive: true });
const pg =
  !useFirestore && process.env.DATABASE_URL
    ? postgres(process.env.DATABASE_URL, {
        max: hostedOnVercel() ? 2 : 5,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: !hostedOnVercel(),
      })
    : null;
const releaseLocalLock =
  pg || useFirestore ? null : await lockLocalDatabase(dataDir);
const local =
  pg || useFirestore ? null : new PGlite(resolve(dataDir, "postgres"));
export const db = (
  useFirestore
    ? null
    : pg
      ? pgDrizzle(pg, { schema })
      : localDrizzle(local!, { schema })
) as ReturnType<typeof pgDrizzle<typeof schema>>;
if (pg) {
  await pg.begin(async (tx) => {
    // Concurrent cold starts must not race while creating authentication tables.
    await tx`SELECT pg_advisory_xact_lock(184732901)`;
    await applyMigrations((query, parameters) =>
      tx.unsafe(query, parameters || []),
    );
  });
} else if (local)
  await local!.transaction((tx) =>
    applyMigrations(async (query, parameters) =>
      parameters
        ? tx.query(query, parameters)
        : query.startsWith("SELECT")
          ? tx.query(query)
          : tx.exec(query),
    ),
  );
async function closePostgres() {
  if (pg) await pg.end();
  else {
    await local!.close();
    await releaseLocalLock?.();
  }
}
export const store: Store = useFirestore
  ? (await import("./storage-firestore")).createFirestoreStore()
  : postgresStore(db, closePostgres);
export const closeDb = () => store.close();
export async function readWorkspace(id: string): Promise<Workspace | null> {
  const [row] = await store.select("workspaces", {
    where: { field: "id", op: "==", value: id },
  });
  if (!row) return null;
  if (row.data.resumes.some((r) => r.targetsVersion !== TARGETS_VERSION)) {
    await mutateWorkspace(id, () => {});
    return readWorkspace(id);
  }
  return { ...row.data, revision: row.updatedAt.toISOString() };
}
export async function workspaceRevision(id: string) {
  return store.workspaceRevision(id);
}
export async function readResumeArchive(
  workspaceId: string,
  resumeId: string,
  connection: Store = store,
): Promise<NonNullable<Resume["storedFile"]> | null> {
  const [file] = await connection.select("resumeFiles", {
    where: {
      op: "and",
      conditions: [
        { field: "workspaceId", op: "==", value: workspaceId },
        { field: "resumeId", op: "==", value: resumeId },
      ],
    },
  });
  return file
    ? { extension: file.extension, ciphertext: file.ciphertext }
    : null;
}
export async function mutateWorkspace<T>(
  id: string,
  fn: (w: Workspace, tx: Store) => Promise<T> | T,
): Promise<T> {
  return store.transaction(async (tx) => {
    const where = { field: "id", op: "==" as const, value: id };
    const [row] = await tx.select("workspaces", { where, lock: true });
    if (!row) throw new Error("Workspace não encontrado");
    const previous = structuredClone(row.data);
    const previousResumeIds = row.data.resumes.map((resume) => resume.id);
    upgradeResumeTargets(row.data);
    const result = await fn(row.data, tx);
    // A new original is written once, in the same transaction as its metadata.
    // Ordinary reads and mutations never fetch ciphertext.
    for (const resume of row.data.resumes) {
      if (!resume.storedFile) continue;
      await tx.insert(
        "resumeFiles",
        { workspaceId: id, resumeId: resume.id, ...resume.storedFile },
        { conflict: resume.storedFile },
      );
      delete resume.storedFile;
      resume.originalFileAvailable = true;
    }
    const resumeIds = row.data.resumes.map((resume) => resume.id);
    for (const removed of previousResumeIds.filter(
      (previous) => !resumeIds.includes(previous),
    ))
      await tx.delete("resumeFiles", {
        op: "and",
        conditions: [
          { field: "workspaceId", op: "==", value: id },
          { field: "resumeId", op: "==", value: removed },
        ],
      });
    delete row.data.revision;
    if (isDeepStrictEqual(previous, row.data)) return result;
    await tx.update(
      "workspaces",
      {
        data: row.data,
        updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)),
      },
      where,
    );
    return result;
  });
}
export async function healthDb() {
  await store.health();
}
