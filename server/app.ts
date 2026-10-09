import "dotenv/config";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { resolve, extname, relative } from "node:path";
import { eq, and, lt } from "drizzle-orm";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { extractDocx } from "./documents";
import { createResumePdf, resumeText } from "./resume-pdf";
import {
  db,
  dataDir,
  databaseKind,
  healthDb,
  mutateWorkspace,
  readWorkspace,
} from "./db";
import { users, sessions, workspaces } from "./schema";
import { createWorkspace } from "./workspace";
import {
  classify,
  extractSkills,
  nextExecution,
  parseResume,
  analyze,
  normalize,
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "./engine";
import { supportsAutomatic, automaticPortals } from "./connectors";
import {
  providerLimits,
  publicDiscoveryAvailable,
} from "./provider-capabilities";
import {
  linkedinOAuthConfigured,
  linkedinIdentity,
  beginLinkedinOAuth,
  completeLinkedinOAuth,
  disconnectLinkedinIdentity,
} from "./linkedin-oauth";
import { interviewSchema, applyInterview } from "./career-interview";
import {
  connectionStatuses,
  readyPortals,
  startPortalLogin,
  portalLoginAction,
  finishPortalLogin,
  cancelPortalLogin,
  disconnectPortal,
  deletePortalConnections,
  closePortalBrowsers,
  closeUserPortalLogins,
} from "./portal-sessions";
import { candidatePortals, portals } from "../shared/portals";
import { geminiConfigured } from "./gemini";
import { inspectSourceCatalog } from "./source-catalog";
import { VERIFIED_SOURCES } from "./source-registry";
import { isPortalId } from "../shared/portals";
import { resumeTargets, TARGETS_VERSION } from "./resume-targets";
import { applicationDraft } from "./application-draft";
import {
  analyzeResume,
  getIntelligence,
  saveIntelligence,
  listZenModels,
  analyzeJobMatch,
  clearAnalysisCache,
  testZenConnection,
  testGeminiConnection,
} from "./intelligence";
import {
  discover,
  mergeJobs,
  findExistingJob,
  prepare,
  refreshMatches,
  transition,
  notify,
} from "./operations";
import { requireResumeReview } from "./resume-state";
import { RequestError } from "./errors";
import { queue, configureSchedule } from "./queue";
import { enqueueDiscovery } from "./discovery-queue";
import {
  filtersSchema,
  jobSchema,
  profileSchema,
  routineSchema,
  sourceSchema,
  statusSchema,
} from "./validation";
import type { Job, Workspace } from "../shared/types";
import { passwordHash, verifyPassword } from "./auth-password";
const tokenHash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function buildApp() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV !== "test"
        ? {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "password",
              "token",
              "req.url",
            ],
          }
        : false,
    bodyLimit: 1024 * 1024,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    // A page loads many fonts, images and chunks. Only API requests consume
    // this quota; auth routes retain their separate 10/minute limit.
    allowList: (request) => {
      const path = request.url.split("?", 1)[0];
      return path !== "/api" && !path.startsWith("/api/");
    },
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "strict-origin-when-cross-origin")
      .header("X-Frame-Options", "DENY");
    if (request.url.startsWith("/api"))
      reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const allowed = new Set(
        (
          process.env.APP_ORIGIN ||
          "http://127.0.0.1:5173,http://localhost:5173"
        ).split(","),
      );
      if (process.env.NODE_ENV !== "production") {
        allowed.add("http://127.0.0.1:5173");
        allowed.add("http://localhost:5173");
      }
      const origin = request.headers.origin;
      if (
        (origin && !allowed.has(origin)) ||
        request.headers["x-orbita-request"] !== "1"
      )
        return reply
          .code(403)
          .send({ error: "Origem da solicitação não autorizada." });
    }
  });
  app.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (error.code === "23505" || error.cause?.code === "23505")
      return reply
        .code(409)
        .send({ error: "Este e-mail já possui uma conta." });
    if (error.statusCode === 413 || error.code === "FST_REQ_FILE_TOO_LARGE")
      return reply.code(413).send({ error: "Arquivo maior que 5 MB." });
    const status = error.statusCode || 500;
    if (status >= 500) app.log.error({ code: error.code }, "Falha interna");
    return reply.code(status).send({
      error:
        status >= 500
          ? "Não foi possível concluir a solicitação."
          : error.message || "Solicitação inválida.",
    });
  });
  async function identity(request: FastifyRequest) {
    const session = request.cookies.orbita_session;
    if (!session)
      throw Object.assign(new Error("Entre na sua conta para continuar."), {
        statusCode: 401,
      });
    const [result] = await db
      .select({ user: users, session: sessions })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.token, tokenHash(session)));
    if (!result || result.session.expiresAt < new Date())
      throw Object.assign(new Error("Sua sessão expirou."), {
        statusCode: 401,
      });
    return result.user;
  }
  async function scope(request: FastifyRequest) {
    const u = await identity(request);
    const demo = (request.query as any)?.demo === "true";
    if (demo)
      throw new RequestError(
        "O modo de dados demonstrativos foi removido. Use seu espaço real.",
      );
    const id = `${u.id}:${demo ? "demo" : "live"}`;
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, id));
    // Most routes read or mutate the workspace themselves. An existence check
    // must not deserialize its full resume/job history a second time.
    if (!workspace)
      await db
        .insert(workspaces)
        .values({
          id,
          userId: u.id,
          demo,
          data: createWorkspace(u.name, u.email, demo),
        })
        .onConflictDoNothing();
    return { u, id, demo };
  }
  app.get("/api/health", async () => {
    await healthDb();
    return { status: "ok", database: databaseKind };
  });
  app.get("/api/auth/me", async (req) => {
    const u = await identity(req);
    return { id: u.id, name: u.name, email: u.email };
  });
  const authBody = z.object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(10).max(128),
    name: z.string().trim().min(2).max(100).optional(),
  });
  for (const action of ["register", "login"])
    app.post(
      `/api/auth/${action}`,
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const body = authBody.parse(req.body);
        let user;
        if (action === "register") {
          if (!body.name) throw new RequestError("Informe seu nome.");
          const name = body.name;
          const password = await passwordHash(body.password);
          user = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(users)
              .values({
                id: randomUUID(),
                email: body.email,
                name,
                password,
              })
              .returning();
            await tx.insert(workspaces).values({
              id: `${created.id}:live`,
              userId: created.id,
              demo: false,
              data: createWorkspace(created.name, created.email),
            });
            return created;
          });
        } else {
          [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, body.email));
          if (!(await verifyPassword(body.password, user?.password)))
            throw Object.assign(new Error("E-mail ou senha incorretos."), {
              statusCode: 401,
            });
        }
        await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
        const token = randomBytes(32).toString("hex");
        await db.insert(sessions).values({
          token: tokenHash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        });
        reply.setCookie("orbita_session", token, {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 86400,
        });
        return { id: user.id, name: user.name, email: user.email };
      },
    );
  app.post("/api/auth/logout", async (req, reply) => {
    const u = await identity(req).catch(() => null);
    if (u) await closeUserPortalLogins(u.id);
    if (req.cookies.orbita_session)
      await db
        .delete(sessions)
        .where(eq(sessions.token, tokenHash(req.cookies.orbita_session)));
    reply.clearCookie("orbita_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/workspace", async (req) => {
    const { id, u } = await scope(req);
    const w = (await readWorkspace(id))!;
    refreshMatches(w);
    const workers = queue ? await queue.getWorkers().catch(() => []) : [];
    w.infrastructure = {
      database: databaseKind,
      queue: queue ? "BullMQ + Redis" : "Agendador local persistente",
      automatic: supportsAutomatic(),
      worker: queue ? workers.length > 0 : true,
    };
    const applications = new Map(w.applications.map((a) => [a.jobId, a]));
    w.jobs.forEach((j) => {
      j.application = applications.get(j.id);
    });
    w.intelligence = w.demo
      ? { provider: "local", model: "", enabled: false, keyConfigured: false }
      : await getIntelligence(u.id);
    if ((req.query as any).summary === "true") {
      const active = w.jobs.filter(
        (j) => !j.discarded && j.availability !== "closed",
      );
      const visible = active.filter(
        (job) =>
          matchesSelectedSites(job, w) &&
          matchesObjectiveFilters(job, w.profile, w.filters),
      );
      w.jobCounts = {
        total: visible.length,
        saved: visible.filter((j) => j.saved).length,
        recommended: visible.filter(
          (j) =>
            matchesObjectiveFilters(j, w.profile, w.filters) &&
            j.match.score >= w.filters.minScore &&
            !j.match.blockers.length &&
            j.match.confidence !== "insufficient",
        ).length,
      };
      const previewIds = new Set(
        [...visible]
          .sort((a, b) => b.match.score - a.match.score)
          .slice(0, 8)
          .map((j) => j.id),
      );
      w.applications.forEach((a) => previewIds.add(a.jobId));
      w.jobs = w.jobs.filter((j) => previewIds.has(j.id));
    }
    return w;
  });
  app.get("/api/jobs", async (req) => {
    const { id } = await scope(req);
    const w = (await readWorkspace(id))!;
    refreshMatches(w);
    const applications = new Map(w.applications.map((a) => [a.jobId, a]));
    const q = z
      .object({
        search: z.string().max(200).default(""),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        radar: z.enum(["true", "false"]).default("false"),
        purpose: z.enum(["search", "manual"]).default("search"),
        tab: z.enum(["all", "compatible", "saved"]).default("all"),
        sort: z.enum(["score", "recent"]).default("score"),
        demo: z.string().optional(),
      })
      .parse(req.query);
    const jobs = w.jobs
      .filter(
        (j) =>
          (q.purpose === "manual" ||
            (!j.discarded &&
              matchesSelectedSites(j, w) &&
              j.availability !== "closed")) &&
          normalize([j.title, j.company, ...j.skills].join(" ")).includes(
            normalize(q.search),
          ) &&
          (q.purpose === "manual"
            ? !applications.has(j.id)
            : q.radar === "true"
              ? j.match.radar
              : matchesObjectiveFilters(j, w.profile, w.filters)) &&
          (q.tab !== "saved" || j.saved) &&
          (q.tab !== "compatible" ||
            (j.match.confidence !== "insufficient" &&
              !j.match.blockers.length &&
              j.match.score >= w.filters.minScore)),
      )
      .sort((a, b) =>
        q.sort === "score"
          ? b.match.score - a.match.score
          : Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt),
      );
    return {
      items: jobs
        .slice((q.page - 1) * q.pageSize, q.page * q.pageSize)
        .map((job) => ({
          ...job,
          application: applications.get(job.id),
        })),
      total: jobs.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  app.get("/api/jobs/:jobId", async (req) => {
    const { id } = await scope(req);
    const w = (await readWorkspace(id))!;
    const job = w.jobs.find((j) => j.id === (req.params as any).jobId);
    if (!job) throw new RequestError("Vaga não encontrada.");
    job.match = analyze(job, w.profile, w.filters);
    job.application = w.applications.find((a) => a.jobId === job.id);
    return job;
  });
  app.put("/api/profile", async (req) => {
    const { id } = await scope(req);
    const p = profileSchema.parse(req.body);
    await mutateWorkspace(id, (w) => {
      w.profile = p;
      refreshMatches(w);
    });
    return { ok: true };
  });
  app.get("/api/automation/sites", async (req) => {
    const u = await identity(req);
    const connections = await connectionStatuses(u.id);
    const resumeId =
      (await readWorkspace(`${u.id}:live`))?.resumes[0]?.id || "";
    const linkedIdentity = await linkedinIdentity(u.id);
    return candidatePortals.map((site) => ({
      id: site,
      name: portals[site].name,
      discovery: publicDiscoveryAvailable(site, geminiConfigured()),
      ...connections.find((connection) => connection.id === site),
      authMethod:
        site === "linkedin" && linkedinOAuthConfigured()
          ? "oauth"
          : connections.find((c) => c.id === site)?.connectable
            ? "authorized-browser"
            : "external",
      identityConnected:
        site === "linkedin" &&
        !!linkedIdentity &&
        linkedIdentity.expiresAt > Date.now(),
      identityExpired:
        site === "linkedin" &&
        !!linkedIdentity &&
        linkedIdentity.expiresAt <= Date.now(),
      oauthConfigured: site === "linkedin" && linkedinOAuthConfigured(),
      limitation: providerLimits[site],
      applicationMethod: automaticPortals().includes(site)
        ? "authorized-api"
        : connections.find((c) => c.id === site)?.connected
          ? "authorized-browser"
          : "external",
      needsResumeApproval:
        ["gupy", "infojobs"].includes(site) &&
        connections.some(
          (connection) =>
            connection.id === site &&
            connection.connected &&
            connection.profileResumeId !== resumeId,
        ),
      automatic:
        automaticPortals().includes(site) ||
        connections.some(
          (connection) =>
            connection.id === site &&
            connection.connected &&
            (!["gupy", "infojobs"].includes(site) ||
              connection.profileResumeId === resumeId),
        ),
    }));
  });
  app.post("/api/oauth/linkedin/start", async (req) => {
    const { u, demo } = await scope(req);
    if (demo)
      throw new RequestError("A demonstração não conecta contas externas.");
    return { url: await beginLinkedinOAuth(u.id) };
  });
  app.get("/api/oauth/linkedin/callback", async (req, reply) => {
    let success = false;
    try {
      const u = await identity(req);
      const query = z
        .object({
          state: z.string().min(32).max(200),
          code: z.string().max(4000).optional(),
          error: z.string().max(200).optional(),
        })
        .parse(req.query);
      await completeLinkedinOAuth(u.id, query.state, query.code, !!query.error);
      success = true;
    } catch {
      /* No provider response, code, token or personal data is rendered. */
    }
    return reply
      .type("text/html")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      )
      .send(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conexão LinkedIn</title><body style="font:16px system-ui;padding:40px;background:#f7f8f4;color:#17201a"><h1>${success ? "Conta autenticada" : "Não foi possível conectar"}</h1><p>${success ? "Seu LinkedIn foi autenticado. Essa permissão identifica sua conta; busca e candidaturas dependem de integrações próprias." : "A autorização expirou, foi recusada ou não pôde ser verificada. Volte ao Empregatos e tente novamente."}</p><a href="/app#automacao">Voltar ao Empregatos</a><script>if(window.opener){window.opener.postMessage({type:'empregatos:oauth',success:${success}},window.location.origin);window.close();}</script></body></html>`,
      );
  });
  const connectionPortal = z.enum(candidatePortals);
  const connectionScope = async (req: FastifyRequest) => {
    const { u, demo } = await scope(req);
    if (demo) throw new RequestError("Conecte os sites na sua conta real.");
    return { u, portal: connectionPortal.parse((req.params as any).portal) };
  };
  app.post("/api/connections/:portal/open", async (req, reply) => {
    const { u, portal } = await connectionScope(req);
    reply.header("Cache-Control", "no-store");
    return startPortalLogin(u.id, portal);
  });
  app.post("/api/connections/:portal/action", async (req, reply) => {
    const { u, portal } = await connectionScope(req);
    const action = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("submit"),
          fields: z
            .array(
              z.object({
                index: z.number().int().min(0).max(100),
                key: z.string().length(64).optional(),
                value: z.string().max(2000),
              }),
            )
            .min(1)
            .max(30),
        }),
        z.object({
          type: z.literal("click"),
          x: z.number().min(0).max(1024),
          y: z.number().min(0).max(720),
        }),
        z.object({ type: z.literal("text"), value: z.string().max(2000) }),
        z.object({
          type: z.literal("fill"),
          index: z.number().int().min(0).max(100),
          value: z.string().max(2000),
        }),
        z.object({
          type: z.literal("key"),
          value: z.enum([
            "Tab",
            "Shift+Tab",
            "Enter",
            "Backspace",
            "Escape",
            "ControlOrMeta+A",
            "ArrowDown",
            "ArrowUp",
          ]),
        }),
        z.object({
          type: z.literal("scroll"),
          delta: z.number().min(-1200).max(1200),
        }),
        z.object({ type: z.literal("refresh") }),
      ])
      .parse(req.body);
    reply.header("Cache-Control", "no-store");
    return portalLoginAction(u.id, portal, action);
  });
  app.post("/api/connections/:portal/confirm", async (req) => {
    const { u, portal } = await connectionScope(req);
    const { profileResumeId } = z
      .object({ profileResumeId: z.string().max(100).nullable().default(null) })
      .parse(req.body || {});
    if (profileResumeId) {
      const w = await readWorkspace(`${u.id}:live`);
      if (!w?.resumes.some((resume) => resume.id === profileResumeId))
        throw new RequestError("O currículo escolhido não foi encontrado.");
    }
    return finishPortalLogin(u.id, portal, profileResumeId);
  });
  app.post("/api/connections/:portal/close", async (req) => {
    const { u, portal } = await connectionScope(req);
    await cancelPortalLogin(u.id, portal);
    return { ok: true };
  });
  app.delete("/api/connections/:portal", async (req) => {
    const { u, portal } = await connectionScope(req);
    await disconnectPortal(u.id, portal);
    if (portal === "linkedin") await disconnectLinkedinIdentity(u.id);
    return { ok: true };
  });
  app.put("/api/interview", async (req) => {
    const { id, u, demo } = await scope(req);
    const body = interviewSchema.parse(req.body);
    if (demo && body.start !== "save")
      throw new RequestError("A demonstração não inicia buscas ou envios.");
    const availableSites = [
      ...automaticPortals(),
      ...(await readyPortals(u.id, body.answers.resumeId)),
    ];
    await mutateWorkspace(id, (w) => {
      applyInterview(w, body, availableSites);
      refreshMatches(w);
    });
    if (body.complete) {
      const w = (await readWorkspace(id))!;
      await configureSchedule(id, w.routine.enabled, w.routine.time);
      if (w.routine.enabled) await enqueueDiscovery(id);
    }
    return { ok: true };
  });
  const onboardingSchema = z.object({
    step: z.number().int().min(0).max(7),
    completed: z.boolean().default(false),
    complete: z.boolean().optional(),
    answers: z.object({
      goal: z.string().trim().max(300),
      location: z.string().trim().max(200),
      resumeChoice: z.enum(["upload", "build", "later", ""]),
      experience: z.string().max(5000),
      modalities: z.array(z.enum(["Remoto", "Presencial", "Híbrido"])).max(3),
      contracts: z.array(z.string().max(50)).max(10),
      salaryMin: z.number().min(0).max(1000000),
    }),
  });
  app.put("/api/guide", async (req) => {
    const { id } = await scope(req);
    const guide = z
      .object({
        step: z.number().int().min(0).max(5),
        completed: z.boolean(),
        dismissed: z.boolean(),
        active: z.boolean(),
      })
      .parse(req.body);
    await mutateWorkspace(id, (w) => {
      w.guide = guide;
    });
    return { ok: true };
  });
  app.put("/api/onboarding", async (req) => {
    const { id } = await scope(req);
    const body = onboardingSchema.parse(req.body);
    const completed = body.complete === true;
    if (completed && !body.answers.goal)
      throw new RequestError(
        "Conte qual trabalho você procura antes de começar.",
      );
    return mutateWorkspace(id, (w) => {
      w.onboarding = { step: body.step, completed, answers: body.answers };
      if (completed) {
        const a = body.answers;
        w.profile.headline = a.goal;
        w.profile.location = a.location;
        w.profile.experience = a.experience;
        w.profile.salaryMin = a.salaryMin;
        w.filters.titles = a.goal
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        w.filters.locations = a.location ? [a.location] : [];
        w.filters.modalities = a.modalities;
        w.filters.contracts = a.contracts;
        w.filters.salaryMin = a.salaryMin;
        refreshMatches(w);
      }
      return { ok: true };
    });
  });
  app.get("/api/intelligence", async (req) =>
    getIntelligence((await identity(req)).id),
  );
  app.put("/api/intelligence", async (req) => {
    const { u, demo } = await scope(req);
    if (demo)
      throw new RequestError(
        "Configure inteligência no espaço de dados reais.",
      );
    return saveIntelligence(u.id, req.body);
  });
  app.get("/api/intelligence/models", async (req) => {
    await identity(req);
    return listZenModels();
  });
  app.post(
    "/api/intelligence/test",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const u = await identity(req);
      const { model, provider } = z
        .object({
          model: z.string().trim().min(1).max(100),
          provider: z.enum(["zen", "gemini"]).default("gemini"),
        })
        .parse(req.body);
      return provider === "gemini"
        ? testGeminiConnection(u.id, model)
        : testZenConnection(u.id, model);
    },
  );
  app.post("/api/jobs/:jobId/analyze", async (req) => {
    const { id, u } = await scope(req);
    const w = (await readWorkspace(id))!;
    const job = w.jobs.find((j) => j.id === (req.params as any).jobId);
    if (!job) throw new RequestError("Vaga não encontrada.");
    const match = await analyzeJobMatch(u.id, w.profile, job, w.filters);
    await mutateWorkspace(id, (current) => {
      const item = current.jobs.find((j) => j.id === job.id);
      if (item) item.match = match;
    });
    return { match };
  });
  app.put("/api/filters", async (req) => {
    const { id } = await scope(req);
    const f = filtersSchema.parse(req.body);
    await mutateWorkspace(id, (w) => {
      w.filters = f;
      refreshMatches(w);
    });
    return { ok: true };
  });
  app.post("/api/search-profiles", async (req) => {
    const { id } = await scope(req);
    const body = z
      .object({
        name: z.string().min(1).max(100),
        filters: filtersSchema,
        mode: z.enum(["discovery", "approval", "automatic"]),
      })
      .parse(req.body);
    return mutateWorkspace(id, (w) => {
      if (w.searchProfiles.length >= 20)
        throw new RequestError("Limite de 20 perfis de busca.");
      const item = { id: randomUUID(), ...body };
      w.searchProfiles.push(item);
      return item;
    });
  });
  app.post("/api/search-profiles/:profileId/activate", async (req) => {
    const { id } = await scope(req);
    const profileId = (req.params as any).profileId;
    await mutateWorkspace(id, (w) => {
      const p = w.searchProfiles.find((p) => p.id === profileId);
      if (!p) throw new RequestError("Perfil não encontrado.");
      w.filters = p.filters;
      w.routine.mode = p.mode;
      // A saved search cannot silently enable submission while a routine is running.
      w.routine.enabled = false;
      w.routine.nextRun = null;
      refreshMatches(w);
      return { ok: true };
    });
    await configureSchedule(id, false, "08:00");
    return { ok: true };
  });
  app.put("/api/routine", async (req) => {
    const { id, u, demo } = await scope(req);
    const r = routineSchema.parse(req.body);
    if (demo && r.enabled)
      throw new RequestError("Rotinas não executam na demonstração.");
    if (r.enabled && r.mode === "automatic") {
      const w = (await readWorkspace(id))!;
      const available = [
        ...automaticPortals(),
        ...(await readyPortals(u.id, w.resumes[0]?.id || "")),
      ];
      const selected =
        w.interview?.answers.sites ||
        w.sources
          .filter((source) => source.enabled && source.type === "portal")
          .map((source) => source.board);
      if (
        (!selected.length && !supportsAutomatic()) ||
        (selected.length > 0 &&
          !selected.some((site) => available.includes(site)))
      )
        throw new RequestError(
          "Conecte suas contas nos sites escolhidos antes de ativar o envio automático.",
        );
    }
    if (r.enabled) {
      const w = (await readWorkspace(id))!;
      if (!w.sources.some((s) => s.enabled && s.discovery))
        throw new RequestError("Adicione uma fonte antes de ativar a rotina.");
    }
    await configureSchedule(id, r.enabled, r.time);
    await mutateWorkspace(id, (w) => {
      w.routine = {
        ...w.routine,
        ...r,
        nextRun: r.enabled ? nextExecution(r.time) : null,
      };
    });
    return { ok: true };
  });
  app.post("/api/discover", async (req) => {
    const { id } = await scope(req);
    return enqueueDiscovery(id);
  });
  app.post("/api/sources", async (req) => {
    const { id, demo } = await scope(req);
    if (demo)
      throw new RequestError("Adicione fontes no espaço de dados reais.");
    const s = sourceSchema.parse(req.body);
    if (s.type === "portal" && !isPortalId(s.board))
      throw new RequestError("Escolha um portal disponível.");
    if (s.type === "authorized" && !supportsAutomatic())
      throw new RequestError("Adapter autorizado não configurado no servidor.");
    return mutateWorkspace(id, (w) => {
      if (w.sources.length >= 20)
        throw new RequestError("Limite de 20 fontes.");
      const source = {
        ...s,
        id: randomUUID(),
        discovery: !["authorized", "manual"].includes(s.type),
        application: s.type === "authorized",
        status:
          s.type === "authorized"
            ? "Envio autorizado"
            : s.type === "portal"
              ? "Busca pública · candidatura no portal"
              : "API pública · candidatura assistida",
      };
      w.sources.push(source);
      return source;
    });
  });
  app.get("/api/source-registry", async (req) => {
    await identity(req);
    return VERIFIED_SOURCES;
  });
  app.get("/api/source-catalog", async (req) => {
    await identity(req);
    return inspectSourceCatalog();
  });
  app.delete("/api/sources/:sourceId", async (req) => {
    const { id } = await scope(req);
    await mutateWorkspace(id, (w) => {
      w.sources = w.sources.filter(
        (s) => s.id !== (req.params as any).sourceId,
      );
    });
    return { ok: true };
  });
  app.post("/api/jobs", async (req) => {
    const { id, demo } = await scope(req);
    const j = jobSchema.parse(req.body);
    return mutateWorkspace(id, (w) => {
      const job: Job = {
        ...j,
        id: randomUUID(),
        source: demo ? "Exemplo" : "Importação manual",
        salaryPeriod: "month",
        publishedAt: null,
        discoveredAt: new Date().toISOString(),
        saved: false,
        discarded: false,
        origins: j.url
          ? [{ source: "manual", id: randomUUID(), url: j.url }]
          : [],
        match: {} as Job["match"],
        demo,
      };
      if (!job.skills.length)
        job.skills = extractSkills(j.description, w.filters.skills);
      mergeJobs(w, [job]);
      const stored = findExistingJob(w, job);
      if (!stored)
        throw new RequestError(
          "Limite de 2.000 vagas atingido. Descarte vagas antigas para liberar espaço.",
        );
      return stored;
    });
  });
  app.patch("/api/jobs/:jobId", async (req) => {
    const { id } = await scope(req);
    const body = z
      .object({
        saved: z.boolean().optional(),
        discarded: z.boolean().optional(),
        blockCompany: z.boolean().optional(),
      })
      .parse(req.body);
    await mutateWorkspace(id, (w) => {
      const j = w.jobs.find((j) => j.id === (req.params as any).jobId);
      if (!j) throw new RequestError("Vaga não encontrada.");
      if (body.saved !== undefined) j.saved = body.saved;
      if (body.discarded !== undefined) j.discarded = body.discarded;
      if (body.blockCompany && !w.filters.blockedCompanies.includes(j.company))
        w.filters.blockedCompanies.push(j.company);
      refreshMatches(w);
    });
    return { ok: true };
  });
  app.post("/api/applications", async (req) => {
    const { id } = await scope(req);
    const { jobId, resumeId } = z
      .object({ jobId: z.string().uuid(), resumeId: z.string().optional() })
      .parse(req.body);
    return mutateWorkspace(id, (w) => prepare(w, jobId, resumeId));
  });
  app.post("/api/applications/manual", async (req) => {
    const { id } = await scope(req);
    const body = z
      .object({
        jobId: z.string().uuid(),
        confirmation: z.literal(true),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(5000),
      })
      .parse(req.body);
    const createdAt = new Date(`${body.date}T00:00:00-03:00`);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }) !== body.date ||
      body.date >
        new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Sao_Paulo",
        })
    )
      throw new RequestError("Data de envio inválida.");
    return mutateWorkspace(id, (w) => {
      const job = w.jobs.find((j) => j.id === body.jobId);
      if (!job) throw new RequestError("Vaga não encontrada.");
      if (w.applications.some((a) => a.jobId === job.id))
        throw new RequestError("Já existe candidatura para esta vaga.");
      const a = {
        id: randomUUID(),
        jobId: job.id,
        status: "Enviada" as const,
        createdAt: createdAt.toISOString(),
        submittedAt: createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
        resumeId: null,
        receipt: null,
        note: body.note,
        history: [
          {
            at: new Date().toISOString(),
            actor: w.demo ? "Demonstração" : "Usuário",
            message:
              "Usuário registrou e confirmou candidatura feita fora da EmpreGatos.",
          },
        ],
        mode: w.demo ? "demo" : "manual",
      };
      w.applications.unshift(a);
      return a;
    });
  });
  app.post("/api/applications/:applicationId/draft", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo)
      throw new RequestError("Prepare uma candidatura no seu espaço real.");
    const w = (await readWorkspace(id))!;
    const application = w.applications.find(
      (a) => a.id === (req.params as any).applicationId,
    );
    const job = application && w.jobs.find((j) => j.id === application.jobId);
    const resume =
      application &&
      w.resumes.find((r) => r.id === application.resumeId && r.approved);
    if (!application || !job || !resume)
      throw new RequestError(
        "A candidatura precisa de uma vaga e um currículo aprovado.",
      );
    const draft = await applicationDraft(u.id, resume, job);
    return mutateWorkspace(id, (current) => {
      const a = current.applications.find((a) => a.id === application.id);
      if (!a || !current.resumes.some((r) => r.id === a.resumeId && r.approved))
        throw new RequestError(
          "A candidatura mudou. Revise e tente novamente.",
        );
      a.draft = draft;
      return { draft };
    });
  });
  app.patch("/api/applications/:appId", async (req) => {
    const { id } = await scope(req);
    const body = statusSchema.parse(req.body);
    return mutateWorkspace(id, (w) => {
      const a = w.applications.find((a) => a.id === (req.params as any).appId);
      if (!a) throw new RequestError("Candidatura não encontrada.");
      transition(a, body.status, body.confirmation);
      if (body.note !== undefined) a.note = body.note;
      return a;
    });
  });
  app.put("/api/resumes/draft", async (req) => {
    const { id } = await scope(req);
    const draft = z
      .object({
        step: z.number().int().min(0).max(5),
        data: z.object({
          name: z.string().max(100),
          email: z.string().max(254),
          location: z.string().max(200),
          headline: z.string().max(300),
          education: z.string().max(3000),
          experience: z.string().max(5000),
          skills: z.string().max(10000),
          languages: z.string().max(500),
        }),
      })
      .parse(req.body);
    await mutateWorkspace(id, (w) => {
      w.resumeDraft = draft;
    });
    return { ok: true };
  });
  app.post("/api/resumes/build", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo)
      throw new RequestError("Crie seu currículo no espaço de dados reais.");
    const body = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.union([z.email(), z.literal("")]).default(""),
        location: z.string().max(200).default(""),
        headline: z.string().trim().min(1).max(300),
        experience: z.string().max(5000).default(""),
        education: z.string().max(3000).default(""),
        skills: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
        languages: z.string().max(500).default(""),
      })
      .parse(req.body);
    const resumeId = randomUUID();
    const dir = resolve(dataDir, "resumes", u.id);
    await mkdir(dir, { recursive: true });
    const path = resolve(dir, resumeId + ".pdf");
    const text = resumeText(body);
    const targets = await resumeTargets(text, body, "local");
    await writeFile(path, await createResumePdf(body));
    try {
      await mutateWorkspace(id, (w) => {
        if (w.resumes.length >= 20)
          throw new RequestError("Limite de 20 currículos.");
        w.resumes.unshift({
          id: resumeId,
          name: `Currículo · ${body.name}.pdf`,
          uploadedAt: new Date().toISOString(),
          text,
          skills: body.skills,
          approved: false,
          analysis:
            "Documento criado a partir das suas respostas. Revise e aprove antes de usar.",
          suggestion: { ...body, name: body.name, skills: body.skills },
          targets: targets.targets,
          targetsMethod: targets.method,
          targetsVersion: TARGETS_VERSION,
          targetsMessage: targets.message,
          targetsConfirmed: false,
        });
        delete w.resumeDraft;
        requireResumeReview(w);
        refreshMatches(w);
        notify(
          w,
          "Seu currículo está pronto",
          "Baixe o PDF e revise as informações antes de aprová-lo.",
        );
      });
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    await configureSchedule(id, false, "08:00");
    return { resumeId };
  });
  app.post("/api/resumes", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo)
      throw new RequestError("Envie seu currículo no espaço de dados reais.");
    if ((await readWorkspace(id))!.resumes.length >= 20)
      throw new RequestError("Limite de 20 currículos.");
    const file = await req.file();
    if (!file) throw new RequestError("Selecione um arquivo PDF ou DOCX.");
    const buffer = await file.toBuffer();
    const ext = extname(file.filename).toLowerCase();
    if (![".pdf", ".docx"].includes(ext))
      throw new RequestError("Apenas PDF ou DOCX são aceitos.");
    if (ext === ".pdf" && buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new RequestError("O arquivo não é um PDF válido.");
    if (ext === ".docx") {
      if (buffer.length < 46 || buffer.readUInt32LE(0) !== 0x04034b50)
        throw new RequestError("O arquivo não é um DOCX válido.");
      // Inspect central directory before decompression; reject zip bombs and non-document archives.
      let bytes = 0,
        entries = 0,
        document = false;
      for (let i = 0; i < buffer.length - 46; i++)
        if (buffer.readUInt32LE(i) === 0x02014b50) {
          bytes += buffer.readUInt32LE(i + 24);
          entries++;
          const nameLength = buffer.readUInt16LE(i + 28);
          const name = buffer.subarray(i + 46, i + 46 + nameLength).toString();
          if (name === "word/document.xml") document = true;
        }
      if (!document || bytes > 30 * 1024 * 1024 || entries > 500)
        throw new RequestError(
          "DOCX inválido ou excessivamente grande após descompactação.",
        );
    }
    let text = "";
    try {
      if (ext === ".pdf") {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          text = result.text;
        } finally {
          await parser.destroy();
        }
      } else text = extractDocx(buffer);
    } catch {
      throw new RequestError(
        "Não foi possível ler este documento. Tente um PDF com texto selecionável ou DOCX.",
      );
    }
    text = text.slice(0, 100000);
    if (text.trim().length < 40)
      throw new RequestError(
        "Texto insuficiente. PDFs digitalizados precisam de OCR antes do envio.",
      );
    const resumeId = randomUUID();
    const analyzed = await analyzeResume(u.id, text);
    const intelligence = await getIntelligence(u.id);
    const targets = await resumeTargets(
      text,
      analyzed.profile,
      analyzed.method,
      intelligence.model,
    );
    const dir = resolve(dataDir, "resumes", u.id);
    await mkdir(dir, { recursive: true });
    const sanitizedName = file.filename.replace(/[\\/\u0000-\u001f]/g, "_");
    const name =
      sanitizedName.slice(0, -ext.length).slice(0, 200 - ext.length) + ext;
    await writeFile(resolve(dir, resumeId + ext), buffer);
    try {
      await mutateWorkspace(id, (w) => {
        if (w.resumes.length >= 20)
          throw new RequestError("Limite de 20 currículos.");
        const extracted = analyzed.profile;
        w.resumes.unshift({
          id: resumeId,
          name,
          uploadedAt: new Date().toISOString(),
          text,
          skills: extracted.skills ?? [],
          approved: false,
          analysis: analyzed.message,
          suggestion: extracted,
          targets: targets.targets,
          targetsMethod: targets.method,
          targetsVersion: TARGETS_VERSION,
          targetsMessage: targets.message,
          targetsConfirmed: false,
        });
        requireResumeReview(w);
        refreshMatches(w);
        notify(
          w,
          "Currículo analisado",
          "Confira as competências identificadas e confirme seu perfil.",
        );
      });
    } catch (error) {
      await rm(resolve(dir, resumeId + ext), { force: true });
      throw error;
    }
    await configureSchedule(id, false, "08:00");
    return { id: resumeId, name, skills: extractSkills(text) };
  });
  app.post("/api/resumes/:resumeId/analyze", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo)
      throw new RequestError("Analise um currículo no seu espaço real.");
    const resumeId = (req.params as any).resumeId;
    const r = (await readWorkspace(id))!.resumes.find((r) => r.id === resumeId);
    if (!r) throw new RequestError("Currículo não encontrado.");
    const analyzed = await analyzeResume(u.id, r.text);
    const config = await getIntelligence(u.id);
    const targets = await resumeTargets(
      r.text,
      analyzed.profile,
      analyzed.method,
      config.model,
    );
    const active = await mutateWorkspace(id, (w) => {
      const resume = w.resumes.find((r) => r.id === resumeId);
      if (!resume) throw new RequestError("Currículo não encontrado.");
      Object.assign(resume, {
        analysis: analyzed.message,
        suggestion: analyzed.profile,
        skills: analyzed.profile.skills || [],
        targets: targets.targets,
        targetsMethod: targets.method,
        targetsVersion: TARGETS_VERSION,
        targetsMessage: targets.message,
        targetsConfirmed: false,
        approved: false,
      });
      if (w.resumes[0]?.id === resumeId) {
        requireResumeReview(w);
        refreshMatches(w);
        return true;
      }
      return false;
    });
    if (active) await configureSchedule(id, false, "08:00");
    return { ok: true };
  });
  app.put("/api/resumes/:resumeId/targets", async (req) => {
    const { id } = await scope(req);
    const { titles } = z
      .object({ titles: z.array(z.string().min(2).max(100)).min(1).max(8) })
      .parse(req.body);
    return mutateWorkspace(id, (w) => {
      const r = w.resumes.find((r) => r.id === (req.params as any).resumeId);
      if (
        !r ||
        titles.some((title) => !r.targets?.some((t) => t.title === title))
      )
        throw new RequestError("Escolha cargos sugeridos para este currículo.");
      w.resumes.forEach((resume) => {
        resume.targetsConfirmed = false;
      });
      r.targetsConfirmed = true;
      r.targetTitles = [...new Set(titles)];
      w.filters.titles = [...new Set(titles)];
      refreshMatches(w);
      return { ok: true };
    });
  });
  app.patch("/api/resumes/:resumeId", async (req) => {
    const { id } = await scope(req);
    const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
    await mutateWorkspace(id, (w) => {
      const r = w.resumes.find((r) => r.id === (req.params as any).resumeId);
      if (!r) throw new RequestError("Currículo não encontrado.");
      r.approved = approved;
    });
    return { ok: true };
  });
  app.get("/api/resumes/:resumeId/download", async (req, reply) => {
    const { id, u, demo } = await scope(req);
    const resumeId = z
      .string()
      .uuid()
      .parse((req.params as any).resumeId);
    const w = (await readWorkspace(id))!;
    if (demo || !w.resumes.some((r) => r.id === resumeId))
      throw new RequestError("Arquivo não encontrado.");
    const dir = resolve(dataDir, "resumes", u.id);
    let found: Buffer | null = null;
    let ext = ".pdf";
    for (const e of [".pdf", ".docx"]) {
      try {
        found = await readFile(resolve(dir, resumeId + e));
        ext = e;
        break;
      } catch {}
    }
    if (!found) throw new RequestError("Arquivo não encontrado.");
    return reply
      .type(
        ext === ".pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      )
      .header("Content-Disposition", `attachment; filename="curriculo${ext}"`)
      .send(found);
  });
  app.patch("/api/notices", async (req) => {
    const { id } = await scope(req);
    await mutateWorkspace(id, (w) => {
      w.notices.forEach((n) => {
        n.read = true;
      });
    });
    return { ok: true };
  });
  app.get("/api/export", async (req, reply) => {
    const { id, u } = await scope(req);
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="empregatos-dados.json"',
      )
      .send({
        ...(await readWorkspace(id)),
        intelligence: await getIntelligence(u.id),
      });
  });
  app.delete("/api/account", async (req, reply) => {
    const u = await identity(req);
    const { password } = z
      .object({ password: z.string().min(1).max(128) })
      .parse(req.body);
    if (!(await verifyPassword(password, u.password)))
      throw new RequestError("Senha incorreta.");
    for (const row of await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, u.id)))
      await configureSchedule(row.id, false, "08:00");
    await deletePortalConnections(u.id);
    await disconnectLinkedinIdentity(u.id);
    await db.delete(users).where(eq(users.id, u.id));
    clearAnalysisCache(u.id);
    const dir = resolve(dataDir, "resumes", u.id);
    if (
      !dir.startsWith(
        resolve(dataDir, "resumes") +
          (process.platform === "win32" ? "\\" : "/"),
      )
    )
      throw new RequestError("Caminho inválido.");
    await rm(dir, { recursive: true, force: true });
    reply.clearCookie("orbita_session", { path: "/" });
    return { ok: true };
  });
  const dist = resolve("dist");
  if (
    await stat(dist)
      .then((s) => s.isDirectory())
      .catch(() => false)
  ) {
    await app.register(staticFiles, {
      root: dist,
      prefix: "/",
      wildcard: false,
      preCompressed: true,
      cacheControl: false,
      setHeaders(reply, path) {
        const asset = relative(dist, path).replace(/\\/g, "/");
        reply.header(
          "Cache-Control",
          /^assets\/.+-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+(?:\.(?:br|gz))?$/.test(
            asset,
          )
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api")
        ? reply.code(404).send({ error: "Endpoint não encontrado." })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", closePortalBrowsers);
  return app;
}
