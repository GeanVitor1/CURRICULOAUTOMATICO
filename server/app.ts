import { sendAtsApplication } from "./ats-execution";
import "dotenv/config";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { isIP } from "node:net";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { resolve, extname, relative } from "node:path";
import { eq, and, lt, asc } from "./storage-types";
import { z } from "zod";
import { extractDocx } from "./documents";
import { extractPdfText, PdfReaderUnavailableError } from "./pdf-text";
import { createResumePdf, createResumeTextPdf, resumeText } from "./resume-pdf";
import {
  store,
  dataDir,
  databaseKind,
  healthDb,
  mutateWorkspace,
  readWorkspace,
  readResumeArchive,
  workspaceRevision,
} from "./db";
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
  disconnectLinkedinIdentity,
} from "./linkedin-oauth";
import {
  beginOfficialOAuth,
  completeOfficialOAuth,
  disconnectOfficialOAuth,
  officialOAuthConnection,
} from "./official-oauth";
import {
  officialOAuthProviders,
  type OfficialOAuthProvider,
} from "../shared/official-oauth";
import { interviewSchema, applyInterview } from "./career-interview";
import {
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
import {
  candidatePortals,
  portals,
  officialPortalLoginOnly,
} from "../shared/portals";
import { geminiConfigured } from "./gemini";
import {
  antigravityAvailable,
  antigravityStatus,
  startAntigravityLogin,
  finishAntigravityLogin,
  disconnectAntigravity,
} from "./antigravity";
import { inspectSourceCatalog } from "./source-catalog";
import { VERIFIED_SOURCES } from "./source-registry";
import { isPortalId } from "../shared/portals";
import { resumeTargets, TARGETS_VERSION } from "./resume-targets";
import { applicationDraft } from "./application-draft";
import { buildResumeReview } from "./resume-review";
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
  queuePreparedApplications,
} from "./operations";
import { requireResumeReview } from "./resume-state";
import { submissionReadiness } from "./submission-eligibility";
import { candidateDetailsReady } from "../shared/candidate-details";
import { applicationPreferencesSchema } from "./application-preferences";
import { gmailConnection, disconnectGmail } from "./gmail-connection";
import { verifyEmailDestination } from "./email-destination";
import {
  applyCandidateDetails,
  candidateDetailsSchema,
} from "./candidate-details";
import { workspaceDailyLimit, releasePausedReservations, billingDay } from "./billing";
import { dailySubmissionAttempts } from "./submission-attempts";
import { RequestError } from "./errors";
import { queue, configureSchedule } from "./queue";
import { enqueueDiscovery } from "./discovery-queue";
import {
  automationAvailable,
  scheduledTime,
  vercelQueueEnabled,
} from "./automation-runtime";
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
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
  googleOAuthConfigured,
  googleSignInUrl,
  GoogleOAuthError,
  GOOGLE_COOKIE,
  GOOGLE_COOKIE_PATH,
} from "./google-oauth";
import { applicationCapabilities } from "./automation-capabilities";
import { independentExecutionAvailable } from "./ats-registry";
import { sensitiveQuestion } from "./approved-answers";
import { prepareQuestionDrafts, savedQuestionDrafts } from "./question-drafts";
import { withDiscoveryBudget } from "./discovery-budget";
import { applicationPreferenceFields } from "../shared/application-preferences";
import { resolveApplicationDestinations } from "./destination-resolver";
import { cloudPortalEnabled } from "./portal-cloud-policy";
import { cloudPortalCommand } from "./portal-cloud";
import { gupyBrowserSessionSchema } from "./gupy-browser-session";
import { dispatchNextApplication } from "./submission-dispatch";
import {
  accountPlan,
  billingSummary,
  cancelAccountSubscription,
  createBillingPortal,
  createCheckout,
  processBillingEvent,
  verifyBillingEvent,
} from "./billing";
import { plans } from "../shared/plans";
import {
  readPrivateResume,
  writePrivateResume,
  archiveResumeFile,
  restoreResumeFile,
  publicWorkspace,
} from "./resume-storage";
import {
  appOrigins,
  googleOAuthConfig,
  hostedOnVercel,
  secureAuthCookies,
  proxyAuthorized,
} from "./auth-config";
const tokenHash = (s: string) => createHash("sha256").update(s).digest("hex");
function oauthCallbackPage(provider: OfficialOAuthProvider, success: boolean) {
  const name = officialOAuthProviders[provider].name;
  const message = success
    ? provider === "linkedin"
      ? "Seu LinkedIn foi autenticado. Essa permissão identifica sua conta; busca e candidaturas dependem de integrações próprias."
      : "Sua conta do InfoJobs Espanha foi autenticada. Essa conexão não autentica sua conta do InfoJobs Brasil nem libera envios nas vagas brasileiras."
    : "A autorização expirou, foi recusada ou não pôde ser verificada. Volte ao EmpreGatos e tente novamente.";
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conexão ${name}</title><body style="font:16px system-ui;padding:40px;background:#f7f8f4;color:#17201a"><h1>${success ? "Conta autenticada" : "Não foi possível conectar"}</h1><p>${message}</p><a href="/app#automacao">Voltar ao EmpreGatos</a><script>if(window.opener){window.opener.postMessage({type:'empregatos:oauth',provider:${JSON.stringify(provider)},success:${success}},window.location.origin);window.close();}</script></body></html>`;
}
export async function buildApp({ serveStatic = true } = {}) {
  const app = Fastify({
    trustProxy: hostedOnVercel(),
    logger:
      process.env.NODE_ENV !== "test"
        ? {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "req.headers.x-empregatos-proxy-secret",
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
    keyGenerator: (request) => {
      const clientIp = request.headers["x-empregatos-client-ip"];
      return proxyAuthorized(request.headers["x-empregatos-proxy-secret"]) &&
        typeof clientIp === "string" &&
        isIP(clientIp)
        ? clientIp
        : request.ip;
    },
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
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    if (secureAuthCookies()) {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://*.vercel.run; media-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      );
    }
    if (request.url.startsWith("/api"))
      reply.header("Cache-Control", "no-store");
    if (
      process.env.API_PROXY_SECRET &&
      request.url.startsWith("/api/") &&
      request.url.split("?", 1)[0] !== "/api/health"
    ) {
      if (!proxyAuthorized(request.headers["x-empregatos-proxy-secret"]))
        return reply.code(403).send({ error: "Acesso não autorizado." });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      // This one machine-to-machine route uses Stripe's signature over the raw body.
      if (
        request.method === "POST" &&
        request.url.split("?", 1)[0] === "/api/billing/webhook"
      )
        return;
      const allowed = new Set(appOrigins());
      if (!secureAuthCookies()) {
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
  async function sessionIdentity(request: FastifyRequest) {
    const session = request.cookies.orbita_session;
    if (!session)
      throw Object.assign(new Error("Entre na sua conta para continuar."), {
        statusCode: 401,
      });
    const [savedSession] = await store.select("sessions", {
      where: eq("token", tokenHash(session)),
    });
    const [savedUser] = savedSession
      ? await store.select("users", { where: eq("id", savedSession.userId) })
      : [];
    const result =
      savedSession && savedUser
        ? { user: savedUser, session: savedSession }
        : null;
    if (!result || result.session.expiresAt < new Date())
      throw Object.assign(new Error("Sua sessão expirou."), {
        statusCode: 401,
      });
    return result;
  }
  async function identity(request: FastifyRequest) {
    return (await sessionIdentity(request)).user;
  }
  async function createSession(
    reply: FastifyReply,
    userId: string,
    google = false,
  ) {
    await store.delete("sessions", lt("expiresAt", new Date()));
    const token = randomBytes(32).toString("hex");
    await store.insert("sessions", {
      token: tokenHash(token),
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      googleAuthenticatedAt: google ? new Date() : null,
    });
    // Lax lets the session accompany the Google redirect. Mutations also require the CSRF header.
    reply.setCookie("orbita_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: secureAuthCookies(),
      maxAge: 7 * 86400,
    });
  }
  async function scope(request: FastifyRequest) {
    const u = await identity(request);
    const demo = (request.query as any)?.demo === "true";
    if (demo)
      throw new RequestError(
        "O modo de dados demonstrativos foi removido. Use seu espaço real.",
      );
    const id = `${u.id}:${demo ? "demo" : "live"}`;
    const [workspace] = await store.select("workspaces", {
      where: eq("id", id),
      columns: ["id"],
    });
    // Most routes read or mutate the workspace themselves. An existence check
    // must not deserialize its full resume/job history a second time.
    if (!workspace)
      await store.insert(
        "workspaces",
        {
          id,
          userId: u.id,
          demo,
          data: createWorkspace(u.name, u.email, demo),
        },
        { conflict: "ignore" },
      );
    return { u, id, demo };
  }
  app.get("/api/health", async () => {
    await healthDb();
    return { status: "ok", database: databaseKind, revision: process.env.EMPREGATOS_REVISION || "development" };
  });
  app.get("/api/auth/me", async (req) => {
    const { user: u, session } = await sessionIdentity(req);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      googleConnected: !!u.googleSub,
      hasPassword: !!u.password,
      recentGoogleAuthentication:
        !!session.googleAuthenticatedAt &&
        Date.now() - session.googleAuthenticatedAt.getTime() < 5 * 60000,
    };
  });
  app.get("/api/auth/providers", async () => ({
    google: googleOAuthConfigured(),
    googleSignInUrl: googleSignInUrl(),
  }));
  app.get("/api/plans", async () => plans);
  app.get("/api/billing", async (req) =>
    billingSummary((await identity(req)).id),
  );
  app.post(
    "/api/billing/checkout",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const user = await identity(req);
      const { plan } = z
        .object({ plan: z.enum(["plus", "pro"]) })
        .strict()
        .parse(req.body);
      return createCheckout(user.id, plan);
    },
  );
  app.post(
    "/api/billing/portal",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => createBillingPortal((await identity(req)).id),
  );
  await app.register(async (webhooks) => {
    webhooks.removeContentTypeParser("application/json");
    webhooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
    webhooks.post("/api/billing/webhook", async (req) => {
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string" || !Buffer.isBuffer(req.body))
        throw new RequestError("Webhook inválido.");
      return processBillingEvent(verifyBillingEvent(req.body, signature));
    });
  });
  async function startGoogle(
    req: FastifyRequest,
    reply: FastifyReply,
    intent: "signin" | "link" | "reauthenticate" | "gmail",
  ) {
    const config = googleOAuthConfig();
    if (!config)
      throw new RequestError(
        "O acesso com Google ainda não está disponível nesta instalação.",
      );
    const callback = new URL(config.redirectUri);
    if (
      intent !== "signin" &&
      req.headers.origin &&
      req.headers.origin !== callback.origin
    )
      throw new RequestError(
        `Acesse ${callback.origin} e entre na sua conta para conectar o Google.`,
      );
    const challenge = await beginGoogleOAuth(
      intent,
      req.cookies.orbita_session,
    );
    reply.setCookie(GOOGLE_COOKIE, challenge.browserToken, {
      path: GOOGLE_COOKIE_PATH,
      httpOnly: true,
      sameSite: "lax",
      secure: secureAuthCookies(),
      maxAge: 600,
    });
    return challenge.url;
  }
  const googleRateLimit = {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  };
  app.get("/api/auth/google/start", googleRateLimit, async (req, reply) => {
    const config = googleOAuthConfig();
    if (config && req.headers.host !== new URL(config.origin).host)
      return reply.redirect(googleSignInUrl()!);
    try {
      return reply.redirect(await startGoogle(req, reply, "signin"));
    } catch {
      return reply.redirect("/login?google_error=unavailable");
    }
  });
  app.post("/api/auth/google/start", googleRateLimit, async (req, reply) => {
    const { intent } = z
      .object({ intent: z.enum(["link", "reauthenticate", "gmail"]) })
      .parse(req.body);
    const { session } = await sessionIdentity(req);
    // Existing sessions created before OAuth used Strict; let this one survive the redirect.
    reply.setCookie("orbita_session", req.cookies.orbita_session!, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: secureAuthCookies(),
      expires: session.expiresAt,
    });
    return { url: await startGoogle(req, reply, intent) };
  });
  app.get("/api/auth/google/callback", async (req, reply) => {
    reply.clearCookie(GOOGLE_COOKIE, { path: GOOGLE_COOKIE_PATH });
    try {
      const query = z
        .object({
          state: z.string().max(256).optional(),
          code: z.string().max(4096).optional(),
          error: z.string().max(256).optional(),
        })
        .parse(req.query);
      const result = await completeGoogleOAuth({
        state: query.state,
        code: query.code,
        denied: !!query.error,
        browserToken: req.cookies[GOOGLE_COOKIE],
        sessionToken: req.cookies.orbita_session,
      });
      if (result.intent === "signin") {
        await createSession(reply, result.user.id, true);
        return reply.redirect("/app");
      }
      return reply.redirect(
        result.intent === "gmail" ? "/app?gmail=connected#preferencias" : `/app?google=${result.intent === "link" ? "linked" : "reauthenticated"}#conta`,
      );
    } catch (error) {
      const failure =
        error instanceof GoogleOAuthError
          ? error
          : new GoogleOAuthError("failed");
      return reply.redirect(
        `${failure.intent === "signin" ? "/login" : "/app"}?google_error=${encodeURIComponent(failure.reason)}${failure.intent === "signin" ? "" : failure.intent === "gmail" ? "#preferencias" : "#conta"}`,
      );
    }
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
          user = await store.transaction(async (tx) => {
            const [created] = await tx.insert(
              "users",
              {
                id: randomUUID(),
                email: body.email,
                name,
                password,
              },
              { returning: true },
            );
            await tx.insert("workspaces", {
              id: `${created.id}:live`,
              userId: created.id,
              demo: false,
              data: createWorkspace(created.name, created.email),
            });
            return created;
          });
        } else {
          [user] = await store.select("users", {
            where: eq("email", body.email),
          });
          if (!(await verifyPassword(body.password, user?.password)))
            throw Object.assign(new Error("E-mail ou senha incorretos."), {
              statusCode: 401,
            });
        }
        await createSession(reply, user.id);
        return { id: user.id, name: user.name, email: user.email };
      },
    );
  app.post("/api/auth/logout", async (req, reply) => {
    const u = await identity(req).catch(() => null);
    if (u) await closeUserPortalLogins(u.id);
    if (req.cookies.orbita_session)
      await store.delete(
        "sessions",
        eq("token", tokenHash(req.cookies.orbita_session)),
      );
    reply.clearCookie("orbita_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/workspace/version", async (req) => {
    const { id } = await scope(req);
    return { revision: await workspaceRevision(id) };
  });
  app.get("/api/workspace", async (req) => {
    const { id, u } = await scope(req);
    const w = (await readWorkspace(id))!;
    refreshMatches(w);
    const sending = await applicationCapabilities(u.id, w.resumes[0]?.id || "");
    const workers = queue ? await queue.getWorkers().catch(() => []) : [];
    w.infrastructure = {
      candidateDetailsRequired: !w.demo && !candidateDetailsReady(w.profile),
      database: databaseKind,
      queue: queue
        ? "BullMQ + Redis"
        : vercelQueueEnabled()
          ? `Vercel Queues + ${databaseKind}`
          : "Agendador local persistente",
      automatic:
        independentExecutionAvailable() ||
        sending.some(
          (site) =>
            site.automatic &&
            w.sources.some(
              (source) =>
                source.enabled &&
                source.type === "portal" &&
                source.board === site.id,
            ),
        ) ||
        (supportsAutomatic() &&
          w.sources.some(
            (source) =>
              source.enabled &&
              source.type === "authorized" &&
              source.application,
          )),
      worker: queue ? workers.length > 0 : automationAvailable(),
      scheduleWindow: vercelQueueEnabled()
        ? "Todos os dias, entre 8h e 9h (horário de Brasília)."
        : undefined,
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
        collected: active.filter((job) => matchesSelectedSites(job, w)).length,
        excludedByFilters:
          active.filter((job) => matchesSelectedSites(job, w)).length -
          visible.length,
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
    return publicWorkspace(w);
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
      const previous = w.profile;
      w.profile = {
        ...p, approvedAnswers: previous.approvedAnswers,
        applicationPreferences: previous.applicationPreferences,
        answerPolicy: previous.answerPolicy,
        acceptsPj: previous.acceptsPj,
        compensationDisclosure: previous.compensationDisclosure,
        currentCompensation: previous.currentCompensation,
      };
      if (
        p.phone === previous.phone &&
        p.location === previous.location &&
        p.years === previous.years &&
        p.salaryDesired === previous.salaryDesired
      )
        w.profile.candidateDetailsConfirmedAt =
          previous.candidateDetailsConfirmedAt;
      refreshMatches(w);
    });
    return { ok: true };
  });
  app.get("/api/email/connection", async req => {
    const {u} = await scope(req); return gmailConnection(u.id);
  });
  app.get("/api/automation/conversion", async req => {
    const {id,u}=await scope(req);
    const w=(await readWorkspace(id))!;
    const [{automationConversion},native,email]=await Promise.all([
      import("./automation-conversion"),readyPortals(u.id,w.resumes[0]?.id||""),gmailConnection(u.id),
    ]);
    return automationConversion(w,native,email.connected);
  });
  app.post("/api/internal/queue-integration",async req=>{
    const {publishQueueIntegration}=await import("./queue-integration-producer");
    const body=z.object({replay:z.boolean().optional(),discovery:z.boolean().optional()}).parse(req.body);
    return publishQueueIntegration(req.headers['x-queue-integration-key'],body.replay,body.discovery);
  });
  app.delete("/api/email/connection", async req => {
    const {u,demo} = await scope(req);
    if (demo) throw new RequestError("Use sua conta real.");
    await disconnectGmail(u.id); return {ok:true};
  });
  app.put("/api/answer-policy", async req => {
    const { id, demo } = await scope(req);
    if (demo) throw new RequestError("Use sua conta real.");
    const body=z.object({enabled:z.boolean(),confirmation:z.literal(true)}).parse(req.body);
    await mutateWorkspace(id,w=>{
      w.profile.answerPolicy={enabled:body.enabled,missing:"no",confirmedAt:new Date().toISOString()};
      if (body.enabled && w.routine.enabled && w.routine.mode==="automatic") {
        for (const a of w.applications) {
          if (a.status!=="Requer ação manual" || !a.missingQuestions?.length || a.receipt || a.submittedAt || a.singleSubmission) continue;
          // Only resume definitive pre-submit pauses; unknown submissions are never retried.
          if (a.resumeState?.kind==="ats" || !a.history.some(event=>event.message.startsWith("Envio iniciado."))) {
            a.status="Aguardando aprovação";
            a.updatedAt=new Date().toISOString();
            a.history.push({at:a.updatedAt,actor:"Usuário",message:"Autorizou respostas automáticas com resposta negativa na ausência de informação. Retomar preparação antes do envio."});
          }
        }
      }
    });
    if (body.enabled) {
      const {enqueueResolution}=await import("./resolution-queue");
      await enqueueResolution(id);
      await dispatchNextApplication(id);
    }
    return {ok:true};
  });
  app.put("/api/application-preferences", async (req) => {
    const { id, demo } = await scope(req);
    if (demo) throw new RequestError("Salve suas respostas na sua conta real.");
    const { confirmation: _confirmation, ...answers } = applicationPreferencesSchema.parse(req.body);
    await mutateWorkspace(id, (w) => {
      w.profile.applicationPreferences = { ...answers, confirmedAt: new Date().toISOString() };
    });
    return { ok: true };
  });
  app.put("/api/candidate-details", async (req) => {
    const { id, demo } = await scope(req);
    if (demo)
      throw new RequestError(
        "Confirme seus dados no espaço da sua conta real.",
      );
    const details = candidateDetailsSchema.parse(req.body);
    await mutateWorkspace(id, (w) => {
      applyCandidateDetails(w, details);
      refreshMatches(w);
    });
    return { ok: true };
  });
  app.get("/api/automation/sites", async (req) => {
    const u = await identity(req);
    const resumeId = await store.latestResumeId(`${u.id}:live`);
    const connections = await applicationCapabilities(u.id, resumeId);
    const linkedIdentity = await linkedinIdentity(u.id);
    return candidatePortals.map((site) => ({
      id: site,
      independentAutomatic: independentExecutionAvailable(),
      name: portals[site].name,
      discovery: publicDiscoveryAvailable(
        site,
        geminiConfigured() || antigravityAvailable(u.id),
      ),
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
      limitation: officialPortalLoginOnly(site)
        ? cloudPortalEnabled(u.id, site)
          ? "Conexão em navegador remoto na nuvem, sem instalação. A sessão só libera envios após autenticação e confirmação do currículo."
          : "Login diretamente no portal. Abrir ou fechar a aba não conecta sua sessão à automação do EmpreGatos."
        : providerLimits[site],
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
      automatic: connections.find((connection) => connection.id === site)!
        .automatic,
    }));
  });
  app.delete("/api/profile/answers/:answerId", async (req) => {
    const { id } = await scope(req);
    const answerId = z
      .string()
      .uuid()
      .parse((req.params as any).answerId);
    await mutateWorkspace(id, (w) => {
      w.profile.approvedAnswers = w.profile.approvedAnswers?.filter(
        (answer) => answer.id !== answerId,
      );
    });
    return { ok: true };
  });
  const oauthProvider = z.enum(["linkedin", "infojobs-es"]);
  app.get("/api/oauth/connections", async (req) => {
    const u = await identity(req);
    return Promise.all(
      (Object.keys(officialOAuthProviders) as OfficialOAuthProvider[]).map(
        (provider) => officialOAuthConnection(u.id, provider),
      ),
    );
  });
  app.post(
    "/api/oauth/:provider/start",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req) => {
      const { u, demo } = await scope(req);
      if (demo)
        throw new RequestError("A demonstração não conecta contas externas.");
      const provider = oauthProvider.parse((req.params as any).provider);
      return { url: await beginOfficialOAuth(u.id, provider) };
    },
  );
  app.delete("/api/oauth/:provider", async (req) => {
    const { u, demo } = await scope(req);
    if (demo)
      throw new RequestError("A demonstração não altera conexões externas.");
    const provider = oauthProvider.parse((req.params as any).provider);
    await disconnectOfficialOAuth(u.id, provider);
    return { ok: true };
  });
  app.get("/api/oauth/:provider/callback", async (req, reply) => {
    const provider = oauthProvider.parse((req.params as any).provider);
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
      await completeOfficialOAuth(
        u.id,
        provider,
        query.state,
        query.code,
        !!query.error,
      );
      success = true;
    } catch {
      /* Never render provider responses, codes, tokens or personal data. */
    }
    return reply
      .type("text/html")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      )
      .send(oauthCallbackPage(provider, success));
  });
  const connectionPortal = z.enum(candidatePortals);
  const connectionScope = async (req: FastifyRequest, interactive = false) => {
    const { u, demo } = await scope(req);
    if (demo) throw new RequestError("Conecte os sites na sua conta real.");
    const portal = connectionPortal.parse((req.params as any).portal);
    if (
      interactive &&
      officialPortalLoginOnly(portal) &&
      !cloudPortalEnabled(u.id, portal)
    )
      throw new RequestError(
        "Faça login no site oficial, em outra aba. O EmpreGatos não recebe e-mail ou senha deste portal. Esse login não conecta a conta à automação.",
      );
    if (cloudPortalEnabled(u.id, portal)) {
      const w = await readWorkspace(`${u.id}:live`);
      if (
        w?.applications.some(
          (a) =>
            a.status === "Enviando" &&
            w.jobs.some(
              (j) => j.id === a.jobId && j.source.toLowerCase() === portal,
            ),
        )
      )
        throw new RequestError(
          "Este portal está enviando uma candidatura. Aguarde a conclusão para alterar a conexão.",
        );
    }
    return { u, portal };
  };
  app.post("/api/connections/:portal/browser-session", {
    config: { rateLimit: { max: 4, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { u, portal } = await connectionScope(req, true);
    if (portal !== "gupy") throw new RequestError("Esta conexão está disponível somente para a Gupy.");
    const body = z.object({
      authorizeSessionTransfer: z.literal(true),
      state: gupyBrowserSessionSchema,
    }).strict().parse(req.body);
    reply.header("Cache-Control", "no-store");
    if (!cloudPortalEnabled(u.id, "gupy"))
      throw new RequestError("A conexão da Gupy não está disponível para esta conta.");
    return cloudPortalCommand(u.id, "gupy", {
      op: "import-browser-session", browserSession: body.state,
      viewerOrigin: req.headers.origin || appOrigins()[0],
    });
  });
  app.post(
    "/api/connections/:portal/open",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { u, portal } = await connectionScope(req, true);
      const settings = cloudPortalEnabled(u.id, portal)
        ? z
            .object({
              remoteBrowserConsent: z.literal(true),
              viewportWidth: z.number().int().min(375).max(1600).optional(),
              viewportHeight: z.number().int().min(480).max(1000).optional(),
            })
            .parse(req.body)
        : undefined;
      reply.header("Cache-Control", "no-store");
      return startPortalLogin(
        u.id,
        portal,
        settings?.viewportWidth,
        req.headers.origin || appOrigins()[0],
        settings?.viewportHeight,
      );
    },
  );
  app.post("/api/connections/:portal/action", async (req, reply) => {
    const { u, portal } = await connectionScope(req, true);
    const viewerId = cloudPortalEnabled(u.id, portal)
      ? z.string().uuid().parse(req.headers["x-portal-viewer"])
      : undefined;
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
          x: z.number().min(0).max(1600),
          y: z.number().min(0).max(1000),
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
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
            "Delete",
            "PageUp",
            "PageDown",
          ]),
        }),
        z.object({
          type: z.literal("scroll"),
          delta: z.number().min(-1200).max(1200),
          x: z.number().min(0).max(1600).optional(),
          y: z.number().min(0).max(1000).optional(),
        }),
        z.object({ type: z.literal("refresh") }),
        z.object({ type: z.literal("login") }),
        z.object({
          type: z.literal("resize"),
          width: z.number().int().min(375).max(1600),
          height: z.number().int().min(480).max(1000),
        }),
      ])
      .parse(req.body);
    reply.header("Cache-Control", "no-store");
    return portalLoginAction(u.id, portal, action, viewerId);
  });
  app.post("/api/connections/:portal/confirm", async (req) => {
    const { u, portal } = await connectionScope(req, true);
    const cloud = cloudPortalEnabled(u.id, portal);
    const viewerId = cloud
      ? z.string().uuid().parse(req.headers["x-portal-viewer"])
      : undefined;
    const { profileResumeId } = z
      .object({ profileResumeId: z.string().max(100).nullable().default(null) })
      .parse(req.body || {});
    if (profileResumeId) {
      const w = await readWorkspace(`${u.id}:live`);
      if (!w?.resumes.some((resume) => resume.id === profileResumeId))
        throw new RequestError("O currículo escolhido não foi encontrado.");
    }
    if (cloud) {
      if ((req.body as any)?.connectionOnly === true) {
        z.object({
          connectionOnly: z.literal(true),
          authorizeAutomation: z.literal(false),
          profileResumeId: z.null(),
        }).strict().parse(req.body);
      } else {
        z.object({
          authorizeAutomation: z.literal(true),
          profileResumeId: z.string().min(1),
        }).parse(req.body);
        const w = await readWorkspace(`${u.id}:live`);
        if (
          !w?.profile.confirmed ||
          !w.interview?.completed ||
          w.interview.answers.resumeId !== profileResumeId ||
          !w.interview.answers.sites.includes(portal) ||
          !w.resumes.some((r) => r.id === profileResumeId && r.approved)
        )
          throw new RequestError(
            "Confirme o currículo e conclua as preferências antes de liberar os envios.",
          );
      }
    }
    const result = await finishPortalLogin(
      u.id,
      portal,
      profileResumeId,
      viewerId,
    );
    let automatic = false;
    if (cloudPortalEnabled(u.id, portal) && profileResumeId) {
      const nativeSites = await readyPortals(u.id, profileResumeId);
      await mutateWorkspace(`${u.id}:live`, (w) => {
        if (
          !w.profile.confirmed ||
          !w.resumes.some((r) => r.id === profileResumeId && r.approved) ||
          !w.interview?.completed ||
          w.interview.answers.resumeId !== profileResumeId
        )
          return;
        w.routine.enabled = true;
        w.routine.mode = "automatic";
        w.routine.nextRun = nextExecution(w.routine.time);
        queuePreparedApplications(w, nativeSites);
        automatic = true;
      });
      await dispatchNextApplication(`${u.id}:live`);
    }
    return { ...result, automatic };
  });
  app.post("/api/connections/:portal/close", async (req) => {
    const { u, portal } = await connectionScope(req);
    const viewerId = cloudPortalEnabled(u.id, portal)
      ? z.string().uuid().parse(req.headers["x-portal-viewer"])
      : undefined;
    await cancelPortalLogin(u.id, portal, viewerId);
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
    if (body.complete && body.start !== "save" && !automationAvailable())
      throw new RequestError(
        "A automação está indisponível. A configuração do serviço precisa ser concluída antes de iniciar buscas e envios.",
      );
    const plan = await accountPlan(u.id);
    body.answers.dailyLimit = Math.min(
      body.answers.dailyLimit,
      plan.dailyLimit,
    );
    if (demo && body.start !== "save")
      throw new RequestError("A demonstração não inicia buscas ou envios.");
    const availableSites = [
      ...(independentExecutionAvailable() ? ["independent"] : []),
      ...automaticPortals(),
      ...(await readyPortals(u.id, body.answers.resumeId)),
    ];
    await mutateWorkspace(id, (w) => {
      w.routine.time = scheduledTime(w.routine.time);
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
  app.get("/api/antigravity", async (req) =>
    antigravityStatus((await identity(req)).id),
  );
  app.post(
    "/api/antigravity/login",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => {
      const { u, demo } = await scope(req);
      if (demo) throw new RequestError("Conecte no espaço de dados reais.");
      return startAntigravityLogin(u.id);
    },
  );
  app.post(
    "/api/antigravity/confirm",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const { u, demo } = await scope(req);
      if (demo) throw new RequestError("Conecte no espaço de dados reais.");
      return finishAntigravityLogin(u.id, req.body);
    },
  );
  app.delete("/api/antigravity", async (req) =>
    disconnectAntigravity((await identity(req)).id),
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
    if (r.enabled && !automationAvailable())
      throw new RequestError(
        "A automação está indisponível. A configuração do serviço precisa ser concluída antes de ativar a rotina.",
      );
    r.time = scheduledTime(r.time);
    r.dailyLimit = Math.min(r.dailyLimit, (await accountPlan(u.id)).dailyLimit);
    let nativeSites: string[] = [];
    if (demo && r.enabled)
      throw new RequestError("Rotinas não executam na demonstração.");
    if (r.enabled && r.mode === "automatic") {
      const w = (await readWorkspace(id))!;
      nativeSites = await readyPortals(u.id, w.resumes[0]?.id || "");
      const available = [...automaticPortals(), ...nativeSites];
      const gmail = await gmailConnection(u.id);
      const emailAvailable = gmail.connected && gmail.email?.toLowerCase() === w.profile.email.toLowerCase();
      const selected =
        w.interview?.answers.sites ||
        w.sources
          .filter((source) => source.enabled && source.type === "portal")
          .map((source) => source.board);
      if (r.destinationPolicy === "official" && !independentExecutionAvailable() && !emailAvailable)
        throw new RequestError("O envio pelos formulários oficiais ainda não está disponível nesta instalação. A busca e a preparação continuam disponíveis.");
      if (
        !independentExecutionAvailable() &&
        !emailAvailable &&
        ((!selected.length && !supportsAutomatic()) ||
          (selected.length > 0 &&
            !selected.some((site) => available.includes(site))))
      ) {
        const capabilities = await applicationCapabilities(
          u.id,
          w.resumes[0]?.id || "",
        );
        throw new RequestError(
          selected
            .map(
              (site) =>
                capabilities.find((item) => item.id === site)
                  ?.applicationMessage,
            )
            .filter(Boolean)
            .join(" ") ||
            "Nenhuma integração de envio foi configurada para esta conta.",
        );
      }
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
      if (r.enabled && r.mode === "automatic")
        queuePreparedApplications(w, nativeSites);
    });
    if (r.enabled && r.mode === "automatic") {
      await dispatchNextApplication(id);
      await (await import("./automatic-cycle")).continueAutomaticCycle(id);
    }
    return { ok: true };
  });
  app.post("/api/routine/process", async (req) => {
    const { id, u, demo } = await scope(req);
    const { jobId } = z.object({jobId:z.string().min(1).max(100).optional()}).parse(req.body || {});
    if (demo) throw new RequestError("Use sua conta real.");
    const snapshot = (await readWorkspace(id))!;
    if (!snapshot.routine.enabled || snapshot.routine.mode !== "automatic")
      throw new RequestError("Ative o envio automático antes de processar as vagas.");
    const nativeSites = await readyPortals(u.id, snapshot.interview?.answers.resumeId || snapshot.resumes[0]?.id || "");
    const dailyLimit = (await accountPlan(u.id)).dailyLimit;
    const queued = await mutateWorkspace(id, async (w,tx) => {
      await releasePausedReservations(tx,u.id,w);
      const used=await tx.count("applicationUsage",and(eq("userId",u.id),eq("day",billingDay())));
      return queuePreparedApplications(w, nativeSites, dailyLimit-Math.max(0,used-dailySubmissionAttempts(w)), jobId);
    });
    await dispatchNextApplication(id);
    await (await import("./automatic-cycle")).continueAutomaticCycle(id);
    return { ok: true, queued };
  });
  app.post("/api/applications/:appId/confirm-not-submitted", async req => {
    const {id,demo}=await scope(req);
    if(demo) throw new RequestError("Use sua conta real.");
    const body=z.object({confirmation:z.literal(true),reason:z.string().trim().min(10).max(1000)}).parse(req.body);
    await mutateWorkspace(id,w=>{
      const a=w.applications.find(a=>a.id===(req.params as {appId:string}).appId);
      const job=a&&w.jobs.find(j=>j.id===a.jobId);
      const destination=job?.destinations?.find(d=>d.state==="verified"&&d.formFound&&d.url===a?.destinationUrl);
      if(!a || !job || !destination || a.receipt || a.submittedAt || !a.resumeId || !["Resultado desconhecido","Falha no envio"].includes(a.status))
        throw new RequestError("Esta tentativa não permite revisão de ausência de envio.");
      a.status="Requer ação manual";
      a.updatedAt=new Date().toISOString();
      a.resumeState={resumeId:a.resumeId,destinationUrl:job.url,targetUrl:destination.url,kind:"ats",recordedAt:a.updatedAt};
      a.history.push({at:a.updatedAt,actor:"Usuário",message:`Confirmou após verificação que a candidatura não foi enviada: ${body.reason} O envio não foi reiniciado; é necessária nova autorização.`});
    });
    return {ok:true};
  });
  app.post(
    "/api/discover",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const { id } = await scope(req);
      if (!automationAvailable())
        throw new RequestError(
          "A busca está indisponível. A configuração do serviço precisa ser concluída antes de iniciar uma pesquisa.",
        );
      return enqueueDiscovery(id);
    },
  );
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
  app.post(
    "/api/jobs/:jobId/resolve",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const { id, demo } = await scope(req);
      if (demo)
        throw new RequestError(
          "A demonstração não consulta destinos externos.",
        );
      const jobId = z
        .string()
        .uuid()
        .parse((req.params as any).jobId);
      const { enqueueResolution, researchAllowance } =
        await import("./resolution-queue");
      let cached = false;
      await mutateWorkspace(id, (w) => {
        const job = w.jobs.find((item) => item.id === jobId);
        if (!job || job.discarded || job.availability === "closed")
          throw new RequestError("Vaga indisponível para verificar destinos.");
        cached =
          !!job.resolution && Date.parse(job.resolution.retryAt) > Date.now();
        if (!cached && researchAllowance(w) <= 0)
          throw new RequestError(
            "O limite diário de pesquisa de destinos foi atingido. Tente novamente amanhã.",
          );
      });
      if (cached) return { taskId: null, status: "cached" };
      return { taskId: await enqueueResolution(id, [jobId]), status: "queued" };
    },
  );
  app.post("/api/applications", async (req) => {
    const { id } = await scope(req);
    const { jobId, resumeId, acceptMissingData } = z
      .object({ jobId: z.string().uuid(), resumeId: z.string().optional(), acceptMissingData: z.literal(true).optional() })
      .parse(req.body);
    return mutateWorkspace(id, (w) => prepare(w, jobId, resumeId, acceptMissingData));
  });
  app.post("/api/jobs/:jobId/email-destination", async req => {
    const {id,demo,u} = await scope(req);
    if (demo) throw new RequestError("Use sua conta real.");
    const body=z.object({employerUrl:z.string().url().max(2000).optional()}).parse(req.body);
    const jobId=(req.params as {jobId:string}).jobId;
    const w=await readWorkspace(id), job=w?.jobs.find(item=>item.id===jobId);
    if (!job) throw new RequestError("Vaga não encontrada.");
    const destination=await verifyEmailDestination(job,body.employerUrl);
    const dailyLimit=(await accountPlan(u.id)).dailyLimit;
    const nativeSites=await readyPortals(u.id,w!.interview?.answers.resumeId || w!.resumes[0]?.id || '');
    await mutateWorkspace(id,async (current,tx)=>{
      const currentJob=current.jobs.find(item=>item.id===jobId);
      if (!currentJob || currentJob.url !== destination.publicationUrl || currentJob.company !== job.company || currentJob.title !== job.title)
        throw new RequestError("A vaga mudou durante a verificação. Atualize a página.");
      currentJob.emailDestination=destination;
      if(destination.publishedAt) currentJob.publishedAt=destination.publishedAt;
      await releasePausedReservations(tx,u.id,current);
      queuePreparedApplications(current,nativeSites,dailyLimit,jobId);
    });
    await dispatchNextApplication(id);
    return {ok:true,destination};
  });
  app.get("/api/applications/:appId/readiness", async (req) => {
    const { id, u } = await scope(req);
    const w = (await readWorkspace(id))!;
    const application = w.applications.find(
      (a) => a.id === (req.params as any).appId,
    );
    if (!application) throw new RequestError("Candidatura não encontrada.");
    const sites = await readyPortals(u.id, application.resumeId || "");
    const result = submissionReadiness(
      w,
      application,
      sites,
      (await accountPlan(u.id)).dailyLimit,
    );
    if (result.method === "email") {
      const connection=await gmailConnection(u.id);
      if (!connection.connected || connection.email?.toLowerCase() !== w.profile.email.toLowerCase()) {
        result.blockers.push("Conecte seu Gmail para candidaturas nas preferências."); result.ready=false;
      }
    }
    if (!automationAvailable()) {
      result.blockers.push(
        "O serviço de envio está indisponível. Tente novamente mais tarde.",
      );
      result.ready = false;
    }
    return result;
  });
  app.post("/api/applications/:appId/send", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo) throw new RequestError("Envios exigem uma conta real.");
    if (!automationAvailable())
      throw new RequestError("O serviço de envio está indisponível.");
    const body = z
      .object({
        confirmation: z.literal(true),
        resumeId: z.string().min(1).max(100),
        destinationUrl: z.string().url().max(2000),
        method: z.enum(["webhook", "browser", "ats_browser", "email"]),
      })
      .parse(req.body);
    const nativeSites = await readyPortals(u.id, body.resumeId);
    await mutateWorkspace(id, async (w, tx) => {
      const application = w.applications.find(
        (a) => a.id === (req.params as any).appId,
      );
      if (!application) throw new RequestError("Candidatura não encontrada.");
      const readiness = submissionReadiness(
        w,
        application,
        nativeSites,
        await workspaceDailyLimit(tx, id, w.routine.dailyLimit),
      );
      if (!readiness.ready)
        throw new RequestError(readiness.blockers.join(" "));
      if (
        readiness.resumeId !== body.resumeId ||
        readiness.destinationUrl !== body.destinationUrl ||
        readiness.method !== body.method
      )
        throw new RequestError(
          "O currículo ou destino mudou. Atualize a revisão antes de autorizar.",
        );
      // Repeated clicks only republish the same durable authorization and idempotency key.
      if (
        application.status === "Aguardando aprovação" &&
        application.singleSubmission &&
        Date.parse(application.singleSubmission.expiresAt) > Date.now()
      )
        return;
      const at = new Date().toISOString();
      application.singleSubmission = {
        confirmedAt: at,
        expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
        resumeId: body.resumeId,
        destinationUrl: body.destinationUrl,
        method: body.method,
      };
      application.status = "Aguardando aprovação";
      application.mode = "single";
      application.updatedAt = at;
      application.history.push({
        at,
        actor: "Usuário",
        message:
          "Autorizou somente esta candidatura com o currículo e o destino revisados. A rotina geral não foi alterada.",
      });
    });
    await dispatchNextApplication(id);
    return { ok: true, status: "queued" };
  });
  app.delete("/api/applications/:appId/send", async (req) => {
    const { id } = await scope(req);
    await mutateWorkspace(id, (w) => {
      const application = w.applications.find(
        (a) => a.id === (req.params as any).appId,
      );
      if (
        !application?.singleSubmission ||
        application.status !== "Aguardando aprovação"
      )
        throw new RequestError(
          "Só é possível cancelar antes de iniciar o envio.",
        );
      application.singleSubmission.expiresAt = new Date().toISOString();
      application.status = "Requer ação manual";
      application.updatedAt = new Date().toISOString();
      application.history.push({
        at: application.updatedAt,
        actor: "Usuário",
        message: "Cancelou a autorização individual antes do início do envio.",
      });
    });
    return { ok: true };
  });
  app.post("/api/applications/:appId/questions/inspect", async req => {
    const {id, demo} = await scope(req);
    if (demo) throw new RequestError("Use sua conta real.");
    const snapshot = (await readWorkspace(id))!;
    const application = snapshot.applications.find(a => a.id === (req.params as any).appId);
    const job = snapshot.jobs.find(j => j.id === application?.jobId);
    if (!application || !job || application.receipt || application.submittedAt || !["Requer ação manual", "Aguardando aprovação"].includes(application.status))
      throw new RequestError("Esta candidatura não permite preparação de perguntas.");
    let destination = job.destinations?.find(d => d.state === "verified" && d.url === application.destinationUrl);
    if (!destination) throw new RequestError("Verifique o destino oficial antes de preparar as perguntas.");
    if (!Number.isFinite(Date.parse(destination.expiresAt)) || Date.parse(destination.expiresAt) <= Date.now()) {
      const refreshed = await resolveApplicationDestinations({ ...job, url: destination.url, applicationUrls: [] }, { maxPages: 2, timeoutMs: 12000 });
      const currentDestination = refreshed.destinations?.find(d => d.state === "verified" && d.url === application.destinationUrl && Date.parse(d.expiresAt) > Date.now());
      if (!currentDestination) throw new RequestError("Não foi possível confirmar que este formulário continua disponível. Consulte a vaga original e tente atualizar novamente.");
      destination = currentDestination;
      await mutateWorkspace(id, w => {
        const currentJob = w.jobs.find(j => j.id === job.id);
        if (currentJob) currentJob.destinations = currentJob.destinations?.map(d => d.url === currentDestination.url ? currentDestination : d);
      });
    }
    const destinationUrl = destination.url;
    const result = await sendAtsApplication({inspectOnly:true, applicationId:application.id, profile:snapshot.profile,
      job:{title:job.title,company:job.company,url:destination.url}, resume:{name:""}, destination});
    await mutateWorkspace(id, w => {
      const current = w.applications.find(a => a.id === application.id);
      if (!current || current.destinationUrl !== destinationUrl || current.receipt || current.submittedAt || !["Requer ação manual", "Aguardando aprovação"].includes(current.status))
        throw new RequestError("A candidatura mudou durante a preparação. Atualize a página.");
      if (result.preflightReady || result.missingQuestions) {
        current.missingQuestions = result.missingQuestions || [];
        current.questionOptions = result.questionOptions;
      }
      if (!result.preflightReady) current.status = "Requer ação manual";
      current.updatedAt = new Date().toISOString();
      current.history.push({at:current.updatedAt, actor:"Sistema", message:`Preparação antes do envio: ${result.message}`});
    });
    return {ok:true, ready:!!result.preflightReady, message:result.message};
  });
  app.post("/api/applications/:appId/questions/draft", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async req => {
    const { id, u, demo } = await scope(req);
    if (demo) throw new RequestError("Use sua conta real para preparar respostas.");
    const snapshot = (await readWorkspace(id))!;
    const application = snapshot.applications.find(a => a.id === (req.params as any).appId);
    if (!application || application.status !== "Requer ação manual" || application.receipt || application.submittedAt || !application.missingQuestions?.length)
      throw new RequestError("Esta candidatura não está aguardando respostas.");
    const resume = snapshot.resumes.find(r => r.id === application.resumeId && r.approved);
    if (!resume) throw new RequestError("Aprove o currículo desta candidatura antes de preparar respostas.");
    if (!application.destinationUrl) throw new RequestError("Esta candidatura não possui destino confirmado.");
    const saved = savedQuestionDrafts(application.missingQuestions, snapshot.profile, application.destinationUrl, application.questionOptions);
    const remaining = application.missingQuestions.filter(q => !saved.some(a => a.question === q));
    const config = await getIntelligence(u.id);
    let warning = "";
    let generated: Awaited<ReturnType<typeof prepareQuestionDrafts>> = [];
    try {
      if (config.provider === "gemini" && config.enabled && config.consent) {
        const preferences = snapshot.profile.applicationPreferences;
        const confirmedFacts = snapshot.profile.confirmed && preferences?.confirmedAt
          ? applicationPreferenceFields.filter(field => !["accessibility", "linkedin", "currentCompany"].includes(field.key))
            .flatMap(field => preferences[field.key] ? [`${field.label}: ${preferences[field.key]}`] : []) : [];
        generated = await withDiscoveryBudget(35000, () => prepareQuestionDrafts({ resume: resume.text, questions: remaining, confirmedFacts,
          options: application.questionOptions, title: snapshot.jobs.find(j => j.id === application.jobId)?.title || "", model: config.model }));
      } else warning = "Autorize a análise por IA abaixo para gerar sugestões. As respostas do perfil continuam disponíveis.";
    } catch {
      warning = "A IA não respondeu. Suas respostas do perfil foram preservadas. Tente novamente para gerar as demais.";
    }
    const answers = [...saved, ...generated.map(answer => ({ ...answer, source: "ai" as const }))];
    const unresolved = remaining.filter(q => !generated.some(a => a.question === q)).map(question => ({question,
      reason: sensitiveQuestion(question) ? "Esta declaração exige sua resposta pessoal." : "Confira ou complete esta informação. Não há base suficiente para responder automaticamente."}));
    return { answers, unresolved, warning, message: `${saved.length} do perfil · ${generated.length} da IA · ${unresolved.length} para você completar.` };
  });
  app.put("/api/applications/:appId/answers", async (req) => {
    const { id, u, demo } = await scope(req);
    if (demo)
      throw new RequestError("Respostas de envio exigem uma conta real.");
    const body = z
      .object({
        confirmation: z.literal(true),
        answers: z
          .array(
            z.object({
              question: z.string().trim().min(3).max(4000),
              value: z.string().trim().min(1).max(3000),
              reuse: z.boolean().default(false),
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(req.body);
    await mutateWorkspace(id, (w) => {
      const application = w.applications.find(
        (a) => a.id === (req.params as any).appId,
      );
      if (
        !application ||
        application.status !== "Requer ação manual" ||
        !application.destinationUrl
      )
        throw new RequestError(
          "Esta candidatura não está aguardando respostas.",
        );
      for (const answer of body.answers) {
        if (!application.missingQuestions?.includes(answer.question))
          throw new RequestError("Pergunta não encontrada nesta candidatura.");
        const options = application.questionOptions?.[answer.question];
        if (options?.length && !options.includes(answer.value))
          throw new RequestError("Selecione uma das opções do formulário para esta pergunta.");
        const destinationOrigin = new URL(application.destinationUrl).origin;
        w.profile.approvedAnswers ||= [];
        w.profile.approvedAnswers = w.profile.approvedAnswers.filter(
          (a) =>
            a.question !== answer.question ||
            a.destinationOrigin !== destinationOrigin,
        );
        w.profile.approvedAnswers.push({
          id: randomUUID(),
          question: answer.question,
          aliases: [],
          value: answer.value,
          confirmedAt: new Date().toISOString(),
          destinationOrigin,
          ...(!answer.reuse || sensitiveQuestion(answer.question)
            ? { destinationUrl: application.destinationUrl }
            : {}),
        });
        if (w.profile.approvedAnswers.length > 100)
          throw new RequestError(
            "Limite de respostas salvas atingido. Revise seu perfil.",
          );
      }
      // Clear only explicitly confirmed questions; the worker must inspect the form again.
      {
        const answered = new Set(body.answers.map(answer=>answer.question));
        application.missingQuestions = application.missingQuestions?.filter(question=>!answered.has(question));
      }
      application.history.push({
        at: new Date().toISOString(),
        actor: "Usuário",
        message:
          "Respostas confirmadas nas Preferências para este destino. A preparação deve conferir novamente o formulário antes do envio.",
      });
    });
    const snapshot = (await readWorkspace(id))!;
    const answeredApplication = snapshot.applications.find(a => a.id === (req.params as any).appId);
    if (answeredApplication && !answeredApplication.missingQuestions?.length && !answeredApplication.singleSubmission && snapshot.routine.enabled && snapshot.routine.mode === "automatic") {
      const sites = await readyPortals(u.id, answeredApplication.resumeId || "");
      const limit = (await accountPlan(u.id)).dailyLimit;
      await mutateWorkspace(id, w => queuePreparedApplications(w, sites, limit, answeredApplication.jobId));
      await dispatchNextApplication(id);
    }
    return { ok: true };
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
    const generatedPdf = await createResumePdf(body);
    await writePrivateResume(path, generatedPdf);
    try {
      await mutateWorkspace(id, (w) => {
        if (w.resumes.length >= 20)
          throw new RequestError("Limite de 20 currículos.");
        w.resumes.unshift({
          id: resumeId,
          name: `Currículo · ${body.name}.pdf`,
          storedFile: archiveResumeFile(generatedPdf, ".pdf"),
          uploadedAt: new Date().toISOString(),
          text,
          skills: body.skills,
          approved: false,
          analysis:
            "Documento criado a partir das suas respostas. Revise e aprove antes de usar.",
          review: buildResumeReview(text, body),
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
        text = await extractPdfText(buffer);
      } else text = extractDocx(buffer);
    } catch (error) {
      if (error instanceof PdfReaderUnavailableError) throw error;
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
    await writePrivateResume(resolve(dir, resumeId + ext), buffer);
    try {
      await mutateWorkspace(id, (w) => {
        if (w.resumes.length >= 20)
          throw new RequestError("Limite de 20 currículos.");
        const extracted = analyzed.profile;
        w.resumes.unshift({
          id: resumeId,
          name,
          storedFile: archiveResumeFile(
            buffer,
            ext === ".pdf" ? ".pdf" : ".docx",
          ),
          uploadedAt: new Date().toISOString(),
          text,
          skills: extracted.skills ?? [],
          approved: false,
          analysis: analyzed.message,
          review: analyzed.review,
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
        review: analyzed.review,
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
    const resume = w.resumes.find((r) => r.id === resumeId)!;
    const dir = resolve(dataDir, "resumes", u.id);
    let found: Buffer | null = null;
    let ext = ".pdf";
    const archive = await readResumeArchive(id, resumeId);
    if (archive) {
      found = restoreResumeFile(archive);
      ext = archive.extension;
    }
    for (const e of [".pdf", ".docx"]) {
      if (found) break;
      try {
        found = await readPrivateResume(resolve(dir, resumeId + e));
        ext = e;
        break;
      } catch {}
    }
    if (!found) {
      if (!resume.text.trim())
        throw new RequestError("Arquivo não encontrado.");
      return reply
        .type("application/pdf")
        .header("Cache-Control", "private, no-store")
        .header("X-Resume-Reconstructed", "true")
        .header(
          "Content-Disposition",
          'attachment; filename="copia-texto-curriculo.pdf"',
        )
        .send(await createResumeTextPdf(resume.text));
    }
    return reply
      .header("Cache-Control", "private, no-store")
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
        ...publicWorkspace((await readWorkspace(id))!),
        intelligence: await getIntelligence(u.id),
        billing: await billingSummary(u.id),
      });
  });
  app.delete("/api/account", async (req, reply) => {
    const { user: u, session } = await sessionIdentity(req);
    const { password, confirmEmail } = z
      .object({
        password: z.string().min(1).max(128).optional(),
        confirmEmail: z.email().optional(),
      })
      .parse(req.body);
    if (u.password) {
      if (!(await verifyPassword(password || "", u.password)))
        throw new RequestError("Senha incorreta.");
    } else if (
      !u.googleSub ||
      !session.googleAuthenticatedAt ||
      Date.now() - session.googleAuthenticatedAt.getTime() >= 5 * 60000 ||
      confirmEmail?.toLowerCase() !== u.email
    ) {
      throw new RequestError(
        "Confirme sua identidade com Google e informe o e-mail da conta para excluir.",
      );
    }
    for (const row of await store.select("workspaces", {
      where: eq("userId", u.id),
      columns: ["id"],
    }))
      await configureSchedule(row.id, false, "08:00");
    await deletePortalConnections(u.id);
    if (antigravityAvailable(u.id)) await disconnectAntigravity(u.id);
    await disconnectLinkedinIdentity(u.id);
    await store.transaction(async (tx) => {
      // Lock in the same order as send claims and billing updates.
      await tx.select("workspaces", {
        where: eq("userId", u.id),
        columns: ["id"],
        orderBy: [asc("id")],
        lock: true,
      });
      await tx.select("users", {
        where: eq("id", u.id),
        columns: ["id"],
        lock: true,
      });
      await cancelAccountSubscription(u.id, tx);
      await tx.delete("users", eq("id", u.id));
    });
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
    serveStatic &&
    (await stat(dist)
      .then((s) => s.isDirectory())
      .catch(() => false))
  ) {
    const { default: staticFiles } = await import("@fastify/static");
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
