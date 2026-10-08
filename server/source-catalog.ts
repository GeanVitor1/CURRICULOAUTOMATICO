import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { sourceCatalog } from "./schema";
import { connectors, SourceError } from "./connectors";
import type { Job, Source } from "../shared/types";

export function catalogKey(source: Source) {
  // Jobicy is one global public sync, even across different user preferences.
  if (source.type === "jobicy") return "jobicy:public";
  const country =
    source.type === "adzuna"
      ? source.country || process.env.ADZUNA_COUNTRY || ""
      : "";
  return JSON.stringify([source.type, source.board, country]);
}
const inflight = new Map<
  string,
  Promise<{ jobs: Job[]; cached: boolean; checkedAt: string }>
>();
export async function discoverCachedSource(source: Source) {
  const key = catalogKey(source);
  const running = inflight.get(key);
  if (running) return structuredClone(await running);
  const task = load(source, key);
  inflight.set(key, task);
  try {
    return structuredClone(await task);
  } finally {
    inflight.delete(key);
  }
}
async function load(source: Source, key: string) {
  const connector = connectors[source.type];
  if (!connector?.discovery)
    throw new SourceError(
      "Esta fonte não possui uma integração de descoberta disponível.",
    );
  await db
    .insert(sourceCatalog)
    .values({
      key,
      type: source.type,
      board: source.type === "jobicy" ? "public" : source.board,
      company: source.type === "jobicy" ? "Jobicy" : source.company,
      sector: source.sector || "Não informado",
      country: source.country || "",
    })
    .onConflictDoNothing();
  const leaseToken = randomUUID();
  const claim = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(sourceCatalog)
      .where(eq(sourceCatalog.key, key))
      .for("update");
    if (row.expiresAt && row.expiresAt.getTime() > Date.now() && !row.lastError)
      return row;
    if (row.retryAt && row.retryAt.getTime() > Date.now())
      throw new SourceError(
        row.lastError ||
          "A fonte está em pausa após uma falha; tente mais tarde.",
      );
    if (row.leaseUntil && row.leaseUntil.getTime() > Date.now())
      throw new SourceError(
        "Esta organização já está sendo atualizada por outro worker; tente novamente em instantes.",
      );
    await tx
      .update(sourceCatalog)
      .set({ leaseToken, leaseUntil: new Date(Date.now() + 600000) })
      .where(eq(sourceCatalog.key, key));
    return null;
  });
  if (claim)
    return {
      jobs: claim.jobs,
      cached: true,
      checkedAt: claim.fetchedAt!.toISOString(),
    };
  try {
    const jobs = await connector.discover(source);
    const checkedAt = new Date();
    // One new Jobicy sync per hour. Adzuna cache avoids repeated licensed queries.
    const ttl =
      source.type === "jobicy" || source.type === "adzuna" ? 3600000 : 900000;
    const updated = await db
      .update(sourceCatalog)
      .set({
        jobs,
        fetchedAt: checkedAt,
        expiresAt: new Date(checkedAt.getTime() + ttl),
        retryAt: null,
        lastError: null,
        leaseUntil: null,
        leaseToken: null,
      })
      .where(
        and(
          eq(sourceCatalog.key, key),
          eq(sourceCatalog.leaseToken, leaseToken),
        ),
      )
      .returning({ key: sourceCatalog.key });
    if (!updated.length)
      throw new SourceError(
        "A atualização excedeu seu tempo de reserva. Repita a busca.",
      );
    return { jobs, cached: false, checkedAt: checkedAt.toISOString() };
  } catch (error) {
    const message =
      error instanceof SourceError
        ? error.message
        : "Não foi possível atualizar esta fonte.";
    const cooldown = Math.max(
      source.type === "jobicy" ? 3600000 : 60000,
      error instanceof SourceError ? error.retryAfterMs : 0,
    );
    await db
      .update(sourceCatalog)
      .set({
        lastError: message,
        retryAt: new Date(Date.now() + cooldown),
        leaseUntil: null,
        leaseToken: null,
      })
      .where(
        and(
          eq(sourceCatalog.key, key),
          eq(sourceCatalog.leaseToken, leaseToken),
        ),
      );
    // Old genuine jobs remain stored, but are never passed off as a successful new query.
    throw new SourceError(message);
  }
}
export async function inspectSourceCatalog() {
  // Count inside PostgreSQL; metadata listing must not transfer every description from JSONB.
  const rows = await db
    .select({
      key: sourceCatalog.key,
      type: sourceCatalog.type,
      board: sourceCatalog.board,
      company: sourceCatalog.company,
      sector: sourceCatalog.sector,
      country: sourceCatalog.country,
      count: sql<number>`jsonb_array_length(${sourceCatalog.jobs})`,
      fetchedAt: sourceCatalog.fetchedAt,
      lastError: sourceCatalog.lastError,
      retryAt: sourceCatalog.retryAt,
      expiresAt: sourceCatalog.expiresAt,
    })
    .from(sourceCatalog)
    .where(ne(sourceCatalog.type, "adzuna"));
  // Public metadata only: no user preferences and no complete job feed in this endpoint.
  // Adzuna board contains a search preference, not an organization. Keep it private.
  return rows
    .filter((row) => row.type !== "adzuna")
    .map((row) => ({
      key: row.key,
      type: row.type,
      board: row.board,
      company: row.company,
      sector: row.sector,
      country: row.country,
      count: Number(row.count),
      lastCheckedAt: row.fetchedAt?.toISOString() || null,
      lastError: row.lastError,
      status: row.lastError
        ? "indisponível"
        : row.fetchedAt
          ? "verificada"
          : "aguardando verificação",
      nextCheckAt: (row.retryAt || row.expiresAt)?.toISOString() || null,
    }));
}
