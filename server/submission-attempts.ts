import type { Workspace } from "../shared/types";
export function dailySubmissionAttempts(
  w: Pick<Workspace, "applications">,
  timestamp = new Date(),
) {
  const day = (value: Date) =>
    value.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const today = day(timestamp);
  return w.applications.filter(
    (application) =>
      application.history.some(
        (event) =>
          event.message.startsWith("Envio iniciado.") &&
          day(new Date(event.at)) === today,
      ) ||
      (application.mode === "automatic" &&
        application.submittedAt &&
        day(new Date(application.submittedAt)) === today),
  ).length;
}
