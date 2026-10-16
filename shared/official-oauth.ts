export const officialOAuthProviders = {
  linkedin: {
    name: "LinkedIn",
    region: "global",
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    documentation:
      "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2",
    description:
      "Conecta seu perfil LinkedIn. A permissão de identidade não inclui busca ou envio de candidaturas.",
  },
  "infojobs-es": {
    name: "InfoJobs Espanha",
    region: "ES",
    authorizationUrl:
      "https://www.infojobs.net/api/oauth/user-authorize/index.xhtml",
    documentation:
      "https://developer.infojobs.net/documentation/user-oauth2/index.xhtml",
    description:
      "Conecta uma conta do InfoJobs.net. Esta conexão não autentica o InfoJobs Brasil nem libera envios nas vagas brasileiras.",
  },
} as const;
export type OfficialOAuthProvider = keyof typeof officialOAuthProviders;
export type OfficialOAuthConnection = {
  id: OfficialOAuthProvider;
  name: string;
  region: string;
  configured: boolean;
  connected: boolean;
  expired: boolean;
  connectedAt: number | null;
  expiresAt: number | null;
  accountName: string | null;
  automaticApplications: false;
  description: string;
  documentation: string;
};
