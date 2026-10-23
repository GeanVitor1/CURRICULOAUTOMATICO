import type { Application, Workspace } from "../shared/types";
import { resumableSubmission } from "./submission-resume";
/** Only the executor's definitive pre-submit pause can release a reservation.
 * Unknown outcomes, receipts and a later attempt always keep their quota. */
export function pausedBeforeSubmission(a: Application) {
  const attempt=a.attempts?.at(-1);
  if (attempt?.outcome === "pre_submit_blocked" && attempt.finishedAt &&
      a.status === "Requer ação manual" && !a.receipt && !a.submittedAt &&
      a.history.filter(e=>e.message.startsWith("Envio iniciado.")).every(e=>Date.parse(e.at)<=Date.parse(attempt.finishedAt!))) return true;
  const state=a.resumeState;
  if(!state || !resumableSubmission(a,state.destinationUrl)) return false;
  return a.history.filter(e=>e.message.startsWith("Envio iniciado.")).every(e=>Date.parse(e.at)<=Date.parse(state.recordedAt));
}
export function dailySubmissionAttempts(
  w: Pick<Workspace, "applications">,
  timestamp = new Date(),
) {
  const day = (value: Date) =>
    value.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const today = day(timestamp);
  return w.applications.filter(
    (application) =>
      (!pausedBeforeSubmission(application) && application.history.some(
        (event) =>
          event.message.startsWith("Envio iniciado.") &&
          day(new Date(event.at)) === today,
      )) ||
      (application.mode === "automatic" &&
        application.submittedAt &&
        day(new Date(application.submittedAt)) === today),
  ).length;
}
