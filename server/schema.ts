import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  integer,
} from "drizzle-orm/pg-core";
import type { Job, Workspace } from "../shared/types";
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password"),
  googleSub: text("google_sub").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const aiSettings = pgTable("ai_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("local"),
  model: text("model").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  consent: boolean("consent").notNull().default(false),
  encryptedKey: text("encrypted_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    googleAuthenticatedAt: timestamp("google_authenticated_at", {
      withTimezone: true,
    }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const googleOAuthStates = pgTable("google_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  nonce: text("nonce").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  intent: text("intent").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionHash: text("session_hash").references(() => sessions.token, {
    onDelete: "cascade",
  }),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    demo: boolean("demo").notNull().default(false),
    data: jsonb("data").$type<Workspace>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("workspaces_user_idx").on(t.userId)],
);
// Only public provider data is shared. Profiles, resumes and recommendations stay in workspaces.
export const sourceCatalog = pgTable("source_catalog", {
  key: text("key").primaryKey(),
  type: text("type").notNull(),
  board: text("board").notNull(),
  company: text("company").notNull(),
  sector: text("sector").notNull().default("Não informado"),
  country: text("country").notNull().default(""),
  jobs: jsonb("jobs").$type<Job[]>().notNull().default([]),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  retryAt: timestamp("retry_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseToken: text("lease_token"),
  lastError: text("last_error"),
});
export const discoveryTasks = pgTable(
  "discovery_tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: text("lease_token"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("discovery_tasks_due_idx").on(t.status, t.createdAt)],
);
