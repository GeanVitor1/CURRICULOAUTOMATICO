import { candidatePortals, officialPortalLoginOnly } from "../shared/portals";
import { automaticPortals } from "./connectors";
import { connectionStatuses } from "./portal-sessions";
import { browserAuthorized } from "./provider-capabilities";
import { cloudPortalEnabled,cloudPortalCanApply } from "./portal-cloud-policy";

export async function applicationCapabilities(
  userId: string,
  resumeId: string,
) {
  const connections = await connectionStatuses(userId);
  const gateways = automaticPortals();
  return candidatePortals.map((site) => {
    const connection = connections.find((item) => item.id === site)!;
    const gateway = gateways.includes(site);
    const remoteLogin = cloudPortalEnabled(userId, site);
    const localBrowser=site==='linkedin';
    const externalLoginOnly = officialPortalLoginOnly(site) && !remoteLogin && !localBrowser;
    const needsResumeApproval =
      (["gupy", "infojobs"].includes(site)||(remoteLogin&&cloudPortalCanApply(userId,site))) &&
      connection.connected &&
      (!resumeId || connection.profileResumeId !== resumeId);
    const blocker = gateway
      ? null
      : localBrowser
        ? 'integration_missing'
      : externalLoginOnly && !connection.connected
        ? "external_login_only"
        : !(remoteLogin?cloudPortalCanApply(userId,site):browserAuthorized(site))
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
      blocker === "external_login_only"
        ? "Faça login no site oficial. Esse login não compartilha a sessão com o EmpreGatos; o envio por este portal continua pendente."
        : blocker === "integration_missing"
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
      externalLoginOnly,
      remoteLogin,
      connectable: !externalLoginOnly && connection.connectable,
      automatic: !blocker,
      needsResumeApproval,
      applicationBlocker: blocker,
      applicationMessage: message,
    };
  });
}
