import type { Application } from "../shared/types";

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
