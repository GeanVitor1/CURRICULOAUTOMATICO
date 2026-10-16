import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { Firestore, Transaction } from "@google-cloud/firestore";
import { payloadCache, encodePayload } from "../server/firestore-payload";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import { eq, and, or, lt, asc } from "../server/storage-types";
import { resumePdf } from "./pdf-fixture";

// Explicit opt-in: only disposable, named QA accounts in the selected test project.
describe.skipIf(!process.env.FIRESTORE_TEST_ACCESS_TOKEN)(
  "Firestore Standard — API and atomic persistence",
  () => {
    let database: typeof import("../server/db"),
      app: FastifyInstance,
      raw: Firestore,
      dir = "",
      userId = "",
      cookie = "",
      resumeId = "";
    const email = `firestore-qa-${randomUUID()}@example.invalid`,
      password = "FirestoreQA-2026-strong";
    const auth = new GoogleAuth({
      authClient: new OAuth2Client({
        credentials: { access_token: process.env.FIRESTORE_TEST_ACCESS_TOKEN },
      }),
    });
    const headers = () => ({
      "x-orbita-request": "1",
      origin: "http://127.0.0.1:5173",
      cookie,
    });
    const request = (method: string, url: string, payload?: any) =>
      app.inject({ method: method as any, url, headers: headers(), payload });
    beforeAll(async () => {
      expect(process.env.FIRESTORE_TEST_PROJECT_ID).toBe(
        "curriculoautomatico-a15fa",
      );
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("DATABASE_PROVIDER", "firestore");
      vi.stubEnv("FIREBASE_PROJECT_ID", process.env.FIRESTORE_TEST_PROJECT_ID!);
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("REDIS_URL", "");
      vi.stubEnv("GEMINI_API_KEY", "");
      vi.stubEnv("ANTIGRAVITY_ENABLED", "false");
      dir = await mkdtemp(join(tmpdir(), "empregatos-firestore-"));
      vi.stubEnv("DATA_DIR", dir);
      vi.doMock("../server/firestore-auth", () => ({
        firestoreAuth: () => auth,
      }));
      database = await import("../server/db");
      raw = new Firestore({
        projectId: process.env.FIRESTORE_TEST_PROJECT_ID,
        auth,
      });
      app = await (
        await import("../server/app")
      ).buildApp({ serveStatic: false });
      app.addHook("onError", async (_request, _reply, error) => {
        if ((error as any).code !== undefined)
          console.error(
            JSON.stringify({
              qaError: (error as any).code,
              message: error.message,
            }),
          );
      });
    }, 30000);
    afterAll(async () => {
      if (userId) await database.store.delete("users", eq("id", userId));
      await app?.close();
      await database?.closeDb();
      await raw?.terminate();
      if (dir.startsWith(join(tmpdir(), "empregatos-firestore-")))
        await rm(dir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }, 30000);
    it("starts without PostgreSQL and registers a private session", async () => {
      expect(database.databaseKind).toBe("Cloud Firestore");
      expect(database.db).toBeNull();
      expect((await app.inject("/api/health")).statusCode).toBe(200);
      const result = await request("POST", "/api/auth/register", {
        name: "Firestore QA",
        email,
        password,
      });
      expect(result.statusCode, result.body).toBe(200);
      userId = result.json().id;
      cookie = String(result.headers["set-cookie"]).split(";")[0];
      expect((await request("GET", "/api/auth/me")).json().id).toBe(userId);
      expect(
        (await request("GET", "/api/workspace")).json().profile.email,
      ).toBe(email);
    }, 30000);
    it("enforces unique email atomically and rolls back a conflicting registration", async () => {
      const values = { email, name: "Duplicate QA", password: null };
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          database.store.insert("users", { id: randomUUID(), ...values }),
        ),
      );
      expect(
        results.every(
          (r) => r.status === "rejected" && r.reason.code === "23505",
        ),
      ).toBe(true);
      expect(await database.store.count("users", eq("email", email))).toBe(1);
    });
    it("uploads, analyzes and downloads the exact original after removing the local file", async () => {
      const boundary = "FirestoreUploadBoundary",
        pdf = resumePdf();
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="curriculo.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
        ),
        pdf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const upload = await app.inject({
        method: "POST",
        url: "/api/resumes",
        headers: {
          ...headers(),
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(upload.statusCode, upload.body).toBe(200);
      resumeId = upload.json().id;
      await rm(join(dir, "resumes", userId, resumeId + ".pdf"));
      const response = await request(
        "GET",
        `/api/resumes/${resumeId}/download`,
      );
      expect(response.statusCode, response.body).toBe(200);
      expect(response.rawPayload).toEqual(pdf);
      const workspace = (await request("GET", "/api/workspace")).json();
      expect(workspace.resumes[0].storedFile).toBeUndefined();
      expect(workspace.resumes[0].originalFileAvailable).toBe(true);
    }, 30000);
    it("keeps status, billing, portal and scheduler reads small and fresh", async () => {
      const id = `${userId}:live`,
        before = await database.workspaceRevision(id);
      await database.mutateWorkspace(id, (w) => {
        w.routine.dailyLimit = 3;
        w.resumes[0].analysis = randomBytes(1100 * 1024).toString("base64");
      });
      expect(
        (await database.readWorkspace(id))!.resumes[0].analysis.length,
      ).toBeGreaterThan(1024 * 1024);
      const reads = vi.spyOn(Firestore.prototype, "getAll");
      expect(await database.workspaceRevision(id)).not.toBe(before);
      expect(await database.store.latestResumeId(id)).toBe(resumeId);
      const rev = (await request("GET", "/api/workspace/version")).json();
      expect(rev.revision).not.toBe(before);
      expect((await request("GET", "/api/billing")).statusCode).toBe(200);
      expect((await request("GET", "/api/automation/sites")).statusCode).toBe(
        200,
      );
      expect(
        (await database.store.routines()).find((r) => r.id === id)?.routine
          .dailyLimit,
      ).toBe(3);
      expect(
        await database.readResumeArchive("another-workspace", resumeId),
      ).toBeNull();
      const workspaceReads = reads.mock.calls
        .map((args, index) => ({ args, index }))
        .filter(({ args }) => (args[0] as any)?.parent?.id === "workspaces");
      expect(workspaceReads.length).toBeGreaterThan(0);
      let bytes = 0;
      for (const { args, index } of workspaceReads) {
        expect((args.at(-1) as any).fieldMask).toBeDefined();
        expect((args.at(-1) as any).fieldMask).not.toContain("_payload");
        const snapshots = await reads.mock.results[index].value;
        bytes += Buffer.byteLength(
          JSON.stringify(snapshots.map((s: any) => s.data())),
        );
      }
      expect(bytes).toBeLessThan(20000);
      console.log(
        JSON.stringify({
          firestoreStatusMetadataBytes: bytes,
          workspaceAnalysisBytes: Math.ceil((1100 * 1024 * 4) / 3),
        }),
      );
      reads.mockRestore();
    });
    it("reserves the daily quota once across concurrent workers", async () => {
      const { reserveApplication, billingSummary } =
        await import("../server/billing");
      const results = await Promise.allSettled(
        Array.from({ length: 7 }, () =>
          database.mutateWorkspace(`${userId}:live`, async (_w, tx) =>
            reserveApplication(tx, userId, randomUUID(), 100, 0),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      expect((await billingSummary(userId)).remainingToday).toBe(0);
    }, 60000);
    it("changes application status without rewriting the resume, skips no-op writes and keeps the queue projection small", async () => {
      const id = `${userId}:live`,
        appId = randomUUID();
      await database.mutateWorkspace(id, (w) => {
        w.applications.push({
          id: appId,
          jobId: "qa-only-job",
          resumeId,
          status: "Aguardando aprovação",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          receipt: null,
          note: "",
          history: [],
          mode: "automatic",
        });
      });
      const root = (
          await raw.collection("workspaces").where("id", "==", id).get()
        ).docs[0],
        before = root.data();
      expect(before._sections.resumes.count).toBeGreaterThan(1);
      const writes = vi.spyOn(Transaction.prototype, "set");
      await database.mutateWorkspace(id, (w) => {
        w.applications.find((a) => a.id === appId)!.status = "Enviando";
      });
      expect(writes.mock.calls).toHaveLength(1);
      expect(
        writes.mock.calls.every(([ref]) => ref.path === root.ref.path),
      ).toBe(true);
      const after = (await root.ref.get()).data()!;
      expect(after._sections.resumes).toEqual(before._sections.resumes);
      expect((await database.store.submissionState(id))?.sending).toBe(true);
      writes.mockClear();
      const revision = await database.workspaceRevision(id);
      await database.mutateWorkspace(id, () => {});
      expect(writes.mock.calls).toHaveLength(0);
      expect(await database.workspaceRevision(id)).toBe(revision);
      writes.mockRestore();
      await database.mutateWorkspace(id, (w) => {
        w.applications = w.applications.filter((a) => a.id !== appId);
      });
    }, 30000);
    it("upgrades the old payload format atomically and keeps its data readable", async () => {
      const id = `${userId}:live`,
        root = (await raw.collection("workspaces").where("id", "==", id).get())
          .docs[0];
      const current = (await database.readWorkspace(id))!;
      delete current.revision;
      const old = encodePayload(current);
      const { FieldValue } = await import("@google-cloud/firestore");
      const previous = root.data();
      const legacy = raw.batch();
      old.chunks.forEach((bytes, i) =>
        legacy.set(
          root.ref.collection("chunks").doc(`${old.manifest.version}-${i}`),
          { bytes },
        ),
      );
      legacy.update(root.ref, {
        _payload: old.manifest,
        _sections: FieldValue.delete(),
        _submission: FieldValue.delete(),
      });
      await legacy.commit();
      for (const manifest of Object.values(previous._sections) as any[])
        if (manifest.count) {
          const batch = raw.batch();
          for (let i = 0; i < manifest.count; i++)
            batch.delete(
              root.ref.collection("chunks").doc(`${manifest.version}-${i}`),
            );
          await batch.commit();
        }
      payloadCache.clear();
      expect((await database.readWorkspace(id))!.resumes[0].analysis).toBe(
        current.resumes[0].analysis,
      );
      expect((await database.store.submissionState(id))?.next).toBeNull();
      await database.mutateWorkspace(id, (w) => {
        w.routine.dailyLimit = 4;
      });
      expect(
        (await root.ref.get()).data()!._sections.resumes.count,
      ).toBeGreaterThan(1);
      expect((await database.readWorkspace(id))!.resumes[0].analysis).toBe(
        current.resumes[0].analysis,
      );
    }, 30000);
    it("stores a full 5 MiB encrypted original in bounded chunks, then deletes the chunks", async () => {
      const { archiveResumeFile, restoreResumeFile } =
        await import("../server/resume-storage");
      const bytes = randomBytes(5 * 1024 * 1024),
        archive = archiveResumeFile(bytes, ".pdf"),
        id = randomUUID();
      await database.store.insert("resumeFiles", {
        workspaceId: `${userId}:live`,
        resumeId: id,
        ...archive,
      });
      payloadCache.clear();
      const restored = await database.readResumeArchive(`${userId}:live`, id);
      expect(restoreResumeFile(restored!)).toEqual(bytes);
      const reads = vi.spyOn(Firestore.prototype, "getAll");
      expect(
        restoreResumeFile(
          (await database.readResumeArchive(`${userId}:live`, id))!,
        ),
      ).toEqual(bytes);
      expect(
        reads.mock.calls.some(([ref]) => (ref as any)?.parent?.id === "chunks"),
      ).toBe(false);
      reads.mockRestore();
      const snap = await raw
          .collection("resume_files")
          .where("resumeId", "==", id)
          .get(),
        file = snap.docs[0];
      expect(file.data().ciphertext).toBeUndefined();
      expect(file.data()._payload.count).toBeGreaterThan(1);
      expect((await file.ref.collection("chunks").get()).size).toBe(
        file.data()._payload.count,
      );
      await database.store.delete(
        "resumeFiles",
        and(eq("workspaceId", `${userId}:live`), eq("resumeId", id)),
      );
      expect((await file.ref.collection("chunks").get()).empty).toBe(true);
    }, 60000);
    it("runs the real indexed discovery lease query without contacting job portals", async () => {
      const id = randomUUID(),
        workspaceId = `${userId}:live`;
      await database.store.insert("discoveryTasks", {
        id,
        workspaceId,
        status: "queued",
      });
      const task = await database.store.transaction(async (tx) => {
        const global = await tx.select("discoveryTasks", {
          where: or(
            eq("status", "queued"),
            and(eq("status", "running"), lt("leaseUntil", new Date())),
          ),
          orderBy: [asc("createdAt")],
          limit: 1,
          lock: true,
        });
        expect(global.some((row) => row.id === id)).toBe(true);
        const [row] = await tx.select("discoveryTasks", {
          where: and(
            eq("workspaceId", workspaceId),
            or(
              eq("status", "queued"),
              and(eq("status", "running"), lt("leaseUntil", new Date())),
            ),
          ),
          orderBy: [asc("createdAt")],
          limit: 1,
          lock: true,
        });
        await tx.update(
          "discoveryTasks",
          {
            status: "running",
            leaseToken: "qa-token",
            leaseUntil: new Date(Date.now() + 60000),
          },
          eq("id", row.id),
        );
        return row;
      });
      expect(task.id).toBe(id);
      const claimed = await database.store.select("discoveryTasks", {
        where: and(eq("id", id), eq("leaseToken", "qa-token")),
      });
      expect(claimed).toHaveLength(1);
      await database.store.delete("discoveryTasks", eq("id", id));
    }, 30000);
    it("deletes dependent sessions, workspaces, files and unique email markers with the account", async () => {
      const id = userId;
      expect(
        (await request("DELETE", "/api/account", { password })).statusCode,
      ).toBe(200);
      expect(await database.store.count("sessions", eq("userId", id))).toBe(0);
      expect(await database.store.count("workspaces", eq("userId", id))).toBe(
        0,
      );
      expect(
        await database.store.count(
          "resumeFiles",
          eq("workspaceId", `${id}:live`),
        ),
      ).toBe(0);
      expect((await request("GET", "/api/auth/me")).statusCode).toBe(401);
      userId = "";
    }, 30000);
  },
);
