import "dotenv/config";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import {
  randomUUID,
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
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
} from "./engine";
import { supportsAutomatic } from "./connectors";
import { inspectSourceCatalog } from "./source-catalog";
import { VERIFIED_SOURCES } from "./source-registry";
import { isPortalId } from "../shared/portals";
import { resumeTargets } from "./resume-targets";
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
  prepare,
  refreshMatches,
  transition,
  notify,
} from "./operations";
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
const tokenHash = (s: string) => createHash("sha256").update(s).digest("hex");
const passwordHash = (p: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
};
const verify = (p: string, hash: string) => {
  const [salt, digest] = hash.split(":");
  return timingSafeEqual(Buffer.from(digest, "hex"), scryptSync(p, salt, 64));
};
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
            ],
          }
        : false,
    bodyLimit: 1024 * 1024,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
  });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
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
    if (error.statusCode && error.statusCode >= 500)
      app.log.error({ code: error.code }, "Falha interna");
    return reply.code(error.statusCode || 400).send({
      error:
        error.statusCode >= 500
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
      throw new Error(
        "O modo de dados demonstrativos foi removido. Use seu espaço real.",
      );
    const id = `${u.id}:${demo ? "demo" : "live"}`;
    if (!(await readWorkspace(id)))
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
          if (!body.name) throw new Error("Informe seu nome.");
          [user] = await db
            .insert(users)
            .values({
              id: randomUUID(),
              email: body.email,
              name: body.name,
              password: passwordHash(body.password),
            })
            .returning();
          await db.insert(workspaces).values({
            id: `${user.id}:live`,
            userId: user.id,
            demo: false,
            data: createWorkspace(user.name, user.email),
          });
        } else {
          [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, body.email));
          if (!user || !verify(body.password, user.password))
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
    if (req.cookies.orbita_session)
      await db
        .delete(sessions)
        .where(eq(sessions.token, tokenHash(req.cookies.orbita_session)));
    reply.clearCookie("orbita_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/workspace", async (req) => {
    const { id } = await scope(req);
    const w = (await readWorkspace(id))!;
    refreshMatches(w);
    const workers = queue ? await queue.getWorkers().catch(() => []) : [];
    w.infrastructure = {
      database: databaseKind,
      queue: queue ? "BullMQ + Redis" : "Agendador local persistente",
      automatic: supportsAutomatic(),
      worker: queue ? workers.length > 0 : true,
    };
    w.jobs.forEach((j) => {
      j.application = w.applications.find((a) => a.jobId === j.id);
    });
    w.intelligence = w.demo
      ? { provider: "local", model: "", enabled: false, keyConfigured: false }
      : await getIntelligence((await identity(req)).id);
    if ((req.query as any).summary === "true") {
      const active = w.jobs.filter(
        (j) => !j.discarded && j.availability !== "closed",
      );
      w.jobCounts = {
        total: active.length,
        saved: active.filter((j) => j.saved).length,
        recommended: active.filter(
          (j) =>
            matchesObjectiveFilters(j, w.profile, w.filters) &&
            j.match.score >= w.filters.minScore &&
            !j.match.blockers.length &&
            j.match.confidence !== "insufficient",
        ).length,
      };
      const previewIds = new Set(
        [...active]
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
    const q = z
      .object({
        search: z.string().max(200).default(""),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        radar: z.enum(["true", "false"]).default("false"),
        tab: z.enum(["all", "compatible", "saved"]).default("all"),
        sort: z.enum(["score", "recent"]).default("score"),
        demo: z.string().optional(),
      })
      .parse(req.query);
    const jobs = w.jobs
      .filter(
        (j) =>
          !j.discarded &&
          j.availability !== "closed" &&
          normalize([j.title, j.company, ...j.skills].join(" ")).includes(
            normalize(q.search),
          ) &&
          (q.radar === "true"
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
      items: jobs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: jobs.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  app.get("/api/jobs/:jobId", async (req) => {
    const { id } = await scope(req);
    const w = (await readWorkspace(id))!;
    const job = w.jobs.find((j) => j.id === (req.params as any).jobId);
    if (!job) throw new Error("Vaga não encontrada.");
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
      throw new Error("Conte qual trabalho você procura antes de começar.");
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
      throw new Error("Configure inteligência no espaço de dados reais.");
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
    if (!job) throw new Error("Vaga não encontrada.");
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
        throw new Error("Limite de 20 perfis de busca.");
      const item = { id: randomUUID(), ...body };
      w.searchProfiles.push(item);
      return item;
    });
  });
  app.post("/api/search-profiles/:profileId/activate", async (req) => {
    const { id } = await scope(req);
    const profileId = (req.params as any).profileId;
    return mutateWorkspace(id, (w) => {
      const p = w.searchProfiles.find((p) => p.id === profileId);
      if (!p) throw new Error("Perfil não encontrado.");
      w.filters = p.filters;
      w.routine.mode = p.mode;
      refreshMatches(w);
      return { ok: true };
    });
  });
  app.put("/api/routine", async (req) => {
    const { id, demo } = await scope(req);
    const r = routineSchema.parse(req.body);
    if (demo && r.enabled)
      throw new Error("Rotinas não executam na demonstração.");
    if (r.mode === "automatic" && !supportsAutomatic())
      throw new Error(
        "Configure uma integração autorizada antes de ativar o envio automático.",
      );
    if (r.enabled) {
      const w = (await readWorkspace(id))!;
      if (!w.sources.some((s) => s.enabled && s.discovery))
        throw new Error("Adicione uma fonte antes de ativar a rotina.");
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
    if (demo) throw new Error("Adicione fontes no espaço de dados reais.");
    const s = sourceSchema.parse(req.body);
    if (s.type === "portal" && !isPortalId(s.board))
      throw new Error("Escolha um portal disponível.");
    if (s.type === "authorized" && !supportsAutomatic())
      throw new Error("Adapter autorizado não configurado no servidor.");
    return mutateWorkspace(id, (w) => {
      if (w.sources.length >= 20) throw new Error("Limite de 20 fontes.");
      const source = {
        ...s,
        id: randomUUID(),
        discovery: !["authorized", "manual"].includes(s.type),
        application: s.type === "authorized",
        status:
          s.type === "authorized"
            ? "Envio autorizado"
            : s.type === "portal"
              ? "Busca com Gemini · candidatura no portal"
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
      return job;
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
      if (!j) throw new Error("Vaga não encontrada.");
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
      throw new Error("Data de envio inválida.");
    return mutateWorkspace(id, (w) => {
      const job = w.jobs.find((j) => j.id === body.jobId);
      if (!job) throw new Error("Vaga não encontrada.");
      if (w.applications.some((a) => a.jobId === job.id))
        throw new Error("Já existe candidatura para esta vaga.");
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
    if (demo) throw new Error("Prepare uma candidatura no seu espaço real.");
    const w = (await readWorkspace(id))!;
    const application = w.applications.find(
      (a) => a.id === (req.params as any).applicationId,
    );
    const job = application && w.jobs.find((j) => j.id === application.jobId);
    const resume =
      application &&
      w.resumes.find((r) => r.id === application.resumeId && r.approved);
    if (!application || !job || !resume)
      throw new Error(
        "A candidatura precisa de uma vaga e um currículo aprovado.",
      );
    const draft = await applicationDraft(u.id, resume, job);
    return mutateWorkspace(id, (current) => {
      const a = current.applications.find((a) => a.id === application.id);
      if (!a || !current.resumes.some((r) => r.id === a.resumeId && r.approved))
        throw new Error("A candidatura mudou. Revise e tente novamente.");
      a.draft = draft;
      return { draft };
    });
  });
  app.patch("/api/applications/:appId", async (req) => {
    const { id } = await scope(req);
    const body = statusSchema.parse(req.body);
    return mutateWorkspace(id, (w) => {
      const a = w.applications.find((a) => a.id === (req.params as any).appId);
      if (!a) throw new Error("Candidatura não encontrada.");
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
    if (demo) throw new Error("Crie seu currículo no espaço de dados reais.");
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
        if (w.resumes.length >= 20) throw new Error("Limite de 20 currículos.");
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
          targetsMessage: targets.message,
          targetsConfirmed: false,
        });
        delete w.resumeDraft;
        w.profile.skills = [...new Set([...w.profile.skills, ...body.skills])];
        for (const field of [
          "education",
          "experience",
          "languages",
          "headline",
          "location",
        ] as const)
          if (!w.profile[field] && body[field]) w.profile[field] = body[field];
        w.profile.confirmed = false;
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
    return { resumeId };
  });
  app.post("/api/resumes", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo) throw new Error("Envie seu currículo no espaço de dados reais.");
    if ((await readWorkspace(id))!.resumes.length >= 20)
      throw new Error("Limite de 20 currículos.");
    const file = await req.file();
    if (!file) throw new Error("Selecione um arquivo PDF ou DOCX.");
    const buffer = await file.toBuffer();
    const ext = extname(file.filename).toLowerCase();
    if (![".pdf", ".docx"].includes(ext))
      throw new Error("Apenas PDF ou DOCX são aceitos.");
    if (ext === ".pdf" && buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("O arquivo não é um PDF válido.");
    if (ext === ".docx") {
      if (buffer.length < 46 || buffer.readUInt32LE(0) !== 0x04034b50)
        throw new Error("O arquivo não é um DOCX válido.");
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
        throw new Error(
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
      throw new Error(
        "Não foi possível ler este documento. Tente um PDF com texto selecionável ou DOCX.",
      );
    }
    text = text.slice(0, 100000);
    if (text.trim().length < 40)
      throw new Error(
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
    const name = file.filename
      .replace(/[\\/\u0000-\u001f]/g, "_")
      .slice(0, 200);
    await writeFile(resolve(dir, resumeId + ext), buffer);
    try {
      await mutateWorkspace(id, (w) => {
        if (w.resumes.length >= 20) throw new Error("Limite de 20 currículos.");
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
          targetsMessage: targets.message,
          targetsConfirmed: false,
        });
        w.profile.skills = [
          ...new Set([...w.profile.skills, ...(extracted.skills ?? [])]),
        ];
        if (!w.profile.github) w.profile.github = extracted.github ?? "";
        for (const [key, value] of Object.entries(extracted))
          if (
            key !== "skills" &&
            key !== "confirmed" &&
            value !== undefined &&
            !(w.profile as any)[key]
          )
            (w.profile as any)[key] = value;
        w.profile.confirmed = false;
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
    return { id: resumeId, name, skills: extractSkills(text) };
  });
  app.post("/api/resumes/:resumeId/analyze", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo) throw new Error("Analise um currículo no seu espaço real.");
    const resumeId = (req.params as any).resumeId;
    const r = (await readWorkspace(id))!.resumes.find((r) => r.id === resumeId);
    if (!r) throw new Error("Currículo não encontrado.");
    const analyzed = await analyzeResume(u.id, r.text);
    const config = await getIntelligence(u.id);
    const targets = await resumeTargets(
      r.text,
      analyzed.profile,
      analyzed.method,
      config.model,
    );
    return mutateWorkspace(id, (w) => {
      const resume = w.resumes.find((r) => r.id === resumeId);
      if (!resume) throw new Error("Currículo não encontrado.");
      Object.assign(resume, {
        analysis: analyzed.message,
        suggestion: analyzed.profile,
        skills: analyzed.profile.skills || [],
        targets: targets.targets,
        targetsMethod: targets.method,
        targetsMessage: targets.message,
        targetsConfirmed: false,
      });
      return { ok: true };
    });
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
        throw new Error("Escolha cargos sugeridos para este currículo.");
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
      if (!r) throw new Error("Currículo não encontrado.");
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
      throw new Error("Arquivo não encontrado.");
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
    if (!found) throw new Error("Arquivo não encontrado.");
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
    const { password } = z.object({ password: z.string() }).parse(req.body);
    if (!verify(password, u.password)) throw new Error("Senha incorreta.");
    for (const row of await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, u.id)))
      await configureSchedule(row.id, false, "08:00");
    await db.delete(users).where(eq(users.id, u.id));
    clearAnalysisCache(u.id);
    const dir = resolve(dataDir, "resumes", u.id);
    if (
      !dir.startsWith(
        resolve(dataDir, "resumes") +
          (process.platform === "win32" ? "\\" : "/"),
      )
    )
      throw new Error("Caminho inválido.");
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
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api")
        ? reply.code(404).send({ error: "Endpoint não encontrado." })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
