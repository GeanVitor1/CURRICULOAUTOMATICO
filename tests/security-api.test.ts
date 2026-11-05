import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Application } from "../shared/types";

let app: FastifyInstance,
  database: typeof import("../server/db"),
  directory = "";
let alice = "",
  bob = "",
  aliceId = "";
const resumeId = randomUUID(),
  jobId = randomUUID(),
  applicationId = randomUUID();
const headers = (cookie: string) => ({
  cookie,
  origin: "http://127.0.0.1:5173",
  "x-orbita-request": "1",
});
const request = (
  cookie: string,
  method: string,
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method: method as any,
    url,
    headers: headers(cookie),
    payload: payload as any,
  });
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-security-"));
  for (const [key, value] of Object.entries({
    DATA_DIR: directory,
    NODE_ENV: "test",
    DATABASE_PROVIDER: "",
    DATABASE_URL: "",
    REDIS_URL: "",
    VERCEL: "",
    APP_ORIGIN: "http://127.0.0.1:5173",
    API_PROXY_SECRET: "",
    PORTAL_CONNECTIONS_ENABLED: "false",
    PORTAL_CLOUD_ENABLED: "false",
    ANTIGRAVITY_ENABLED: "false",
    GEMINI_API_KEY: "",
  }))
    vi.stubEnv(key, value);
  app = await (await import("../server/app")).buildApp({ serveStatic: false });
  database = await import("../server/db");
  for (const person of ["alice", "bob"]) {
    const account = await request("", "POST", "/api/auth/register", {
      name: `Synthetic ${person}`,
      email: `${person}@example.test`,
      password: "Synthetic-password-123",
    });
    expect(account.statusCode).toBe(200);
    const cookie = String(account.headers["set-cookie"]).split(";")[0];
    if (person === "alice") {
      alice = cookie;
      aliceId = account.json().id;
    } else bob = cookie;
  }
  const { TARGETS_VERSION } = await import("../server/resume-targets");
  const { archiveResumeFile } = await import("../server/resume-storage");
  await database.mutateWorkspace(`${aliceId}:live`, (w) => {
    w.resumes.push({
      id: resumeId,
      name: "private.pdf",
      text: "Private synthetic resume",
      uploadedAt: new Date().toISOString(),
      skills: [],
      approved: true,
      analysis: "",
      targetsVersion: TARGETS_VERSION,
      storedFile: archiveResumeFile(
        Buffer.from("%PDF-private-synthetic"),
        ".pdf",
      ),
    });
    w.applications.push({
      id: applicationId,
      jobId,
      resumeId,
      status: "Requer ação manual",
      history: [],
      note: "Private synthetic application",
    } as unknown as Application);
  });
  expect(
    (
      await request(alice, "POST", "/api/jobs", {
        title: "Synthetic role",
        company: "Synthetic employer",
        url: "https://employer.gupy.io/jobs/123",
        description: "Synthetic job description with no external requests.",
        location: "Brasil",
        modality: "Remoto",
        level: "Júnior",
        contract: "CLT",
        salaryMin: null,
        salaryMax: null,
        currency: "BRL",
        skills: [],
        requiredSkills: [],
        requiredYears: null,
      })
    ).statusCode,
  ).toBe(200);
  await database.mutateWorkspace(`${aliceId}:live`, (w) => {
    w.jobs[0].id = jobId;
  });
}, 60000);
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-security-")))
    await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("isolates files, jobs, applications, mutations and exports across two authenticated accounts", async () => {
  const before = await database.readWorkspace(`${aliceId}:live`);
  const own = await request(alice, "GET", `/api/resumes/${resumeId}/download`);
  expect(own.statusCode).toBe(200);
  expect(own.body).toBe("%PDF-private-synthetic");
  for (const [method, path, payload] of [
    ["GET", `/api/resumes/${resumeId}/download`, undefined],
    ["PATCH", `/api/resumes/${resumeId}`, { approved: false }],
    ["GET", `/api/jobs/${jobId}`, undefined],
    ["PATCH", `/api/jobs/${jobId}`, { saved: true }],
    ["GET", `/api/applications/${applicationId}/readiness`, undefined],
    [
      "PATCH",
      `/api/applications/${applicationId}`,
      { status: "Enviada", confirmation: true },
    ],
    ["DELETE", `/api/applications/${applicationId}/send`, undefined],
  ] as const)
    expect([400, 404]).toContain(
      (await request(bob, method, path, payload)).statusCode,
    );
  const exported = await request(bob, "GET", "/api/export");
  expect(exported.statusCode).toBe(200);
  for (const privateValue of [
    resumeId,
    jobId,
    applicationId,
    "Private synthetic",
  ])
    expect(exported.body).not.toContain(privateValue);
  expect(await database.readWorkspace(`${aliceId}:live`)).toEqual(before);
});
it("rejects unauthenticated access and cross-origin writes", async () => {
  expect(
    (await request("", "GET", `/api/resumes/${resumeId}/download`)).statusCode,
  ).toBe(401);
  const response = await app.inject({
    method: "PATCH",
    url: `/api/resumes/${resumeId}`,
    headers: { ...headers(alice), origin: "https://attacker.example" },
    payload: { approved: false },
  });
  expect(response.statusCode).toBe(403);
});
it("limits costly resume routes before processing more files or AI requests", async () => {
  for (const url of [
    "/api/resumes",
    "/api/resumes/build",
    `/api/resumes/${resumeId}/analyze`,
  ]) {
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(
        await app.inject({
          method: "POST",
          url,
          headers: headers(bob),
          remoteAddress: "127.0.0.49",
          payload: {},
        }),
      );
    expect([400, 406]).toContain(results[0].statusCode);
    expect(results[5].statusCode).toBe(429);
  }
});
