import type { Application } from "./types";

/** A prepared form or an optimistic status is never a confirmed delivery. */
export function confirmedApplication(application: Application) {
  return (
    !!application.receipt?.trim() &&
    !!application.submittedAt &&
    Number.isFinite(Date.parse(application.submittedAt))
  );
}

/** Not confirmed and still in progress or waiting on the user (never shown as sent). */
const finalUnconfirmed = new Set(["Rejeitada", "Contratada", "Descartada", "Arquivada"]);
export function attentionApplications(applications: Application[]) {
  return applications.filter((a) => !confirmedApplication(a) && a.status === "Requer ação manual");
}
export function inProgressApplications(applications: Application[]) {
  return applications.filter((a) => !confirmedApplication(a) && !finalUnconfirmed.has(a.status));
}
