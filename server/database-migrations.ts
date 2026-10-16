import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

type MigrationRow = { name: string; checksum: string };
/** Caller owns the transaction and, on hosted Postgres, the migration lock. */
export async function applyMigrations(
  run: (query: string, parameters?: string[]) => Promise<unknown>,
) {
  const migrations = await Promise.all(
    (await readdir(resolve("migrations")))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map(async (name) => ({
        name,
        body: await readFile(resolve("migrations", name), "utf8"),
      })),
  );
  await run(
    "CREATE TABLE IF NOT EXISTS empregatos_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL)",
  );
  const applied = await run(
    "SELECT name, checksum FROM empregatos_schema_migrations",
  );
  const rows = (
    Array.isArray(applied)
      ? applied
      : (applied as { rows: MigrationRow[] }).rows
  ) as MigrationRow[];
  const checksums = new Map(rows.map((row) => [row.name, row.checksum]));
  for (const migration of migrations) {
    const checksum = createHash("sha256")
      .update(migration.body.replace(/\r\n/g, "\n"))
      .digest("hex");
    if (checksums.has(migration.name)) {
      if (checksums.get(migration.name) !== checksum)
        throw new Error(`Migration alterada após aplicação: ${migration.name}`);
      continue;
    }
    await run(migration.body);
    await run(
      "INSERT INTO empregatos_schema_migrations (name, checksum) VALUES ($1, $2)",
      [migration.name, checksum],
    );
  }
}
