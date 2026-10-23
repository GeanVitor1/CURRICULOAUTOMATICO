import type { Application } from "./types";

/** A prepared form or an optimistic status is never a confirmed delivery. */
export function confirmedApplication(application: Application) {
  return (
    !!application.receipt?.trim() &&
    !!application.submittedAt &&
    Number.isFinite(Date.parse(application.submittedAt))
  );
}
