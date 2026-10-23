import type { Job, Workspace } from "../shared/types";
import { isJobUrl, isPortalId } from "../shared/portals";
import { automaticPortals, supportsAutomatic } from "./connectors";
import { emailDestinationReady } from "./email-destination";
import { googleOAuthConfig } from "./auth-config";
import {
  destinationBrowserAllowed,
  independentExecutionAvailable,
  destinationExecutionAvailable,
} from "./ats-registry";

export function submissionRoute(w: Workspace, job: Job, nativeSites: string[], options: {emailAvailable?:boolean} = {}) {
  if (options.emailAvailable !== false && emailDestinationReady(job) && googleOAuthConfig())
    return {
      source: {
        id: `email:${job.id}`,
        type: "authorized" as const,
        company: job.company,
        board: "email",
        enabled: true,
        discovery: false,
        application: true,
        status: "E-mail da empresa verificado",
      },
      method: "email" as const,
      emailDestination: job.emailDestination!,
    };
  const portalMatches = (
    source: Workspace["sources"][number],
    sites: string[],
  ) =>
    source.enabled &&
    source.type === "portal" &&
    sites.includes(source.board) &&
    isPortalId(source.board) &&
    isJobUrl(source.board, job.url) &&
    (!w.interview?.completed ||
      w.interview.answers.sites.some((site) => site === source.board));
  // A configured API takes precedence over a browser session that may need human verification.
  const gateway =
    supportsAutomatic() &&
    w.sources.find(
      (source) =>
        (source.enabled &&
          source.type === "authorized" &&
          source.application &&
          source.company === job.company) ||
        (w.routine.destinationPolicy !== "official" &&
          portalMatches(source, automaticPortals())),
    );
  if (gateway) return { source: gateway, method: "webhook" as const };
  const destination = job.destinations?.find(
    (item) =>
      item.state === "verified" &&
      item.formFound &&
      Date.parse(item.expiresAt) > Date.now() &&
      destinationBrowserAllowed(item) && destinationExecutionAvailable(item),
  );
  if (destination && destinationExecutionAvailable(destination))
    return {
      source: {
        id: destination.id,
        type: "authorized" as const,
        company: job.company,
        board: destination.platform,
        enabled: true,
        discovery: false,
        application: true,
        status: "Destino independente verificado",
      },
      method: "ats_browser" as const,
      destination,
    };
  if (w.routine.destinationPolicy === "official") return null;
  const native =
    job.resolution &&
    w.sources.find((source) => portalMatches(source, nativeSites));
  return native ? { source: native, method: "browser" as const } : null;
}
export function submissionRouteBlocker(job: Job) {
  const destinations = job.destinations || [];
  if (destinations.some(d => d.state === "blocked")) return "O destino bloqueou a automação ou exige verificação humana.";
  if (destinations.some(d => d.state === "login_required")) return "O destino exige autenticação e não possui executor independente liberado.";
  if (destinations.some(d => d.state === "verified" && Date.parse(d.expiresAt) <= Date.now())) return "A verificação do destino venceu e precisa ser renovada.";
  if (destinations.some(d => d.state === "verified" && d.formFound && destinationBrowserAllowed(d) && !destinationExecutionAvailable(d))) return "O formulário está autorizado, mas o navegador de execução não está disponível.";
  if (destinations.some(d => !destinationBrowserAllowed(d))) return "A plataforma ou o domínio do formulário não possui adaptador autorizado nesta instalação.";
  if (destinations.length && !destinations.some(d => d.formFound)) return "A publicação foi localizada, mas nenhum formulário suportado foi identificado.";
  return job.resolution?.message || "A publicação ainda não possui um destino verificado com canal de candidatura disponível.";
}
export { dailySubmissionAttempts } from "./submission-attempts";
