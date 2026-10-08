import { randomUUID } from "node:crypto";
import { transitions } from "../shared/types";
import type { Application, Job, Status, Workspace } from "../shared/types";
import {
  analyze,
  dedupKey,
  nextExecution,
  extractSkills,
  matchesObjectiveFilters,
} from "./engine";
import { supportsAutomatic, SourceError } from "./connectors";
import { discoverCachedSource } from "./source-catalog";
import { discoverPortal } from "./portal-discovery";
import { mutateWorkspace, readWorkspace } from "./db";
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
    throw new Error("Vaga indisponível.");
  if (w.applications.some((a) => a.jobId === jobId))
    throw new Error("Já existe uma candidatura para esta vaga.");
  job.match = analyze(job, w.profile, w.filters);
  if (job.match.blockers.length) throw new Error(job.match.blockers.join(" "));
  const resume = resumeId
    ? w.resumes.find((r) => r.approved && r.id === resumeId)
    : w.resumes.find((r) => r.approved && r.targetsConfirmed) ||
      w.resumes.find((r) => r.approved);
  if (!resume)
    throw new Error(
      "Envie e aprove um currículo antes de preparar a candidatura.",
    );
  if (
    resume.targetsConfirmed &&
    !matchesObjectiveFilters(job, w.profile, {
      ...w.filters,
      titles: resume.targetTitles || w.filters.titles,
    })
  )
    throw new Error(
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
    throw new Error(`Transição de ${a.status} para ${status} não permitida.`);
  if (status === "Enviada" && !confirmation)
    throw new Error("Confirme que concluiu o envio no processo oficial.");
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
export function mergeJobs(w: Workspace, jobs: Job[]) {
  const existing = new Map(w.jobs.map((j) => [dedupKey(j), j]));
  let count = 0;
  for (const j of jobs) {
    j.skills = [
      ...new Set([
        ...j.skills,
        ...extractSkills(j.description + " " + j.title, w.filters.skills),
      ]),
    ];
    const duplicate =
      existing.get(dedupKey(j)) ??
      w.jobs.find((old) => old.url === j.url) ??
      w.jobs.find((old) =>
        old.origins.some((o) =>
          j.origins.some((n) => o.source === n.source && o.id === n.id),
        ),
      );
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
      if (w.jobs.length >= 2000) break;
      w.jobs.unshift(j);
      existing.set(dedupKey(j), j);
      count++;
    }
  }
  refreshMatches(w);
  return count;
}
export async function discover(id: string, queuedRunId?: string) {
  // The persisted run marker also prevents concurrent discovery across workers.
  const { sources, runId, searchWorkspace } = await mutateWorkspace(id, (w) => {
    if (w.demo)
      throw new Error("A demonstração não consulta fontes nem envia dados.");
    const running = w.runs.find((r) => r.status === "running");
    if (running && Date.now() - Date.parse(running.at) < 300000)
      throw new Error("Uma busca já está em andamento.");
    if (running) {
      running.status = "interrupted";
      running.errors.push(
        "Execução anterior interrompida; recuperação após 5 minutos.",
      );
    }
    const sources = w.sources.filter((s) => s.enabled && s.discovery);
    if (!sources.length)
      throw new Error(
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
  });
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
        status: `${result.jobs.length} anúncios encontrados · ${source.type === "portal" ? "busca pública com Gemini" : result.cached ? "cache verificado" : "consulta oficial"}`,
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
  return mutateWorkspace(id, (w) => {
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
      throw new Error("Execução substituída; resultados não foram publicados.");
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
        ? "Nenhuma fonte pôde ser consultada. Veja os erros e tente novamente."
        : `${count} novas oportunidades, sem duplicações. ${all.length} registros publicados consultados.`;
    w.routine.lastRun = now();
    w.routine.nextRun = w.routine.enabled
      ? nextExecution(w.routine.time)
      : null;
    if (w.routine.mode !== "discovery") {
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
  if (!supportsAutomatic())
    throw new Error("Nenhuma integração de envio autorizada configurada.");
  const payload = await mutateWorkspace(id, (w) => {
    if (w.demo) throw new Error("Não é possível enviar dados na demonstração.");
    if (!w.routine.enabled || w.routine.mode !== "automatic")
      throw new Error("Modo automático não está ativo.");
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
    if (attempts >= w.routine.dailyLimit)
      throw new Error("Limite diário atingido.");
    const a = w.applications.find((a) => a.id === appId);
    if (!a || a.status !== "Aguardando aprovação")
      throw new Error("Candidatura não elegível para envio.");
    const job = w.jobs.find((j) => j.id === a.jobId);
    if (!job || job.discarded || job.availability === "closed")
      throw new Error("Vaga indisponível para envio.");
    const source = w.sources.find(
      (s) =>
        s.type === "authorized" &&
        s.enabled &&
        s.application &&
        s.company === job.company,
    );
    if (!source)
      throw new Error("A vaga não pertence a uma fonte com envio autorizado.");
    job.match = analyze(job, w.profile, w.filters);
    if (
      job.match.blockers.length ||
      job.match.score < w.routine.minScore ||
      job.match.confidence === "insufficient"
    )
      throw new Error("A candidatura não passou pelos critérios.");
    const resume = w.resumes.find((r) => r.id === a.resumeId && r.approved);
    if (!resume) throw new Error("Currículo aprovado não encontrado.");
    // Claim once before external I/O. A crash/timeout leaves an unknown outcome; never auto-retry.
    a.status = "Resultado desconhecido";
    a.updatedAt = now();
    a.mode = "automatic";
    a.history.push({
      at: now(),
      actor: "Sistema",
      message: "Envio iniciado. Aguardando recibo verificável da integração.",
    });
    return {
      applicationId: a.id,
      job: { title: job.title, url: job.url, company: job.company },
      profile: w.profile,
      resume: { name: resume.name, text: resume.text },
    };
  });
  let receipt: string | null = null,
    definitiveFailure = false;
  try {
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
        typeof result.receipt === "string" &&
        result.receipt.length
      )
        receipt = result.receipt.slice(0, 1000);
    }
    // Only contractually explicit refusal is definitive. Other HTTP failures may happen after submission.
    else if (response.status === 422) {
      const result = (await response.json()) as any;
      definitiveFailure = result.status === "not_submitted";
    }
  } catch {
    /* Unknown result intentionally prevents retries. */
  }
  return mutateWorkspace(id, (w) => {
    const a = w.applications.find((a) => a.id === appId)!;
    if (a.status !== "Resultado desconhecido") return a;
    a.status = receipt
      ? "Enviada"
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
export async function executeRoutine(id: string) {
  const initial = await readWorkspace(id);
  if (!initial || !initial.routine.enabled || initial.demo) return;
  const run = await discover(id);
  if (run.status === "failed") return;
  const state = await readWorkspace(id);
  if (state?.routine.mode === "automatic") {
    for (const a of state.applications
      .filter((a) => a.status === "Aguardando aprovação")
      .slice(0, state.routine.dailyLimit)) {
      const current = await readWorkspace(id);
      if (!current?.routine.enabled) break;
      try {
        await automaticSend(id, a.id);
      } catch {
        /* Unsupported sources remain for assisted completion. */
      }
    }
  }
}
