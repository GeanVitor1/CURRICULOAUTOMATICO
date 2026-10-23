import { missingDataAuthorized, missingDataEligible, missingDataFingerprint } from "./missing-data-consent";
import { randomUUID } from "node:crypto";
import { bindExecution, discoveredJob, traceJob } from "./automation-trace";
import { discoveryBudgetExpired, discoverySignal } from "./discovery-budget";
import { vercelQueueEnabled } from "./automation-runtime";
import { dispatchNextApplication } from "./submission-dispatch";
import { resolve, extname } from "node:path";
import { and, eq } from "./storage-types";
import { transitions } from "../shared/types";
import type { Application, Job, Status, Workspace, SubmissionDiagnostic } from "../shared/types";
import {
  analyze,
  dedupKey,
  nextExecution,
  extractSkills,
  matchesObjectiveFilters,
  matchesSelectedSites,
  correctJobEvidence,
} from "./engine";
import { supportsAutomatic, SourceError } from "./connectors";
import {
  independentExecutionAvailable,
  configuredAtsSources,
  destinationBrowserAllowed,
} from "./ats-registry";
import { resolveApplicationDestinations } from "./destination-resolver";
import { comparePublications, canonicalJobUrl } from "./job-identity";
import { sendAtsApplication } from "./ats-execution";
import { applicationAnswerProfile, automaticAnswersEnabled, prepareAutomaticAnswers } from "./automatic-answers";
import { getIntelligence } from "./intelligence";
import { sendEmailApplication } from "./email-application";
import { gmailConnection } from "./gmail-connection";
import { googleOAuthConfig } from "./auth-config";
import {
  connectedPortals,
  readyPortals,
  sendNativeApplication,
} from "./portal-sessions";
import { submissionRoute, dailySubmissionAttempts } from "./submission-routing";
import { singleSubmissionAuthorized, emailExplicitlyRejected } from "./submission-consent";
import { resumableJobSubmission } from "./submission-resume";
import { preparationFingerprint } from "./submission-preparation";
import { antigravityAvailable } from "./antigravity";
import {
  missingCandidateDetails,
  candidateDetailsReady,
} from "../shared/candidate-details";
import type { CandidatePortal } from "./portal-browser-policy";
import {
  discoverCachedSource,
  discoverCachedPublicQuery,
} from "./source-catalog";
import { expandSearchTitles, opportunityKey } from "./job-identity";
import { discoverPortal } from "./portal-discovery";
import {
  discoverOfficialCareers,
  officialCareersSource,
  officialDiscoveryAvailable,
  corporateEmailSource,
  discoverCorporateEmailCareers,
} from "./official-discovery";
import {
  store,
  dataDir,
  mutateWorkspace,
  readWorkspace,
  readResumeArchive,
} from "./db";
import { localApplicationDraft } from "./application-draft";
import {employerFeedSource,employerFeedAnchors,discoverEmployerUpdates} from './employer-feed-discovery';
import {configuredCompanyBoards,discoverCompanyBoard} from './company-board';
import {ablerSource,discoverAblerJobs} from './abler-discovery';
import {configuredQuickinBoards,discoverQuickinBoard} from './quickin-board';
import {screenDiscovery,learnOfficialBoards,learnedDiscoverySources,rankDiscoverySources,sourceDue} from './discovery-quality';
import { reserveApplication, workspaceDailyLimit, releasePausedReservations } from "./billing";
import { readPrivateResume, restoreResumeFile } from "./resume-storage";
import {
  RequestError,
  DailyLimitError,
  StaleDiscoveryClaimError,
} from "./errors";
const now = () => new Date().toISOString();
export function refreshMatches(w: Workspace) {
  w.jobs.forEach((j) => {
    Object.assign(j, correctJobEvidence(j));
    j.match = analyze(j, w.profile, w.filters);
    traceJob(j,"compatibility",j.match.blockers.length ? "mandatory_requirement_blocked" : j.match.confidence === "insufficient" ? "insufficient_evidence" : !matchesObjectiveFilters(j,w.profile,w.filters) ? "preferences_not_met" : j.match.score < w.routine.minScore ? "below_minimum_score" : "compatible");
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
  acceptMissingData = false,
): Application {
  const job = w.jobs.find((j) => j.id === jobId);
  if (!job || job.discarded || job.availability === "closed")
    throw new RequestError("Vaga indisponível.");
  if (w.submissionExclusions?.includes(opportunityKey(job)))
    throw new RequestError("Esta vaga já teve envio registrado antes da limpeza do histórico.");
  const existing = w.applications.find((a) => a.jobId === jobId);
  if (existing) {
    if (!acceptMissingData || !existing.missingDataConsent || !emailExplicitlyRejected(existing) ||
        !missingDataEligible(w, job) || (resumeId && resumeId !== existing.resumeId) ||
        !w.resumes.some(r => r.id === existing.resumeId && r.approved) ||
        existing.singleSubmission?.destinationUrl !== `mailto:${job.emailDestination!.email}`)
      throw new RequestError("Já existe uma candidatura para esta vaga. Só uma recusa explícita permite renovar a mesma revisão.");
    existing.missingDataConsent = { fingerprint: missingDataFingerprint(job), resumeId: existing.resumeId!, confirmedAt: now(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    existing.updatedAt = now();
    existing.history.push({at: now(), actor: "Usuário", message: "Renovou por 30 minutos a exceção de dados ausentes para o mesmo currículo e destinatário, após recusa explícita. O envio ainda exige autorização individual."});
    return existing;
  }
  job.match = analyze(job, w.profile, w.filters);
  if (acceptMissingData && !missingDataEligible(w, job)) throw new RequestError("A exceção exige destino verificado e ausência de requisitos, sem outros impedimentos.");
  if (job.match.blockers.length && !acceptMissingData)
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
    !acceptMissingData && resume.targetsConfirmed &&
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
  if (acceptMissingData) {
    a.missingDataConsent = { fingerprint: missingDataFingerprint(job), resumeId: resume.id, confirmedAt: now(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    a.history.push({ at: now(), actor: "Usuário", message: "Autorizada somente esta candidatura por e-mail, com contratação, publicação e requisitos não informados. Exceção válida por 30 minutos; rotina geral preservada." });
  }
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
      (job.url &&
        old.url &&
        canonicalJobUrl(old.url) === canonicalJobUrl(job.url)) ||
      old.origins.some((o) =>
        job.origins.some((n) => o.source === n.source && o.id === n.id),
      ) ||
      ((!old.url || !job.url) && dedupKey(old) === dedupKey(job)) ||
      (!!job.url && !!old.url && comparePublications(old, job).verified),
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
        destinations: _destinations,
        resolution: _resolution,
        automation: _automation,
        ...updated
      } = j;
      if (duplicate.url === j.url) Object.assign(duplicate, updated);
      if (j.automation) discoveredJob(duplicate, j.automation.runId!, j.automation.origin);
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
    tx: Parameters<Parameters<typeof store.transaction>[0]>[0],
  ) => {
    if (!leaseToken || !queuedRunId) return;
    // Lock the task in the same transaction as its workspace changes. Recovery
    // cannot replace the owner between this check and publication.
    const [claim] = await tx.select("discoveryTasks", {
      where: and(
        eq("id", queuedRunId),
        eq("workspaceId", id),
        eq("status", "running"),
        eq("leaseToken", leaseToken),
      ),
      columns: ["id"],
      lock: true,
    });
    if (!claim) throw new StaleDiscoveryClaimError();
  };
  const [owner] = await store.select("workspaces", {
    where: eq("id", id),
    columns: ["userId"],
  });
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
      sources.push(...learnedDiscoverySources(w).filter(source=>!sources.some(s=>s.type===source.type&&s.board===source.board)));
      if(w.filters.titles.length&&process.env.ABLER_EMAIL_DISCOVERY_ENABLED==='true')sources.unshift({...ablerSource});
      sources.unshift(...configuredCompanyBoards());
      sources.unshift(...configuredQuickinBoards());
      if (w.filters.titles.length && employerFeedAnchors(w).length)
        sources.unshift({...employerFeedSource});
      if (w.filters.titles.length && officialDiscoveryAvailable(owner?.userId))
        sources.unshift({ ...corporateEmailSource }, { ...officialCareersSource });
      for (const source of configuredAtsSources())
        if (
          !sources.some(
            (s) => s.type === source.type && s.board === source.board,
          )
        )
          sources.push(source);
      // Public board APIs are cheaper and more reliable than indexed portal queries.
      const priority = (source: (typeof sources)[number]) =>
        source.id===officialCareersSource.id ? -6 : source.id===corporateEmailSource.id ? -5 : source.id===ablerSource.id ? -4 : source.id.startsWith('company-board:') || source.id.startsWith('quickin-board:')
          ? -3
          : source.id === employerFeedSource.id
          ? -2
          : source.id === corporateEmailSource.id
          ? -1
          : source.id === officialCareersSource.id
          ? 0
          : source.type === "portal"
            ? 2
            : 0;
      rankDiscoverySources(w,sources);
      sources.sort((a, b) => priority(a) - priority(b));
      // Learned and configured boards may refer to the same official catalog.
      const seenSources=new Set<string>();
      const configuredSourceCount=sources.length;
      sources.splice(0,sources.length,...sources.filter(s=>{const key=`${s.type}:${s.board}`;if(seenSources.has(key)||!sourceDue(w,s))return false;seenSources.add(key);return true;}));
      const continuation = queuedRunId && w.runs.find(run => run.id === queuedRunId)?.continuation;
      if (continuation)
        sources.splice(0, sources.length, ...sources.filter(source => w.routine.discoveryCheckpoints?.[source.id]?.pending));
      if (!sources.length && !configuredSourceCount)
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
  let examinedTotal=0;
  const productivity:import('../shared/types').DiscoveryProductivity[]=[];
  const learned:Job[]=[];
  const searchSuggestions: string[] = [];
  const health: {
    id: string;
    status: string;
    lastCheckedAt: string;
    lastError: string | null;
  }[] = [];
  const checkpoints: NonNullable<Workspace["routine"]["discoveryCheckpoints"]> = {};
  const successfulBoards: { type: string; board: string; ids: Set<string> }[] =
    [];
  for (const source of sources) {
    try {
      if (discoveryBudgetExpired())
        throw new SourceError(
          "O tempo desta busca terminou. Os resultados já encontrados foram preservados; tente consultar esta fonte novamente.",
        );
      const result =
        source.id===ablerSource.id
          ? await discoverAblerJobs(searchWorkspace)
          : source.id.startsWith('quickin-board:')
          ? await discoverQuickinBoard(source,searchWorkspace)
          : source.id.startsWith('company-board:')
          ? await discoverCompanyBoard(source,undefined,searchWorkspace.routine.discoveryCheckpoints?.[source.id]?.pending ? searchWorkspace.routine.discoveryCheckpoints[source.id].cursor : undefined)
          : source.id===employerFeedSource.id
          ? await discoverCachedPublicQuery(source,{version:1,anchors:employerFeedAnchors(searchWorkspace),ageDays:searchWorkspace.filters.ageDays},()=>discoverEmployerUpdates(searchWorkspace))
          : [officialCareersSource.id, corporateEmailSource.id].includes(source.id)
          ? await discoverCachedPublicQuery(
              source,
              {
                discoveryVersion: 5,
                skills: searchWorkspace.profile.skills,
                years: searchWorkspace.profile.years,
                knownBoards: [...configuredAtsSources(),...configuredQuickinBoards(),...learnedDiscoverySources(searchWorkspace)].map(s=>`${s.type}:${s.board}`),
                provider: antigravityAvailable(owner?.userId)
                  ? `antigravity:${owner!.userId}`
                  : "gemini-api",
                ageDays: searchWorkspace.filters.ageDays,
                titles: searchWorkspace.filters.titles,
                locations: searchWorkspace.filters.locations,
                modalities: searchWorkspace.filters.modalities,
              },
              () => source.id === corporateEmailSource.id
                ? discoverCorporateEmailCareers(searchWorkspace, owner?.userId)
                : discoverOfficialCareers(searchWorkspace, owner?.userId),
            )
          : source.type === "portal"
            ? source.board === "gupy"
              ? await discoverCachedPublicQuery(
                  source,
                  {
                    titles: searchWorkspace.filters.titles,
                    locations: searchWorkspace.filters.locations,
                    remoteAnywhere: searchWorkspace.filters.remoteAnywhere,
                    modalities: searchWorkspace.filters.modalities,
                    location: searchWorkspace.profile.location,
                    headline: searchWorkspace.profile.headline,
                  },
                  () =>
                    discoverPortal(
                      source,
                      {
                        ...searchWorkspace,
                        filters: {
                          ...searchWorkspace.filters,
                          titles: expandSearchTitles(
                            searchWorkspace.filters.titles,
                          ),
                        },
                      },
                      owner?.userId,
                    ),
                )
              : await discoverPortal(
                  source,
                  {
                    ...searchWorkspace,
                    filters: {
                      ...searchWorkspace.filters,
                      titles: expandSearchTitles(
                        searchWorkspace.filters.titles,
                      ),
                    },
                  },
                  owner?.userId,
                )
            : await discoverCachedSource(source);
      if (
        "searchSuggestionsHtml" in result &&
        typeof result.searchSuggestionsHtml === "string"
      )
        searchSuggestions.push(result.searchSuggestionsHtml);
      const screened=screenDiscovery(searchWorkspace,source,result.jobs,result.checkedAt,
        'examined' in result&&typeof result.examined==='number'?result.examined:result.jobs.length);
      examinedTotal+=screened.productivity.examined;
      productivity.push(screened.productivity);
      all.push(...screened.jobs);
      if(source.id===officialCareersSource.id)learned.push(...screened.jobs);
      if ("checkpoint" in result && result.checkpoint && typeof result.checkpoint === "object" &&
          "cursor" in result.checkpoint && typeof result.checkpoint.cursor === "string" &&
          "pending" in result.checkpoint && typeof result.checkpoint.pending === "boolean")
        checkpoints[source.id] = {cursor:result.checkpoint.cursor,pending:result.checkpoint.pending};
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
      console.error(JSON.stringify({event:"discovery_source_failed",runId,sourceId:source.id,type:error instanceof Error ? error.name : "UnknownError"}));
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
  const nativeSites = owner
    ? await readyPortals(owner.userId, searchWorkspace.resumes[0]?.id || "")
    : [];
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
    const run = w.runs.find((r) => r.id === runId)!;
    if (!run || run.status !== "running")
      throw new RequestError(
        "Execução substituída; resultados não foram publicados.",
      );
    for (const job of all) discoveredJob(job, runId, run.origin || "legacy_unclassified");
    const count = mergeJobs(w, all);
    for (const update of health) {
      const source = w.sources.find((s) => s.id === update.id);
      if (source) Object.assign(source, update);
    }
    run.status =
      errors.length > 0 && errors.length === sources.length
        ? "failed"
        : errors.length
          ? "partial"
          : "completed";
    run.discovered = count;
    run.errors = errors;
    run.searchSuggestions = searchSuggestions;
    run.sourceProductivity=productivity;
    w.routine.discoveryProductivity={...w.routine.discoveryProductivity,...Object.fromEntries(productivity.map(p=>[p.sourceId,p]))};
    learnOfficialBoards(w,learned,now());
    w.routine.discoveryCheckpoints = {...w.routine.discoveryCheckpoints,...checkpoints};
    run.message =
      run.status === "failed"
        ? "Nenhum site pôde ser consultado. Veja os erros e tente novamente."
        : `${count} novas oportunidades, sem duplicações. ${examinedTotal} registros publicados consultados; ${all.length} preservados após filtros antecipados.`;
    w.routine.lastRun = now();
    w.routine.nextRun = w.routine.enabled
      ? nextExecution(w.routine.time)
      : null;
    if (w.routine.enabled && w.routine.mode !== "discovery") {
      const dailyLimit = await workspaceDailyLimit(
        tx,
        id,
        w.routine.dailyLimit,
      );
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      });
      const preparedToday = w.applications.filter(
        (a) =>
          new Date(a.createdAt).toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          }) === today,
      );
      const automatic = w.routine.mode === "automatic";
      if (!automatic) {
        for (const application of w.applications) {
          if (
            application.mode !== "assisted" ||
            application.status !== "Aguardando aprovação"
          )
            continue;
          application.status = "Requer ação manual";
          application.updatedAt = now();
          application.history.push({
            at: now(),
            actor: "Sistema",
            message: "Candidatura pronta para revisão e envio no site oficial.",
          });
        }
      }
      const used = automatic
        ? dailySubmissionAttempts(w) +
          preparedToday.filter(
            (a) =>
              a.status === "Aguardando aprovação" &&
              w.jobs.some(
                (job) =>
                  job.id === a.jobId && submissionRoute(w, job, nativeSites),
              ),
          ).length
        : preparedToday.length;
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
      const deliverable = automatic
        ? eligible.filter((job) => submissionRoute(w, job, nativeSites))
        : eligible;
      for (const j of deliverable.slice(0, Math.max(0, dailyLimit - used))) {
        try {
          const a = prepare(w, j.id);
          bindExecution(a, j);
          traceJob(j, "preparation", "automatic_queued");
          a.status = automatic ? "Aguardando aprovação" : "Requer ação manual";
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
  const [workspaceOwner] = await store.select("workspaces", {
    where: eq("id", id),
    columns: ["userId"],
  });
  const nativeSites = workspaceOwner
    ? await connectedPortals(workspaceOwner.userId)
    : [];
  const pending = await store.submissionState(id);
  const applicationResumeId =
    pending?.next?.id === appId
      ? pending.next.resumeId || ""
      : (await readWorkspace(id))?.applications.find((a) => a.id === appId)
          ?.resumeId || "";
  const profileSites = workspaceOwner
    ? await readyPortals(workspaceOwner.userId, applicationResumeId)
    : [];
  if (
    !supportsAutomatic() &&
    !nativeSites.length &&
    !independentExecutionAvailable() && !googleOAuthConfig()
  )
    throw new RequestError(
      "Nenhuma integração de envio está disponível. Configure uma integração ou conecte uma sessão de navegador habilitada para o site da vaga.",
    );
  // Preparation runs before reserving quota or recording any submission attempt.
  // No candidate field or resume is transmitted to the employer in this phase.
  const preparation = await readWorkspace(id);
  const emailConnection = workspaceOwner ? await gmailConnection(workspaceOwner.userId) : null;
  const routingOptions = {emailAvailable:!!emailConnection?.connected && emailConnection.email?.toLowerCase() === preparation?.profile.email.toLowerCase()};
  const preparingApplication = preparation?.applications.find(a => a.id === appId);
  const preparingJob = preparation?.jobs.find(j => j.id === preparingApplication?.jobId);
  if (preparation && preparingApplication?.status === "Aguardando aprovação" && preparingJob &&
      (singleSubmissionAuthorized(preparingApplication) || (preparation.routine.enabled && preparation.routine.mode === "automatic"))) {
    let preparingRoute = submissionRoute(preparation, preparingJob, nativeSites, routingOptions);
    if (!preparingRoute) {
      const expired=preparingJob.destinations?.find(d=>d.state==="verified" && destinationBrowserAllowed(d) && (!Number.isFinite(Date.parse(d.expiresAt)) || Date.parse(d.expiresAt)<=Date.now()));
      if (expired) {
        const refreshed=await resolveApplicationDestinations({...preparingJob,url:expired.url,applicationUrls:[]},{maxPages:2,timeoutMs:12000});
        const fresh=refreshed.destinations?.find(d=>d.url===expired.url && d.state==="verified" && Date.parse(d.expiresAt)>Date.now());
        if (!fresh) throw new RequestError("O formulário desta vaga não pôde ser revalidado. As demais candidaturas podem continuar.");
        await mutateWorkspace(id,w=>{
          const current=w.jobs.find(j=>j.id===preparingJob.id && j.url===preparingJob.url);
          if (current) current.destinations=current.destinations?.map(d=>d.url===fresh.url?fresh:d);
        });
        preparingJob.destinations=preparingJob.destinations?.map(d=>d.url===fresh.url?fresh:d);
        preparingRoute=submissionRoute(preparation,preparingJob,nativeSites,routingOptions);
      }
    }
    if (!preparingRoute) throw new RequestError("A vaga não pertence a uma fonte com envio autorizado.");
    const verifiedRoute = preparingRoute;
    if (verifiedRoute.method === "ats_browser") {
      let inspection = await sendAtsApplication({
        inspectOnly: true,
        applicationId: appId,
        profile: applicationAnswerProfile(preparation.profile,preparingApplication,verifiedRoute.destination.url),
        job: {title: preparingJob.title, company: preparingJob.company, url: verifiedRoute.destination.url},
        resume: {name: ""},
        destination: verifiedRoute.destination,
      });
      const answeringResume = preparation.resumes.find(r => r.id === preparingApplication.resumeId && r.approved);
      if (inspection.missingQuestions?.length && automaticAnswersEnabled(preparation.profile) && answeringResume) {
        const config = workspaceOwner && await getIntelligence(workspaceOwner.userId);
        const answers = await prepareAutomaticAnswers({profile:preparation.profile,resume:answeringResume,job:preparingJob,destinationUrl:verifiedRoute.destination.url,
          questions:inspection.missingQuestions,options:inspection.questionOptions,model:config && config.provider === "gemini" && config.enabled && config.consent ? config.model : undefined});
        const prepared = await mutateWorkspace(id,w=>{
          const current=w.applications.find(a=>a.id===appId);
          if (!current || current.status!=="Aguardando aprovação" || !automaticAnswersEnabled(w.profile) || current.resumeId!==answeringResume.id) throw new RequestError("A autorização da candidatura mudou.");
          current.automaticAnswers=[...(current.automaticAnswers||[]).filter(a=>!answers.some(next=>next.question===a.question)),...answers];
          current.answerPolicyAttemptedAt=w.profile.answerPolicy!.confirmedAt;
          const job = w.jobs.find(job=>job.id===current.jobId);
          if(job)traceJob(job,"answers",answers.length ? "evidenced_answers_prepared" : "no_valid_answers");
          current.history.push({at:now(),actor:"IA",message:`Preparou ${answers.length} respostas automaticamente. Respostas e bases disponíveis no histórico da candidatura.`});
          return {profile:applicationAnswerProfile(w.profile,current,verifiedRoute.destination.url)};
        });
        inspection = await sendAtsApplication({inspectOnly:true,applicationId:appId,profile:prepared.profile,
          job:{title:preparingJob.title,company:preparingJob.company,url:verifiedRoute.destination.url},resume:{name:""},destination:verifiedRoute.destination});
      }
      if (!inspection.preflightReady) {
        const paused = await mutateWorkspace(id, w => {
          const current = w.applications.find(a => a.id === appId);
          if (!current || current.status !== "Aguardando aprovação") return preparingApplication;
          current.status = "Requer ação manual";
          current.destinationId = verifiedRoute.destination.id;
          current.destinationUrl = verifiedRoute.destination.url;
          current.missingQuestions = inspection.missingQuestions;
          current.questionOptions = inspection.questionOptions;
          current.updatedAt = now();
          current.automaticBlockedFingerprint=preparationFingerprint(w,current);
          if(automaticAnswersEnabled(w.profile)) current.answerPolicyAttemptedAt=w.profile.answerPolicy!.confirmedAt;
          current.history.push({at: now(), actor: "Sistema", message: `Preparação antes do envio: ${inspection.message}`});
          const job = w.jobs.find(j => j.id === current.jobId);
          if (job) traceJob(job, "preparation", /verificação humana|captcha/i.test(inspection.message) ? "human_verification_required" : inspection.missingQuestions?.length ? "required_answers_missing" : "preflight_blocked");
          return current;
        });
        return paused;
      }
      await mutateWorkspace(id,w=>{
        const current=w.applications.find(a=>a.id===appId);
        if (current?.status==="Aguardando aprovação") { current.missingQuestions=[]; current.questionOptions=inspection.questionOptions; }
      });
    }
  }
  const { delivery, ...payload } = await mutateWorkspace(id, async (w, tx) => {
    if (w.demo)
      throw new RequestError("Não é possível enviar dados na demonstração.");
    const a = w.applications.find((a) => a.id === appId);
    if (!a || a.status !== "Aguardando aprovação")
      throw new RequestError("Candidatura não elegível para envio.");
    const single = singleSubmissionAuthorized(a);
    const retryingEmail = single && emailExplicitlyRejected(a);
    if (a.singleSubmission && !single)
      throw new RequestError(
        "A autorização deste envio expirou ou o currículo mudou. Revise e autorize novamente.",
      );
    if (!single && (!w.routine.enabled || w.routine.mode !== "automatic"))
      throw new RequestError("Modo automático não está ativo.");
    const attempts = dailySubmissionAttempts(w);
    const priorJob = w.jobs.find((j) => j.id === a.jobId);
    const resuming = !!priorJob && resumableJobSubmission(a, priorJob);
    if (
      !resuming &&
      !retryingEmail &&
      attempts >= (await workspaceDailyLimit(tx, id, w.routine.dailyLimit))
    )
      throw new DailyLimitError();
    const missingDetails = missingCandidateDetails(w.profile);
    if (missingDetails.length)
      throw new RequestError(
        `Complete seus dados para candidatura: ${missingDetails.join(", ")}.`,
      );
    if (!w.profile.confirmed)
      throw new RequestError(
        "Confirme seu perfil antes de enviar candidaturas.",
      );
    const job = w.jobs.find((j) => j.id === a.jobId);
    if (!job || job.discarded || job.availability === "closed")
      throw new RequestError("Vaga indisponível para envio.");
    if (!matchesSelectedSites(job, w))
      throw new RequestError(
        "A vaga está fora dos sites escolhidos na entrevista.",
      );
    const route = submissionRoute(w, job, nativeSites, routingOptions);
    if (!route)
      throw new RequestError(
        "A vaga não pertence a uma fonte com envio autorizado.",
      );
    const destinationUrl =
      route.method === "email" ? `mailto:${route.emailDestination.email}` : route.method === "ats_browser" ? route.destination.url : job.url;
    if (route.method === "email") {
      const connection = workspaceOwner && await gmailConnection(workspaceOwner.userId);
      if (!connection?.connected || connection.email?.toLowerCase() !== w.profile.email.toLowerCase())
        throw new RequestError("Conecte o Gmail do seu e-mail de candidatura nas preferências antes de enviar.");
    }
    if (
      single &&
      (a.singleSubmission!.destinationUrl !== destinationUrl ||
        a.singleSubmission!.method !== route.method)
    )
      throw new RequestError(
        "O destino de envio mudou. Revise e autorize esta candidatura novamente.",
      );
    if (route.method === "browser" && !job.resolution)
      throw new RequestError(
        "Esta oportunidade ainda precisa passar pela busca de destinos alternativos antes do envio no portal.",
      );
    const source = route.source;
    if (
      resuming &&
      (a.missingQuestions?.length || !(
        (route.method === "browser" && source.board === "gupy" && !a.resumeState?.kind) ||
        (route.method === "ats_browser" && a.resumeState?.kind === "ats" && a.resumeState.targetUrl === route.destination.url)
      ))
    )
      throw new RequestError(
        "Revise o destino e responda às perguntas pendentes antes de retomar.",
      );
    if (route.method === "ats_browser") {
      const duplicates = w.applications.some(
        (other) =>
          other.id !== a.id &&
          other.destinationUrl &&
          canonicalJobUrl(other.destinationUrl) ===
            canonicalJobUrl(route.destination.url) &&
          (other.submittedAt ||
            ["Enviando", "Resultado desconhecido", "Enviada"].includes(
              other.status,
            )),
      );
      if (duplicates)
        throw new RequestError(
          "Já existe uma tentativa de candidatura neste destino. Confira o histórico antes de repetir.",
        );
      a.destinationId = route.destination.id;
      a.destinationUrl = route.destination.url;
    }
    job.match = analyze(job, w.profile, w.filters);
    if (
      !(single && route.method === "email" && missingDataAuthorized(w, job, a)) && (
      !matchesObjectiveFilters(job, w.profile, w.filters) ||
      job.match.blockers.length ||
      job.match.score < w.routine.minScore ||
      job.match.confidence === "insufficient")
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
    {
      const extension = extname(resume.name).toLowerCase();
      if (
        !workspaceOwner ||
        ![".pdf", ".docx"].includes(extension) ||
        !/^[a-zA-Z0-9-]+$/.test(resume.id)
      )
        throw new RequestError(
          "O currículo original precisa estar disponível para o envio.",
        );
      const archive = await readResumeArchive(id, resume.id, tx);
      const bytes = archive
        ? restoreResumeFile(archive)
        : await readPrivateResume(
            resolve(
              dataDir,
              "resumes",
              workspaceOwner.userId,
              resume.id + extension,
            ),
          ).catch(() => {
            if (
              route.method === "browser" &&
              source.type === "portal" &&
              ["gupy", "infojobs"].includes(source.board) &&
              profileSites.includes(source.board as CandidatePortal)
            )
              return null;
            throw new RequestError(
              "O arquivo original do currículo não está disponível. Envie o currículo novamente.",
            );
          });
      if (bytes && bytes.length > 5 * 1024 * 1024)
        throw new RequestError("O currículo excedeu o limite para envio.");
      if (bytes)
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
    await releasePausedReservations(tx,workspaceOwner!.userId,w);
    if (resuming || (retryingEmail && route.method === "email")) {
      const [reservation] = await tx.select("applicationUsage", {
        where: and(
          eq("applicationId", a.id),
          eq("userId", workspaceOwner!.userId),
        ),
        limit: 1,
      });
      if (!reservation) await reserveApplication(tx,workspaceOwner!.userId,a.id,w.routine.dailyLimit,attempts);
    } else
      await reserveApplication(
        tx,
        workspaceOwner!.userId,
        a.id,
        w.routine.dailyLimit,
        attempts,
      );
    a.status = "Enviando";
    delete a.resumeState;
    a.destinationUrl = destinationUrl;
    a.updatedAt = now();
    a.mode = single ? "single" : "automatic";
    const execution = bindExecution(a, job, single);
    const attemptId = randomUUID();
    (a.attempts ||= []).push({
      ...execution, id: attemptId,
      executor: route.method === "ats_browser" && route.destination.evidence.includes("Formulário WP Jobs Board verificado.") ? "company_wp_jobs" : route.method,
      startedAt: now(), outcome: "started",
    });
    traceJob(job, "submission", "executor_started");
    a.history.push({
      at: now(),
      actor: "Sistema",
      message: "Envio iniciado. Aguardando recibo verificável da integração.",
    });
    return {
      delivery: route.method,
      attemptId,
      destination: route.method === "ats_browser" ? route.destination : null,
      emailJob: route.method === "email" ? structuredClone(job) : null,
      applicationId: a.id,
      presentation: a.draft,
      workspaceId: id,
      resumeId: resume.id,
      portal: source.type === "portal" ? source.board : null,
      job: {
        title: job.title,
        url: route.method === "ats_browser" ? route.destination.url : job.url,
        company: job.company,
      },
      profile: applicationAnswerProfile(w.profile,a,destinationUrl),
      resume: { name: resume.name, text: resume.text, file },
    };
  });
  let receipt: string | null = null,
    definitiveFailure = false,
    actionRequired = false,
    detail = "";
  let missingQuestions: string[] | undefined;
  let answersUsed: {question:string;value:string}[] | undefined;
  let questionOptions: Record<string,string[]> | undefined;
  let confirmedDestinationUrl = payload.job.url;
  let resumablePause = false;
  let definitePreSubmitPause = false;
  let diagnostic: SubmissionDiagnostic | undefined;
  const heartbeat = setInterval(() => {
    void mutateWorkspace(id, (w) => {
      const current = w.applications.find((a) => a.id === appId);
      if (current?.status === "Enviando") current.updatedAt = now();
    }).catch(() => {});
  }, 30000);
  heartbeat.unref();
  // Only a definitive pause before submission permits another form pass.
  // Answers are generated on the server; model credentials never reach the browser.
  const completeQuestions = async <T extends {status: string; retryable?: boolean; missingQuestions?: string[]; questionOptions?: Record<string,string[]>}>(execute: (profile: typeof payload.profile) => Promise<T>): Promise<T> => {
    let profile = payload.profile;
    const attempted = new Set<string>();
    for (let pass = 0; ; pass++) {
      const result = await execute(profile);
      if (pass >= 4 || result.status !== "action_required" || !result.retryable ||
          !result.missingQuestions?.length || !automaticAnswersEnabled(profile)) return result;
      const signature = JSON.stringify([result.missingQuestions, result.questionOptions]);
      if (attempted.has(signature)) return result;
      attempted.add(signature);
      const config = workspaceOwner && await getIntelligence(workspaceOwner.userId);
      const resume = preparation?.resumes.find(item => item.id === payload.resumeId && item.approved);
      const job = preparation?.jobs.find(item => item.id === preparingApplication?.jobId);
      if (!resume || !job) return result;
      const answers = await prepareAutomaticAnswers({profile, resume, job, destinationUrl:payload.job.url,
        questions:result.missingQuestions, options:result.questionOptions,
        model:config && config.provider === "gemini" && config.enabled && config.consent ? config.model : undefined});
      if (!answers.length) return result;
      profile = await mutateWorkspace(id, w => {
        const current = w.applications.find(item => item.id === appId);
        if (!current || current.status !== "Enviando" || !automaticAnswersEnabled(w.profile) || current.resumeId !== resume.id)
          throw new RequestError("A autorização da candidatura mudou.");
        current.automaticAnswers = [...(current.automaticAnswers || []).filter(item => !answers.some(answer => answer.question === item.question)), ...answers];
        current.history.push({at:now(),actor:"IA",message:`Respondeu automaticamente ${answers.length} perguntas do formulário com currículo, preferências e regra para dados ausentes.`});
        return applicationAnswerProfile(w.profile,current,payload.job.url);
      });
    }
  };
  try {
    if (delivery === "email" && payload.emailJob && workspaceOwner) {
      const result = await sendEmailApplication(workspaceOwner.userId, {
        applicationId:payload.applicationId, profile:payload.profile, presentation:payload.presentation,
        job:payload.emailJob, resume:payload.resume,
      }, fetcher);
      receipt=result.status === "sent" ? result.receipt || null : null;
      actionRequired=result.status === "action_required";
      definitePreSubmitPause=actionRequired && result.retryable === true;
      detail=result.message;
      confirmedDestinationUrl=`mailto:${payload.emailJob.emailDestination!.email}`;
    } else if (delivery === "ats_browser" && payload.destination) {
      const result = await completeQuestions(profile => sendAtsApplication({
        ...payload, profile, destination: payload.destination!,
      }));
      receipt = result.status === "sent" ? result.receipt || null : null;
      actionRequired = result.status === "action_required";
      resumablePause = actionRequired && result.retryable === true;
      missingQuestions = result.missingQuestions;
      answersUsed = result.answersUsed;
      questionOptions = result.questionOptions;
      diagnostic = result.diagnostic;
      detail = result.message;
      if(diagnostic)console.info(JSON.stringify({event:'submission_executor_result',applicationId:appId,attemptId:payload.attemptId,status:result.status,diagnostic}));
    } else if (delivery === "browser" && payload.portal && workspaceOwner) {
      const result = await completeQuestions(profile => sendNativeApplication(
        workspaceOwner.userId,
        payload.portal as CandidatePortal,
        payload.resumeId,
        {...payload,profile},
      ));
      receipt = result.status === "sent" ? result.receipt || null : null;
      actionRequired = result.status === "action_required";
      detail = result.message;
      missingQuestions = result.missingQuestions;
      questionOptions = result.questionOptions;
      if (receipt && result.continuationUrl)
        confirmedDestinationUrl = result.continuationUrl;
      resumablePause =
        actionRequired &&
        result.retryable === true &&
        payload.portal === "gupy";
    } else {
      const response = await fetcher(process.env.APPLICATION_WEBHOOK_URL!, {
        method: "POST",
        redirect: "error",
        signal: discoverySignal(25000),
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
  } catch (error) {
    console.error(JSON.stringify({event:"submission_executor_error",applicationId:appId,attemptId:payload.attemptId,type:error instanceof Error ? error.name : "UnknownError"}));
    /* Unknown result intentionally prevents retries. */
  } finally {
    clearInterval(heartbeat);
  }
  return mutateWorkspace(id, async (w,tx) => {
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
    const attempt = a.attempts?.find(item => item.id === payload.attemptId);
    if (attempt) {
      attempt.finishedAt = now();
      attempt.outcome = receipt ? "confirmed" : actionRequired && (resumablePause || definitePreSubmitPause) ? "pre_submit_blocked" : definitiveFailure ? "not_submitted" : "unknown";
      if (receipt) attempt.receipt = receipt;
      if (diagnostic) attempt.diagnostic = diagnostic;
    }
    const tracedJob = w.jobs.find(job => job.id === a.jobId);
    if (tracedJob) traceJob(tracedJob,"confirmation",receipt ? "receipt_verified" : actionRequired ? "executor_blocked" : definitiveFailure ? "not_submitted" : "result_unknown");
    a.missingQuestions = missingQuestions;
    if (questionOptions) a.questionOptions=questionOptions;
    if (answersUsed?.length) a.answersUsed=answersUsed.map(answer=>({...answer,at:now(),source:a.automaticAnswers?.find(item=>item.question===answer.question && item.value===answer.value)?.source || "profile"}));
    if (resumablePause)
      a.resumeState = {
        resumeId: payload.resumeId,
        destinationUrl: payload.job.url,
        recordedAt: now(),
        ...(delivery === "ats_browser" ? {kind: "ats" as const, targetUrl: payload.destination!.url} : {}),
      };
    else delete a.resumeState;
    if(actionRequired) a.automaticBlockedFingerprint=preparationFingerprint(w,a);
    if((resumablePause || definitePreSubmitPause) && workspaceOwner) await releasePausedReservations(tx,workspaceOwner.userId,w);
    if (receipt)
      a.verification = {
        method:
          delivery === "email" ? "email_provider_acceptance" : delivery === "webhook" ? "authorized_receipt" : "portal_confirmation",
        at: now(),
        destinationUrl: confirmedDestinationUrl,
      };
    a.updatedAt = now();
    if (receipt) a.submittedAt = now();
    a.history.push({
      at: now(),
      actor: "Sistema",
      message: receipt
        ? delivery === "email" ? `${detail} Recibo: ${receipt}` : `Envio confirmado pela integração. Recibo: ${receipt}`
        : detail
          ? detail
          : definitiveFailure
            ? "A integração confirmou que não enviou a candidatura."
            : "Não foi possível confirmar o resultado. Verifique antes de repetir.",
    });
    if (receipt) notify(w, "Candidatura enviada", w.jobs.find(j => j.id === a.jobId)!.title);
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
    const attempt = application.attempts?.at(-1);
    if (attempt?.outcome === "started") {
      attempt.outcome = "unknown";
      attempt.finishedAt = new Date(timestamp).toISOString();
    }
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
export async function recoverInterruptedSends(workspaceId?: string) {
  const rows = workspaceId
    ? (await store.submissionState(workspaceId))?.sending
      ? [{ id: workspaceId }]
      : []
    : await store.sendingWorkspaceIds();
  for (const row of rows)
    await mutateWorkspace(row.id, (w) => recoverInterruptedApplications(w));
}
export async function executeRoutine(id: string) {
  const initial = await readWorkspace(id);
  if (!initial || !initial.routine.enabled || initial.demo) return;
  // Scheduled and interactive searches share the same persisted claim and heartbeat.
  const { enqueueDiscovery } = await import("./discovery-queue");
  await enqueueDiscovery(id, "scheduled_automation");
}
export async function processAutomaticApplications(id: string) {
  if (vercelQueueEnabled()) {
    await dispatchNextApplication(id);
    return;
  }
  const visited = new Set<string>();
  const budget = Math.max(1,Math.min(200,Number(process.env.AUTOMATIC_SUBMISSION_BATCH_SIZE)||20));
  for (let processed=0;processed<budget;processed++) {
      const state = await readWorkspace(id);
      const a = state?.applications.find(a=>a.status === "Aguardando aprovação" && !visited.has(a.id));
      if (!a) break;
      visited.add(a.id);
      const current = await readWorkspace(id);
      if (!current || discoveryBudgetExpired()) break;
      const item = current.applications.find((item) => item.id === a.id);
      if (item?.singleSubmission && !singleSubmissionAuthorized(item)) {
        await mutateWorkspace(id, (w) => {
          const expired = w.applications.find((entry) => entry.id === item.id);
          if (
            !expired ||
            expired.status !== "Aguardando aprovação" ||
            singleSubmissionAuthorized(expired)
          )
            return;
          expired.status = "Requer ação manual";
          expired.updatedAt = now();
          expired.history.push({
            at: expired.updatedAt,
            actor: "Sistema",
            message:
              "A autorização individual expirou ou o currículo mudou. Revise antes de autorizar novamente.",
          });
        });
        continue;
      }
      if (
        !item ||
        !(item.singleSubmission
          ? singleSubmissionAuthorized(item)
          : current.routine.enabled && current.routine.mode === "automatic")
      )
        continue;
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
          application.automaticBlockedFingerprint = preparationFingerprint(w,application);
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
      const [owner] = await store.select("workspaces",{where:eq("id",id),columns:["userId"]});
      if (owner) {
        const native = await readyPortals(owner.userId,state?.interview?.answers.resumeId || state?.resumes[0]?.id || "");
        await mutateWorkspace(id,async(w,tx)=>{
          await releasePausedReservations(tx,owner.userId,w);
          const limit = await workspaceDailyLimit(tx,id,w.routine.dailyLimit);
          const {billingDay} = await import("./billing");
          const used=await tx.count("applicationUsage",and(eq("userId",owner.userId),eq("day",billingDay())));
          queuePreparedApplications(w,native,limit-Math.max(0,used-dailySubmissionAttempts(w)));
        });
      }
  }
}
export function queuePreparedApplications(w: Workspace, nativeSites: string[], dailyLimit = w.routine.dailyLimit, jobId?: string) {
  if (w.demo || !w.routine.enabled || w.routine.mode !== "automatic" || !w.profile.confirmed || !candidateDetailsReady(w.profile)) return 0;
  refreshMatches(w);
  const pending = w.applications.filter(a => a.status === "Aguardando aprova\u00e7\u00e3o").length;
  let remaining = Math.max(0, Math.min(dailyLimit, w.routine.dailyLimit) - dailySubmissionAttempts(w) - pending);
  let count = 0;
  const jobs = w.jobs.filter(job => !jobId || job.id === jobId).sort((a,b) => b.match.score - a.match.score);
  for (const job of jobs) {
    const prior=w.applications.find(a=>a.jobId===job.id);
    if(prior && prior.automaticBlockedFingerprint===preparationFingerprint(w,prior)) continue;
    const readyResume=!!prior && prior.status==="Requer ação manual" && prior.resumeState?.kind==="ats" && !prior.missingQuestions?.length && resumableJobSubmission(prior,job);
    if (!remaining && !readyResume) continue;
    if (job.discarded || job.availability === "closed" || !matchesSelectedSites(job,w) ||
        !matchesObjectiveFilters(job,w.profile,w.filters) || job.match.blockers.length ||
        job.match.confidence === "insufficient" || job.match.score < w.routine.minScore ||
        !submissionRoute(w,job,nativeSites)) continue;
    let application = w.applications.find(a => a.jobId === job.id);
    const automaticRetry = !!application && automaticAnswersEnabled(w.profile) && application.answerPolicyAttemptedAt!==w.profile.answerPolicy!.confirmedAt;
    if (application?.missingQuestions?.length && !automaticRetry) continue;
    if (application && (application.status !== "Requer a\u00e7\u00e3o manual" || application.singleSubmission || application.receipt || application.submittedAt || (application.history.some(event => event.message.startsWith("Envio iniciado.")) && !((jobId || automaticRetry || readyResume) && application.resumeState?.kind === "ats" && (!application.missingQuestions?.length || automaticRetry) && resumableJobSubmission(application,job))))) continue;
    const resumeId = application?.resumeId || w.interview?.answers.resumeId;
    const resume = resumeId ? w.resumes.find(r => r.id === resumeId && r.approved) : w.resumes.find(r => r.approved);
    if (!resume || (w.interview && (!w.interview.completed || w.interview.answers.resumeId !== resume.id))) continue;
    if (!application) {
      try { application = prepare(w,job.id,resume.id); application.history[0].actor = "Sistema"; }
      catch { continue; }
    }
    application.status = "Aguardando aprova\u00e7\u00e3o";
    bindExecution(application, job);
    traceJob(job, "preparation", "automatic_queued");
    application.updatedAt = now();
    application.history.push({at:now(),actor:"Sistema",message:"Vaga compat\u00edvel com destino verificado adicionada \u00e0 fila autom\u00e1tica, sem aguardar outra busca."});
    if (!readyResume) remaining--;
    count++;
  }
  return count;
}
