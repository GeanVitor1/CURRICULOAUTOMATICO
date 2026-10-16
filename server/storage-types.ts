import type * as schema from "./schema";
import type { Workspace } from "../shared/types";
import type { CandidatePortal } from "./portal-browser-policy";

export type Table = keyof typeof schema;
export type Row<T extends Table> = (typeof schema)[T]["$inferSelect"];
export type NewRow<T extends Table> = (typeof schema)[T]["$inferInsert"];
export type Condition =
  | {
      field: string;
      op: "==" | "!=" | "<" | ">" | "in" | "not-in";
      value: unknown;
    }
  | { op: "and" | "or"; conditions: Condition[] };
const compare =
  (op: Extract<Condition, { field: string }>["op"]) =>
  (field: string, value: unknown): Condition => ({ field, op, value });
export const eq = compare("=="),
  ne = compare("!="),
  lt = compare("<"),
  gt = compare(">"),
  inArray = compare("in"),
  notInArray = compare("not-in");
export const and = (...conditions: (Condition | undefined)[]): Condition => ({
  op: "and",
  conditions: conditions.filter((v): v is Condition => !!v),
});
export const or = (...conditions: (Condition | undefined)[]): Condition => ({
  op: "or",
  conditions: conditions.filter((v): v is Condition => !!v),
});
export const asc = (field: string) => ({ field, direction: "asc" as const });
export interface Query {
  where?: Condition;
  columns?: string[];
  orderBy?: { field: string; direction: "asc" | "desc" }[];
  limit?: number;
  lock?: boolean;
  skipLocked?: boolean;
}
export interface WriteOptions {
  conflict?: "ignore" | Record<string, unknown>;
  returning?: boolean;
}
export interface Store {
  select<T extends Table>(table: T, query?: Query): Promise<Row<T>[]>;
  insert<T extends Table>(
    table: T,
    values: NewRow<T>,
    options?: WriteOptions,
  ): Promise<Row<T>[]>;
  update<T extends Table>(
    table: T,
    values: Partial<Row<T>>,
    where: Condition,
    returning?: boolean | string[],
  ): Promise<Row<T>[]>;
  delete<T extends Table>(
    table: T,
    where: Condition,
    returning?: boolean,
  ): Promise<Row<T>[]>;
  count<T extends Table>(table: T, where?: Condition): Promise<number>;
  transaction<T>(fn: (store: Store) => Promise<T>): Promise<T>;
  workspaceRevision(id: string): Promise<string | null>;
  latestResumeId(id: string): Promise<string>;
  portalMetadata(userId: string, portal: CandidatePortal): Promise<unknown>;
  routines(): Promise<{ id: string; routine: Workspace["routine"] }[]>;
  sendingWorkspaceIds(): Promise<{ id: string }[]>;
  historicalAttempts(userId: string, day: string): Promise<number>;
  catalogMetadata(): Promise<Record<string, any>[]>;
  health(): Promise<void>;
  close(): Promise<void>;
}
export const keys: Record<Table, string[]> = {
  users: ["id"],
  sessions: ["token"],
  googleOAuthStates: ["stateHash"],
  workspaces: ["id"],
  resumeFiles: ["workspaceId", "resumeId"],
  aiSettings: ["userId"],
  subscriptions: ["userId"],
  billingEvents: ["id"],
  applicationUsage: ["applicationId"],
  sourceCatalog: ["key"],
  discoveryTasks: ["id"],
};
export const collectionNames: Record<Table, string> = {
  users: "users",
  sessions: "sessions",
  googleOAuthStates: "google_oauth_states",
  workspaces: "workspaces",
  resumeFiles: "resume_files",
  aiSettings: "ai_settings",
  subscriptions: "subscriptions",
  billingEvents: "billing_events",
  applicationUsage: "application_usage",
  sourceCatalog: "source_catalog",
  discoveryTasks: "discovery_tasks",
};
