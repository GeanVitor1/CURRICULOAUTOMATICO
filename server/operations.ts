import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { discoveryTasks, workspaces } from "./schema";
import { transitions } from "../shared/types";
import type { Application, Job, Status, Workspace } from "../shared/types";
import {
  analyze,
  dedupKey,
  nextExecution,
  extractSkills,
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "./engine";
import { supportsAutomatic, automaticPortals, SourceError } from "./connectors";
import { connectedPortals, sendNativeApplication } from "./portal-sessions";
import type { CandidatePortal } from "./portal-browser-policy";
import { isPortalId, isJobUrl } from "../shared/portals";
import { discoverCachedSource } from "./source-catalog";
import { discoverPortal } from "./portal-discovery";
import { db, dataDir, mutateWorkspace, readWorkspace } from "./db";
import { localApplicationDraft } from "./application-draft";
import {
  RequestError,
  DailyLimitError,
  StaleDiscoveryClaimError,
} from "./errors";
const now = () => new Date().toISOString();
export function refreshMatches(w: Workspace) {
  w.jobs.forEach((j) => {
    j.match = analyze(j, w.profile, w.filters);
  });
}
export function notify(w: Workspace, title: string, message: string) {
  w.notices.unshift({
    id: randomUUID(),
    title,
    message,
    at: now(),
    read: false,
  });
  w.notices = w.notices.slice(0, 200);
}
export function prepare(
  w: Workspace,
  jobId: string,
  resumeId?: string,
): Application {
  const job = w.jobs.find((j) => j.id === jobId);
  if (!job || job.discarded || job.availability === "closed")
    throw new RequestError("Vaga indisponível.");
  if (w.applications.some((a) => a.jobId === jobId))
    throw new RequestError("Já existe uma candidatura para esta vaga.");
  job.match = analyze(job, w.profile, w.filters);
  if (job.match.blockers.length)
    throw new RequestError(job.match.blockers.join(" "));
  const resume = resumeId
    ? w.resumes.find((r) => r.approved && r.id === resumeId)
    : w.resumes.find((r) => r.approved && r.targetsConfirmed) ||
      w.resumes.find((r) => r.approved);
  if (!resume)
    throw new RequestError(
      "Envie e aprove um currículo antes de preparar a candidatura.",
    );
  if (
    resume.targetsConfirmed &&
    !matchesObjectiveFilters(job, w.profile, {
      ...w.filters,
      titles: resume.targetTitles || w.filters.titles,
    })
  )
    throw new RequestError(
      "Esta vaga está fora dos cargos e critérios que você confirmou. Revise a busca antes de preparar a candidatura.",
    );
  const a: Application = {
    id: randomUUID(),
    jobId,
    status: "Requer ação manual",
    createdAt: now(),
    updatedAt: now(),
    resumeId: resume.id,
    receipt: null,
    note: "",
    draft: localApplicationDraft(resume, job),
    mode: w.demo ? "demo" : "assisted",
    history: [
      {
        at: now(),
        actor: w.demo ? "Demonstração" : "Usuário",
        message: "Candidatura preparada. O envio ainda não foi confirmado.",
      },
    ],
  };
  w.applications.unshift(a);
  notify(
    w,
    "Candidatura preparada",
    `${job.company} · ${job.title}. Finalize no processo oficial e confirme o envio.`,
  );
  return a;
}
export function transition(
  a: Application,
  status: Status,
  confirmation: boolean,
) {
  if (status === a.status) return;
  if (!transitions[a.status].includes(status))
    throw new RequestError(
      `Transição de ${a.status} para ${status} não permitida.`,
    );
  if (status === "Enviada" && !confirmation)
    throw new RequestError(
      "Confirme que concluiu o envio no processo oficial.",
    );
  a.status = status;
  a.updatedAt = now();
  if (status === "Enviada") a.submittedAt = now();
  a.history.push({
    at: now(),
    actor: "Usuário",
    message:
      status === "Enviada"
        ? "Usuário confirmou o envio no processo oficial."
        : `Status alterado para ${status}.`,
  });
}
export function findExistingJob(w: Workspace, job: Job): Job | undefined {
  return w.jobs.find(
    (old) =>
      (job.url && old.url === job.url) ||
      old.origins.some((o) =>
        job.origins.some((n) => o.source === n.source && o.id === n.id),
      ) ||
      ((!old.url || !job.url) && dedupKey(old) === dedupKey(job)),
  );
}
export function mergeJobs(w: Workspace, jobs: Job[]) {
  const protectedIds = new Set(w.applications.map((a) => a.jobId));
  let skipped = 0;
  let count = 0;
  for (const j of jobs) {
    j.skills = [
      ...new Set([
        ...j.skills,
        ...extractSkills(j.description + " " + j.title, w.filters.skills),
      ]),
    ];
    const duplicate = findExistingJob(w, j);
    if (duplicate) {
      j.origins.forEach((o) => {
        if (!duplicate.origins.some((old) => old.url === o.url))
          duplicate.origins.push(o);
      });
      const {
        id: _id,
        saved: _saved,
        discarded: _discarded,
        origins: _origins,
        discoveredAt: _discoveredAt,
        application: _application,
        ...updated
      } = j;
      Object.assign(duplicate, updated);
    } else {
      if (w.jobs.length >= 2000) {
        // Free only inactive records without saved state or candidature history.
        const candidate = [...w.jobs]
          .reverse()
          .find(
            (old) =>
              !old.saved &&
              !protectedIds.has(old.id) &&
              (old.discarded || old.availability === "closed"),
          );
        const index = candidate ? w.jobs.indexOf(candidate) : -1;
        if (index < 0) {
          skipped++;
          continue;
        }
        w.jobs.splice(index, 1);
      }
      w.jobs.unshift(j);
      count++;
    }
  }
  if (skipped)
    notify(
      w,
      "Limite de vagas atingido",
      `${skipped} vagas não foram adicionadas. Descarte vagas antigas para liberar espaço; candidaturas e vagas salvas são preservadas.`,
    );
  refreshMatches(w);
  return count;
}
export async function discover(
  id: string,
  queuedRunId?: string,
  leaseToken?: string,
) {
  const checkClaim = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => {
    if (!leaseToken || !queuedRunId) return;
    // Lock the task in the same transaction as its workspace changes. Recovery
    // cannot replace the owner between this check and publication.
    const [claim] = await tx
      .select({ id: discoveryTasks.id })
      .from(discoveryTasks)
      .where(
        and(
          eq(discoveryTasks.id, queuedRunId),
          eq(discoveryTasks.workspaceId, id),
          eq(discoveryTasks.status, "running"),
          eq(discoveryTasks.leaseToken, leaseToken),
        ),
      )
      .for("update");
    if (!claim) throw new StaleDiscoveryClaimError();
  };
  // The persisted run marker also prevents concurrent discovery across workers.
  const { sources, runId, searchWorkspace } = await mutateWorkspace(
    id,
    async (w, tx) => {
      await checkClaim(tx);
      if (w.demo)
        throw new RequestError(
          "A demonstração não consulta fontes nem envia dados.",
        );
      const running = w.runs.find((r) => r.status === "running");
      if (running && Date.now() - Date.parse(running.at) < 300000)
        throw new RequestError("Uma busca já está em andamento.");
      if (running) {
        running.status = "interrupted";
        running.errors.push(
          "Execução anterior interrompida; recuperação após 5 minutos.",
        );
      }
      const sources = w.sources.filter((s) => s.enabled && s.discovery);
      if (!sources.length)
        throw new RequestError(
          "Configure pelo menos uma fonte de vagas em Configurações.",
        );
      const runId = queuedRunId || randomUUID();
      const queued = queuedRunId && w.runs.find((r) => r.id === queuedRunId);
      if (queued) {
        queued.status = "running";
        queued.at = now();
        queued.message = "Consultando fontes oficiais.";
      } else
        w.runs.unshift({
          id: runId,
          at: now(),
          status: "running",
          discovered: 0,
          processed: 0,
          errors: [],
          message: "Consultando fontes oficiais.",
        });
      w.runs = w.runs.slice(0, 100);
      return { sources, runId, searchWorkspace: structuredClone(w) };
    },
  );
  const all: Job[] = [],
    errors: string[] = [];
  const searchSuggestions: string[] = [];
  const health: {
    id: string;
    status: string;
    lastCheckedAt: string;
    lastError: string | null;
  }[] = [];
  const successfulBoards: { type: string; board: string; ids: Set<string> }[] =
    [];
  for (const source of sources) {
    try {
      const result =
        source.type === "portal"
          ? await discoverPortal(source, searchWorkspace)
          : await discoverCachedSource(source);
      if (
        "searchSuggestionsHtml" in result &&
        typeof result.searchSuggestionsHtml === "string"
      )
        searchSuggestions.push(result.searchSuggestionsHtml);
      all.push(...result.jobs);
      if (["greenhouse", "lever", "ashby"].includes(source.type))
        successfulBoards.push({
          type: source.type,
          board: source.board,
          ids: new Set(
            result.jobs.flatMap((j) => j.origins.map((origin) => origin.id)),
          ),
        });
      health.push({
        id: source.id,
        status: `${result.jobs.length} anúncios encontrados · ${"method" in result ? result.method : result.cached ? "cache verificado" : "consulta oficial"}`,
        lastCheckedAt: result.checkedAt,
        lastError: null,
      });
    } catch (error) {
      const message =
        error instanceof SourceError
          ? error.message
          : "Falha ao consultar a fonte.";
      errors.push(`${source.company}: ${message}`);
      health.push({
        id: source.id,
        status: "Serviço indisponível",
        lastCheckedAt: now(),
        lastError: message,
      });
    }
  }
  return mutateWorkspace(id, async (w, tx) => {
    await checkClaim(tx);
    // ATS returns published board snapshots; Jobicy's rolling feed never implies closure by absence.
    for (const job of w.jobs) {
      const checked = job.origins.filter((origin) =>
        successfulBoards.some(
          (board) =>
            origin.source === board.type &&
            origin.id.startsWith(`${board.board}:`),
        ),
      );
      if (
        checked.length === job.origins.length &&
        checked.length &&
        checked.every((origin) =>
          successfulBoards.some(
            (board) =>
              origin.source === board.type &&
              origin.id.startsWith(`${board.board}:`) &&
              !board.ids.has(origin.id),
          ),
        )
      )
        job.availability = "closed";
    }
    const count = mergeJobs(w, all);
    const run = w.runs.find((r) => r.id === runId)!;
    if (!run || run.status !== "running")
      throw new RequestError(
        "Execução substituída; resultados não foram publicados.",
      );
    for (const update of health) {
      const source = w.sources.find((s) => s.id === update.id);
      if (source) Object.assign(source, update);
    }
    run.status =
      errors.length === sources.length
        ? "failed"
        : errors.length
          ? "partial"
          : "completed";
    run.discovered = count;
    run.errors = errors;
    run.searchSuggestions = searchSuggestions;
    run.message =
      run.status === "failed"
        ? "Nenhum site pôde ser consultado. Veja os erros e tente novamente."
        : `${count} novas oportunidades, sem duplicações. ${all.length} registros publicados consultados.`;
    w.routine.lastRun = now();
    w.routine.nextRun = w.routine.enabled
      ? nextExecution(w.routine.time)
      : null;
    if (w.routine.enabled && w.routine.mode !== "discovery") {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      });
      const used = w.applications.filter(
        (a) =>
          new Date(a.createdAt).toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          }) === today,
      ).length;
      const eligible = w.jobs.filter(
        (j) =>
          !j.discarded &&
          matchesSelectedSites(j, w) &&
          matchesObjectiveFilters(j, w.profile, w.filters) &&
          j.match.confidence !== "insufficient" &&
          j.match.score >= w.routine.minScore &&
          !j.match.blockers.length &&
          !w.applications.some((a) => a.jobId === j.id),
      );
      for (const j of eligible.slice(
        0,
        Math.max(0, w.routine.dailyLimit - used),
      )) {
        try {
          const a = prepare(w, j.id);
          a.status = "Aguardando aprovação";
          a.history[a.history.length - 1].actor = "Sistema";
          run.processed++;
        } catch {
          /* Missing confirmed profile/resume: preserve discovery without claiming a submission. */
        }
      }
    }
    notify(
      w,
      "Busca finalizada",
      errors.length
        ? `${count} vagas encontradas. ${errors.length} fonte(s) requerem atenção.`
        : `${count} novas oportunidades disponíveis para análise.`,
    );
    return run;
  });
}
export async function automaticSend(
  id: string,
  appId: string,
  fetcher: typeof fetch = fetch,
) {
  const [workspaceOwner] = await db
    .select({ userId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, id));
  const nativeSites = workspaceOwner
    ? await connectedPortals(workspaceOwner.userId)
    : [];
  const availableSites = [...automaticPortals(), ...nativeSites];
  if (!supportsAutomatic() && !nativeSites.length)
    throw new RequestError(
      "Conecte sua conta no site da vaga antes de enviar candidaturas.",
    );
  const payload = await mutateWorkspace(id, async (w) => {
    if (w.demo)
      throw new RequestError("Não é possível enviar dados na demonstração.");
    if (!w.routine.enabled || w.routine.mode !== "automatic")
      throw new RequestError("Modo automático não está ativo.");
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    const attempts = w.applications.filter(
      (a) =>
        a.history.some(
          (e) =>
            e.message.startsWith("Envio iniciado.") &&
            new Date(e.at).toLocaleDateString("en-CA", {
              timeZone: "America/Sao_Paulo",
            }) === day,
        ) ||
        (a.submittedAt &&
          new Date(a.submittedAt).toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          }) === day),
    ).length;
    if (attempts >= w.routine.dailyLimit) throw new DailyLimitError();
    const a = w.applications.find((a) => a.id === appId);
    if (!a || a.status !== "Aguardando aprovação")
      throw new RequestError("Candidatura não elegível para envio.");
    const job = w.jobs.find((j) => j.id === a.jobId);
    if (!job || job.discarded || job.availability === "closed")
      throw new RequestError("Vaga indisponível para envio.");
    if (!matchesSelectedSites(job, w))
      throw new RequestError(
        "A vaga está fora dos sites escolhidos na entrevista.",
      );
    const source = w.sources.find(
      (s) =>
        s.enabled &&
        ((s.type === "authorized" &&
          s.application &&
          s.company === job.company) ||
          (s.type === "portal" &&
            availableSites.includes(s.board) &&
            isPortalId(s.board) &&
            isJobUrl(s.board, job.url) &&
            (!w.interview?.completed ||
              w.interview.answers.sites.includes(s.board)))),
    );
    if (!source)
      throw new RequestError(
        "A vaga não pertence a uma fonte com envio autorizado.",
      );
    job.match = analyze(job, w.profile, w.filters);
    if (
      !matchesObjectiveFilters(job, w.profile, w.filters) ||
      job.match.blockers.length ||
      job.match.score < w.routine.minScore ||
      job.match.confidence === "insufficient"
    )
      throw new RequestError("A candidatura não passou pelos critérios.");
    const resume = w.resumes.find((r) => r.id === a.resumeId && r.approved);
    if (!resume) throw new RequestError("Currículo aprovado não encontrado.");
    if (
      w.interview &&
      (!w.interview.completed || w.interview.answers.resumeId !== resume.id)
    )
      throw new RequestError(
        "Revise esta candidatura: o currículo mudou desde a preparação.",
      );
    let file: { name: string; mimeType: string; data: string } | undefined;
    if (source.type === "portal") {
      const extension = extname(resume.name).toLowerCase();
      if (
        !workspaceOwner ||
        ![".pdf", ".docx"].includes(extension) ||
        !/^[a-zA-Z0-9-]+$/.test(resume.id)
      )
        throw new RequestError(
          "O currículo original precisa estar disponível para o envio.",
        );
      const bytes = await readFile(
        resolve(
          dataDir,
          "resumes",
          workspaceOwner.userId,
          resume.id + extension,
        ),
      ).catch(() => {
        throw new RequestError(
          "O arquivo original do currículo não está disponível. Envie o currículo novamente.",
        );
      });
      if (bytes.length > 5 * 1024 * 1024)
        throw new RequestError("O currículo excedeu o limite para envio.");
      file = {
        name: resume.name,
        mimeType:
          extension === ".pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data: bytes.toString("base64"),
      };
    }
    // Claim once before external I/O. Interrupted claims are recovered as unknown, never retried.
    a.status = "Enviando";
    a.updatedAt = now();
    a.mode = "automatic";
    a.history.push({
      at: now(),
      actor: "Sistema",
      message: "Envio iniciado. Aguardando recibo verificável da integração.",
    });
    return {
      applicationId: a.id,
      workspaceId: id,
      resumeId: resume.id,
      portal: source.type === "portal" ? source.board : null,
      job: { title: job.title, url: job.url, company: job.company },
      profile: w.profile,
      resume: { name: resume.name, text: resume.text, file },
    };
  });
  let receipt: string | null = null,
    definitiveFailure = false,
    actionRequired = false,
    detail = "";
  try {
    if (
      payload.portal &&
      nativeSites.includes(payload.portal as CandidatePortal) &&
      workspaceOwner
    ) {
      const result = await sendNativeApplication(
        workspaceOwner.userId,
        payload.portal as CandidatePortal,
        payload.resumeId,
        payload,
      );
      receipt = result.status === "sent" ? result.receipt || null : null;
      actionRequired = result.status === "action_required";
      detail = result.message;
    } else {
      const response = await fetcher(process.env.APPLICATION_WEBHOOK_URL!, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.APPLICATION_WEBHOOK_TOKEN}`,
          "Idempotency-Key": appId,
        },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const result = (await response.json()) as any;
        if (
          result.status === "sent" &&
          (!result.applicationId || result.applicationId === appId) &&
          typeof result.receipt === "string" &&
          result.receipt.trim().length
        )
          receipt = result.receipt.trim().slice(0, 1000);
        if (result.status === "action_required") {
          actionRequired = true;
          detail =
            "A integração pediu informações adicionais. Revise a candidatura no site oficial; o envio não foi confirmado.";
        }
        definitiveFailure = result.status === "not_submitted";
      }
      // Only contractually explicit refusal is definitive. Other HTTP failures may happen after submission.
      else if (response.status === 422) {
        const result = (await response.json()) as any;
        definitiveFailure = result.status === "not_submitted";
      }
    }
  } catch {
    /* Unknown result intentionally prevents retries. */
  }
  return mutateWorkspace(id, (w) => {
    const a = w.applications.find((a) => a.id === appId)!;
    if (a.status !== "Enviando") return a;
    a.status = receipt
      ? "Enviada"
      : actionRequired
        ? "Requer ação manual"
        : definitiveFailure
          ? "Falha no envio"
          : "Resultado desconhecido";
    a.receipt = receipt;
    a.updatedAt = now();
    if (receipt) a.submittedAt = now();
    a.history.push({
      at: now(),
      actor: "Sistema",
      message: receipt
        ? `Envio confirmado pela integração. Recibo: ${receipt}`
        : detail
          ? detail
          : definitiveFailure
            ? "A integração confirmou que não enviou a candidatura."
            : "Não foi possível confirmar o resultado. Verifique antes de repetir.",
    });
    notify(
      w,
      receipt ? "Candidatura enviada" : "Candidatura requer verificação",
      w.jobs.find((j) => j.id === a.jobId)!.title,
    );
    return a;
  });
}
export function recoverInterruptedApplications(
  w: Workspace,
  timestamp = Date.now(),
) {
  let count = 0;
  for (const application of w.applications) {
    if (
      application.status !== "Enviando" ||
      timestamp - Date.parse(application.updatedAt) < 150000
    )
      continue;
    application.status = "Resultado desconhecido";
    application.updatedAt = new Date(timestamp).toISOString();
    application.history.push({
      at: application.updatedAt,
      actor: "Sistema",
      message:
        "O envio foi interrompido sem confirmação. Confira no portal antes de tentar novamente; esta candidatura não será reenviada automaticamente.",
    });
    count++;
  }
  if (count)
    notify(
      w,
      "Envio interrompido",
      `${count} candidatura(s) precisam de verificação no portal.`,
    );
  return count;
}
export async function recoverInterruptedSends() {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      sql`${workspaces.data}->'applications' @> '[{"status":"Enviando"}]'::jsonb`,
    );
  for (const row of rows)
    await mutateWorkspace(row.id, (w) => recoverInterruptedApplications(w));
}
export async function executeRoutine(id: string) {
  const initial = await readWorkspace(id);
  if (!initial || !initial.routine.enabled || initial.demo) return;
  // Scheduled and interactive searches share the same persisted claim and heartbeat.
  const { enqueueDiscovery } = await import("./discovery-queue");
  await enqueueDiscovery(id);
}
export async function processAutomaticApplications(id: string) {
  const state = await readWorkspace(id);
  if (state?.routine.mode === "automatic") {
    for (const a of state.applications
      .filter((a) => a.status === "Aguardando aprovação")
      .slice(0, state.routine.dailyLimit)) {
      const current = await readWorkspace(id);
      if (!current?.routine.enabled) break;
      try {
        await automaticSend(id, a.id);
      } catch (error) {
        if (error instanceof DailyLimitError) break;
        await mutateWorkspace(id, (w) => {
          const application = w.applications.find((item) => item.id === a.id);
          if (!application || application.status !== "Aguardando aprovação")
            return;
          application.status = "Requer ação manual";
          application.updatedAt = now();
          application.history.push({
            at: now(),
            actor: "Sistema",
            message:
              error instanceof Error
                ? error.message
                : "O envio não pôde iniciar. Confira esta candidatura.",
          });
        });
      }
    }
  }
}
