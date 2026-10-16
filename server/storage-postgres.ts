import {
  and,
  or,
  eq,
  ne,
  lt,
  gt,
  inArray,
  notInArray,
  asc,
  desc,
  sql,
} from "drizzle-orm";
import * as schema from "./schema";
import type {
  Condition,
  Query,
  Store,
  Table,
  WriteOptions,
} from "./storage-types";
import type { Workspace } from "../shared/types";
import type { CandidatePortal } from "./portal-browser-policy";
import { keys } from "./storage-types";
import { dailySubmissionAttempts } from "./submission-attempts";
import { submissionState } from "./submission-state";

export function postgresStore(
  connection: any,
  close: () => Promise<void> = async () => {},
): Store {
  function predicate(table: Table, condition?: Condition): any {
    if (!condition) return undefined;
    if ("conditions" in condition)
      return (condition.op === "and" ? and : or)(
        ...condition.conditions.map((c) => predicate(table, c)),
      );
    const column = (schema[table] as any)[condition.field];
    if (!column) throw new Error("Unknown storage field");
    const operations = {
      "==": eq,
      "!=": ne,
      "<": lt,
      ">": gt,
      in: inArray,
      "not-in": notInArray,
    };
    return (operations[condition.op] as any)(column, condition.value);
  }
  const store: Store = {
    async select(table, query: Query = {}) {
      const columns =
        query.columns &&
        Object.fromEntries(
          query.columns.map((k) => [k, (schema[table] as any)[k]]),
        );
      let q = connection
        .select(columns)
        .from(schema[table])
        .where(predicate(table, query.where))
        .$dynamic();
      if (query.orderBy?.length)
        q = q.orderBy(
          ...query.orderBy.map((o) =>
            (o.direction === "asc" ? asc : desc)(
              (schema[table] as any)[o.field],
            ),
          ),
        );
      if (query.limit) q = q.limit(query.limit);
      if (query.lock) q = q.for("update", { skipLocked: !!query.skipLocked });
      return q;
    },
    async insert(table, values, options: WriteOptions = {}) {
      let q = connection.insert(schema[table]).values(values).$dynamic();
      if (options.conflict === "ignore") q = q.onConflictDoNothing();
      else if (options.conflict)
        q = q.onConflictDoUpdate({
          target: keys[table].map((k) => (schema[table] as any)[k]),
          set: options.conflict,
        });
      if (options.returning) return q.returning();
      await q;
      return [];
    },
    async update(table, values, where, returning = false) {
      const q = connection
        .update(schema[table])
        .set(values)
        .where(predicate(table, where));
      if (returning)
        return q.returning(
          Array.isArray(returning)
            ? Object.fromEntries(
                returning.map((k) => [k, (schema[table] as any)[k]]),
              )
            : undefined,
        );
      await q;
      return [];
    },
    async delete(table, where, returning = false) {
      const q = connection.delete(schema[table]).where(predicate(table, where));
      if (returning) return q.returning();
      await q;
      return [];
    },
    async count(table, where) {
      const [row] = await connection
        .select({ count: sql<number>`count(*)::int` })
        .from(schema[table])
        .where(predicate(table, where));
      return Number(row.count);
    },
    transaction(fn) {
      return connection.transaction((tx: any) => fn(postgresStore(tx)));
    },
    async workspaceRevision(id) {
      const [row] = await connection
        .select({ updatedAt: schema.workspaces.updatedAt })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, id));
      return row?.updatedAt.toISOString() || null;
    },
    async latestResumeId(id) {
      const [row] = await connection
        .select({
          resumeId: sql<string>`${schema.workspaces.data}->'resumes'->0->>'id'`,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, id));
      return row?.resumeId || "";
    },
    async submissionState(id) {
      const [row] = await connection
        .select({
          userId: schema.workspaces.userId,
          data: sql<Workspace>`jsonb_build_object('demo',${schema.workspaces.demo},'routine',${schema.workspaces.data}->'routine','applications',${schema.workspaces.data}->'applications')`,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, id));
      return row ? submissionState(row.data, row.userId) : null;
    },
    async portalMetadata(userId: string, portal: CandidatePortal) {
      const [row] = await connection
        .select({
          metadata: sql`${schema.workspaces.data}->'infrastructure'->'portalConnections'->${portal}::text`,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, `${userId}:live`));
      return row?.metadata || null;
    },
    async routines() {
      return connection
        .select({
          id: schema.workspaces.id,
          routine: sql`${schema.workspaces.data}->'routine'`,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.demo, false));
    },
    async sendingWorkspaceIds() {
      return connection
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(
          sql`${schema.workspaces.data}->'applications' @> '[{"status":"Enviando"}]'::jsonb`,
        );
    },
    async historicalAttempts(userId, _day) {
      const rows = await connection
        .select({
          data: sql<
            Pick<Workspace, "applications">
          >`jsonb_build_object('applications', COALESCE(${schema.workspaces.data}->'applications', '[]'::jsonb))`,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.userId, userId));
      return rows.reduce(
        (total: number, row: any) => total + dailySubmissionAttempts(row.data),
        0,
      );
    },
    async catalogMetadata() {
      const t = schema.sourceCatalog;
      return connection
        .select({
          key: t.key,
          type: t.type,
          board: t.board,
          company: t.company,
          sector: t.sector,
          country: t.country,
          count: sql<number>`jsonb_array_length(${t.jobs})`,
          fetchedAt: t.fetchedAt,
          lastError: t.lastError,
          retryAt: t.retryAt,
          expiresAt: t.expiresAt,
        })
        .from(t)
        .where(ne(t.type, "adzuna"));
    },
    async health() {
      await connection.execute(sql`SELECT 1`);
    },
    close,
  };
  return store;
}
