import { missingDataAuthorized } from "./missing-data-consent";
import type {
  Application,
  SubmissionReadiness,
  Workspace,
} from "../shared/types";
import {
  analyze,
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "./engine";
import { submissionRoute, submissionRouteBlocker, dailySubmissionAttempts } from "./submission-routing";
import { canonicalJobUrl } from "./job-identity";
import { missingCandidateDetails } from "../shared/candidate-details";
import { resumableSubmission } from "./submission-resume";
import { emailExplicitlyRejected } from "./submission-consent";

/** Preview and enqueue share the same rules; delivery rechecks under the workspace lock. */
export function submissionReadiness(
  w: Workspace,
  application: Application,
  nativeSites: string[],
  dailyLimit: number,
): SubmissionReadiness {
  const blockers: string[] = [];
  const missing = missingCandidateDetails(w.profile);
  if (missing.length)
    blockers.push(
      `Complete seus dados para candidatura: ${missing.join(", ")}.`,
    );
  const job = w.jobs.find((item) => item.id === application.jobId);
  const resume = w.resumes.find((item) => item.id === application.resumeId);
  const route = job ? submissionRoute(w, job, nativeSites) : null;
  const resumePending =
    !!job &&
    ((route?.method === "browser" && route.source.board === "gupy" && !application.resumeState?.kind) ||
     (route?.method === "ats_browser" && application.resumeState?.kind === "ats" && application.resumeState.targetUrl === route.destination.url)) &&
    resumableSubmission(application, job.url);
  if (resumePending && application.missingQuestions?.length)
    blockers.push(
      "Responda às perguntas pendentes antes de retomar a candidatura.",
    );
  if (w.demo) blockers.push("Envios exigem uma conta real.");
  if (
    !["Requer ação manual", "Aguardando aprovação"].includes(
      application.status,
    ) ||
    application.submittedAt ||
    application.receipt ||
    (!resumePending && !emailExplicitlyRejected(application) &&
      application.history.some((event) =>
        event.message.startsWith("Envio iniciado."),
      ))
  )
    blockers.push(
      "Esta candidatura já teve uma tentativa ou não está disponível para envio. Confira o histórico e o portal.",
    );
  if (!w.profile.confirmed)
    blockers.push("Confirme seus dados nas preferências.");
  if (!resume?.approved)
    blockers.push("Selecione e aprove o currículo desta candidatura.");
  if (
    w.interview &&
    (!w.interview.completed || w.interview.answers.resumeId !== resume?.id)
  )
    blockers.push("Conclua as preferências com o currículo desta candidatura.");
  if (!job || job.discarded || job.availability === "closed")
    blockers.push("A vaga está indisponível.");
  if (job) {
    const match = analyze(job, w.profile, w.filters);
    if (
      !(route?.method === "email" && missingDataAuthorized(w, job, application)) && (
      !matchesSelectedSites(job, w) ||
      !matchesObjectiveFilters(job, w.profile, w.filters) ||
      match.blockers.length ||
      match.score < w.routine.minScore ||
      match.confidence === "insufficient")
    )
      blockers.push(
        "A vaga não atende aos cargos, filtros ou requisitos confirmados.",
      );
    if (
      w.applications.some(
        (other) =>
          other.id !== application.id &&
          other.jobId === job.id &&
          (other.submittedAt ||
            other.receipt ||
            ["Enviando", "Resultado desconhecido", "Enviada"].includes(
              other.status,
            )),
      )
    )
      blockers.push(
        "Já existe uma tentativa para esta vaga. Confira o histórico.",
      );
  }
  if (!route)
    blockers.push(
      job ? submissionRouteBlocker(job) : "A vaga desta candidatura não foi localizada.",
    );
  if (
    route?.method === "ats_browser" &&
    w.applications.some(
      (other) =>
        other.id !== application.id &&
        other.destinationUrl &&
        canonicalJobUrl(other.destinationUrl) ===
          canonicalJobUrl(route.destination.url) &&
        (other.submittedAt ||
          ["Enviando", "Resultado desconhecido", "Enviada"].includes(
            other.status,
          )),
    )
  )
    blockers.push(
      "Já existe uma tentativa neste destino. Confira o histórico antes de repetir.",
    );
  if (
    resume?.originalFileAvailable === false &&
    !(
      route?.method === "browser" &&
      ["gupy", "infojobs"].includes(route.source.board) &&
      nativeSites.includes(route.source.board)
    )
  )
    blockers.push(
      "Reenvie o arquivo original do currículo para permitir o envio.",
    );
  if (
    !resumePending &&
    !emailExplicitlyRejected(application) &&
    dailySubmissionAttempts(w) >= Math.min(w.routine.dailyLimit, dailyLimit)
  )
    blockers.push("O limite diário de envios foi atingido.");
  return {
    ready: blockers.length === 0,
    blockers,
    resumeId: resume?.id || null,
    resumeName: resume?.name || null,
    destinationUrl: route
      ? route.method === "email"
        ? `mailto:${route.emailDestination.email}`
        : route.method === "ats_browser"
          ? route.destination.url
          : job!.url
      : null,
    method: route?.method || null,
  };
}
