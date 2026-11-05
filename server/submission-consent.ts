import type { Application, Workspace } from "../shared/types";

/** Called only after explicit portal automation consent and verified login. */
export function activateAuthorizedPortal(w: Workspace, portal: string, resumeId: string, readySites: string[]) {
  if (!readySites.includes(portal) || !w.profile.confirmed || !w.interview?.completed ||
      w.interview.answers.resumeId !== resumeId || !w.interview.answers.sites.some(site => site === portal) ||
      !w.resumes.some(r => r.id === resumeId && r.approved)) return false;
  w.routine.enabled = true;
  w.routine.mode = 'automatic';
  w.routine.destinationPolicy = 'any';
  return true;
}

/** Only an explicit provider refusal can be reviewed for another individual attempt. */
export function emailExplicitlyRejected(application: Application) {
  if (!["Requer ação manual", "Aguardando aprovação"].includes(application.status) || application.receipt || application.submittedAt || application.singleSubmission?.method !== "email") return false;
  const started = application.history.map(event => event.actor === "Sistema" && event.message.startsWith("Envio iniciado.")).lastIndexOf(true);
  return application.history.slice(started + 1).some(event => event.actor === "Sistema" && (
    event.message === "O Gmail recusou o envio. Confira a conexão, a ativação da API e os limites da conta." ||
    /^O Gmail recusou o envio\. \[GMAIL_REJECTED HTTP (400|401|403|404|413|429)(?:: [A-Za-z0-9_. /-]+)?\]/.test(event.message)
  ));
}

export function singleSubmissionAuthorized(
  application: Application,
  timestamp = Date.now(),
) {
  const consent = application.singleSubmission;
  return (
    !!consent &&
    consent.resumeId === application.resumeId &&
    Number.isFinite(Date.parse(consent.confirmedAt)) &&
    Date.parse(consent.confirmedAt) <= timestamp &&
    Date.parse(consent.expiresAt) > timestamp
  );
}
