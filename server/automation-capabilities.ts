import { candidatePortals } from "../shared/portals";
import { automaticPortals } from "./connectors";
import { connectionStatuses } from "./portal-sessions";
import { browserAuthorized } from "./provider-capabilities";
import { cloudPortalEnabled } from "./portal-cloud-policy";

export async function applicationCapabilities(
  userId: string,
  resumeId: string,
) {
  const connections = await connectionStatuses(userId);
  const gateways = automaticPortals();
  return candidatePortals.map((site) => {
    const connection = connections.find((item) => item.id === site)!;
    const gateway = gateways.includes(site);
    const needsResumeApproval =
      ["gupy", "infojobs"].includes(site) &&
      connection.connected &&
      (!resumeId || connection.profileResumeId !== resumeId);
    const blocker = gateway
      ? null
      : !browserAuthorized(site) && !cloudPortalEnabled(userId, site)
        ? "integration_missing"
        : !connection.browserAvailable
          ? "browser_unavailable"
          : connection.sessionState === "expired"
            ? "session_expired"
            : !connection.connected
              ? "account_disconnected"
              : needsResumeApproval
                ? "resume_unapproved"
                : null;
    const message =
      blocker === "integration_missing"
        ? "Este site ainda não possui uma integração de envio nesta instalação. Conclua a candidatura no anúncio oficial."
        : blocker === "browser_unavailable"
          ? "O navegador de candidaturas está indisponível no servidor. O envio por esta conexão não pode iniciar."
          : blocker === "session_expired"
            ? "Sua sessão neste site expirou. Conecte a conta novamente."
            : blocker === "account_disconnected"
              ? "Conecte sua conta neste site para permitir o envio."
              : blocker === "resume_unapproved"
                ? "Confirme que o currículo deste site corresponde ao arquivo aprovado no EmpreGatos."
                : gateway
                  ? "Envio disponível pela integração configurada."
                  : "Envio disponível pela sua sessão conectada.";
    return {
      ...connection,
      automatic: !blocker,
      needsResumeApproval,
      applicationBlocker: blocker,
      applicationMessage: message,
    };
  });
}
