import "dotenv/config";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import type { Workspace } from "../shared/types";
export const dataDir = resolve(process.env.DATA_DIR || ".data");
if (process.env.REDIS_URL && !process.env.DATABASE_URL)
  throw new Error(
    "Configure DATABASE_URL junto com REDIS_URL para utilizar workers separados.",
  );
export const databaseKind = process.env.DATABASE_URL
  ? "PostgreSQL"
  : "PostgreSQL embarcado (local)";
await mkdir(dataDir, { recursive: true });
const pg = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 5 })
  : null;
const local = pg ? null : new PGlite(resolve(dataDir, "postgres"));
export const db = (
  pg ? pgDrizzle(pg, { schema }) : localDrizzle(local!, { schema })
) as ReturnType<typeof pgDrizzle<typeof schema>>;
for (const file of (await readdir(resolve("migrations")))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const migration = await readFile(resolve("migrations", file), "utf8");
  if (pg) await pg.unsafe(migration);
  else await local!.exec(migration);
}
export async function closeDb() {
  if (pg) await pg.end();
  else await local!.close();
}
export async function readWorkspace(id: string): Promise<Workspace | null> {
  const [row] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id));
  return row?.data ?? null;
}
export async function mutateWorkspace<T>(
  id: string,
  fn: (w: Workspace) => Promise<T> | T,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .for("update");
    if (!row) throw new Error("Workspace não encontrado");
    const result = await fn(row.data);
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
