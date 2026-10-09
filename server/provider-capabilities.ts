import { candidatePortals, type PortalId } from "../shared/portals";

/** Browser access requires permission from the service, separately from user consent. */
export function browserAuthorized(portal: PortalId) {
  return (
    process.env.PORTAL_CONNECTIONS_ENABLED !== "false" &&
    (process.env.PORTAL_BROWSER_AUTHORIZED || "")
      .split(",")
      .map((v) => v.trim())
      .includes(portal)
  );
}
export function publicDiscoveryAvailable(
  portal: PortalId,
  groundedSearch: boolean,
) {
  return (
    portal === "gupy" ||
    (portal === "linkedin" &&
      (process.env.PORTAL_DISCOVERY_AUTHORIZED || "")
        .split(",")
        .map((v) => v.trim())
        .includes(portal)) ||
    (portal !== "linkedin" && groundedSearch)
  );
}
export const providerLimits: Record<(typeof candidatePortals)[number], string> =
  {
    linkedin:
      "OAuth identifica sua conta. Busca e envio exigem acesso aprovado pelo LinkedIn; o login sozinho não libera essas funções.",
    gupy: "Busca em anúncios públicos. A API de candidatura rápida exige credenciais e permissão da empresa ou parceiro; nem toda vaga aceita esse fluxo.",
    glassdoor:
      "Busca por referências públicas quando configurada. Não há envio oficial de candidato configurado; vagas podem direcionar a outro site.",
    infojobs:
      "Busca por referências públicas quando configurada. A API documentada em infojobs.net não comprova cobertura do portal brasileiro.",
  };
