import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createWorkspace } from "../server/workspace";
import { applyMigrations } from "../server/database-migrations";
import { resumeFiles, sessions, users, workspaces } from "../server/schema";

let database: typeof import("../server/db"),
  app: FastifyInstance,
  directory = "";
const workspaceId = "egress-user:live",
  resumeId = "private-resume";
const cookie = "orbita_session=egress-session";

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-egress-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  database = await import("../server/db");
  app = await (await import("../server/app")).buildApp({ serveStatic: false });
  await database.db
    .insert(users)
    .values({
      id: "egress-user",
      name: "Egress fixture",
      email: "egress@example.test",
    });
  await database.db
    .insert(sessions)
    .values({
      token: createHash("sha256").update("egress-session").digest("hex"),
      userId: "egress-user",
      expiresAt: new Date(Date.now() + 86400000),
    });
  await database.db
    .insert(workspaces)
    .values({
      id: workspaceId,
      userId: "egress-user",
      data: createWorkspace("Egress fixture", "egress@example.test"),
    });
  const { archiveResumeFile } = await import("../server/resume-storage");
  await database.mutateWorkspace(workspaceId, (w) => {
    w.resumes = [
      {
        id: resumeId,
        name: "fixture.pdf",
        uploadedAt: new Date().toISOString(),
        approved: false,
        skills: [],
        text: "Currículo de teste",
        analysis: "x".repeat(2 * 1024 * 1024),
        storedFile: archiveResumeFile(
          Buffer.alloc(2 * 1024 * 1024, 65),
          ".pdf",
        ),
      },
    ];
    w.infrastructure.portalConnections = {
      gupy: {
        connectedAt: "2026-10-16T12:00:00Z",
        verifiedAt: "2026-10-16T12:00:00Z",
        profileResumeId: resumeId,
        expiresAt: null,
      },
    };
  });
}, 30000);

afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-egress-")))
    await rm(directory, { recursive: true, force: true });
});

it("keeps originals out of workspace reads and mutations, and isolates file ownership", async () => {
  const workspace = (await database.readWorkspace(workspaceId))!;
  expect(workspace.resumes[0].storedFile).toBeUndefined();
  expect(workspace.resumes[0].originalFileAvailable).toBe(true);
  const archive = await database.readResumeArchive(workspaceId, resumeId);
  expect(archive!.ciphertext.length).toBeGreaterThan(2 * 1024 * 1024);
  expect(
    await database.readResumeArchive("different-account:live", resumeId),
  ).toBeNull();
  const revision = workspace.revision;
  await database.mutateWorkspace(workspaceId, (w) => {
    w.profile.name = "Changed fixture";
  });
  expect(await database.readResumeArchive(workspaceId, resumeId)).toEqual(
    archive,
  );
  expect(await database.workspaceRevision(workspaceId)).not.toBe(revision);
});

it("status, billing and portal metadata transfer less than 10 KB from SQL despite multi-MB resume data", async () => {
  const client = (database.db as unknown as { $client: PGlite }).$client;
  const original = client.query.bind(client);
  let transferred = 0;
  const spy = vi
    .spyOn(client as any, "query")
    .mockImplementation(async (...args: any[]) => {
      const result = await original(args[0], args[1], args[2]);
      transferred += Buffer.byteLength(JSON.stringify(result.rows));
      return result;
    });
  try {
    const version = await app.inject({
      url: "/api/workspace/version",
      headers: { cookie },
    });
    expect(version.statusCode).toBe(200);
    expect(version.json().revision).toBeTruthy();
    expect(version.body.length).toBeLessThan(100);
    const statusBytes = transferred;
    const billing = await app.inject({
      url: "/api/billing",
      headers: { cookie },
    });
    expect(billing.statusCode).toBe(200);
    expect(billing.json().remainingToday).toBe(5);
    const billingBytes = transferred - statusBytes;
    const { cloudConnectionMetadata } = await import("../server/portal-cloud");
    expect(
      (await cloudConnectionMetadata("egress-user", "gupy"))?.profileResumeId,
    ).toBe(resumeId);
    expect(await cloudConnectionMetadata("egress-user", "infojobs")).toBeNull();
    expect(transferred).toBeLessThan(10000);
    console.info(
      JSON.stringify({
        statusDatabaseBytes: statusBytes,
        billingDatabaseBytes: billingBytes,
        totalDatabaseBytes: transferred,
        fixtureResumeBytes: 2097152,
      }),
    );
  } finally {
    spy.mockRestore();
  }
});

it("removes separated originals when their resume is removed", async () => {
  await database.mutateWorkspace(workspaceId, (w) => {
    w.resumes = [];
  });
  expect(await database.readResumeArchive(workspaceId, resumeId)).toBeNull();
  expect(
    await database.db
      .select()
      .from(resumeFiles)
      .where(eq(resumeFiles.workspaceId, workspaceId)),
  ).toEqual([]);
});

it("migrates legacy encrypted files inside Postgres and does not replay migrations on restart", async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec(await readFile("migrations/0001_initial.sql", "utf8"));
    await legacy.query(
      "INSERT INTO users (id, email, name, password) VALUES ('legacy', 'legacy@example.test', 'Legacy', 'unused')",
    );
    const workspace = createWorkspace("Legacy", "legacy@example.test");
    workspace.resumes = [
      {
        id: "legacy-resume",
        name: "legacy.pdf",
        uploadedAt: new Date().toISOString(),
        approved: true,
        text: "Legacy resume",
        analysis: "",
        skills: [],
        storedFile: {
          extension: ".pdf",
          ciphertext: "opaque-encrypted-content",
        },
      },
    ];
    await legacy.query(
      "INSERT INTO workspaces (id, user_id, data) VALUES ($1, $2, $3)",
      ["legacy:live", "legacy", JSON.stringify(workspace)],
    );
    const run = async (query: string, parameters?: string[]) =>
      parameters || query.startsWith("SELECT")
        ? legacy.query(query, parameters)
        : legacy.exec(query);
    await legacy.transaction(async (tx) => {
      await applyMigrations(async (query, parameters) =>
        parameters || query.startsWith("SELECT")
          ? tx.query(query, parameters)
          : tx.exec(query),
      );
    });
    const stored = await legacy.query<{ data: typeof workspace }>(
      "SELECT data FROM workspaces WHERE id = 'legacy:live'",
    );
    expect(stored.rows[0].data.resumes[0].storedFile).toBeUndefined();
    expect(stored.rows[0].data.resumes[0].originalFileAvailable).toBe(true);
    expect(
      (
        await legacy.query<{ ciphertext: string }>(
          "SELECT ciphertext FROM resume_files",
        )
      ).rows[0].ciphertext,
    ).toBe("opaque-encrypted-content");
    const executed: string[] = [];
    await applyMigrations(async (query, parameters) => {
      executed.push(query);
      return run(query, parameters);
    });
    expect(executed).toHaveLength(2); // ledger creation and names/checksums only
    await legacy.query("DELETE FROM users WHERE id = 'legacy'");
    expect((await legacy.query("SELECT * FROM resume_files")).rows).toEqual([]);
  } finally {
    await legacy.close();
  }
}, 30000);
