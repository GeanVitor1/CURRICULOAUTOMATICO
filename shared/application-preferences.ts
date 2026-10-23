export const languageLevels = [
  "Não falo",
  "Básico",
  "Intermediário I",
  "Intermediário II",
  "Avançado",
  "Proficiente",
] as const;
export const applicationPreferenceFields = [
  { key: "linkedin", label: "Link do LinkedIn", options: null },
  {
    key: "currentCompany",
    label: "Empresa atual (ou informe que não trabalha atualmente)",
    options: null,
  },
  {
    key: "developmentExperience",
    label: "Tempo de experiência em desenvolvimento",
    options: null,
  },
  {
    key: "dotnetExperience",
    label: "Tempo de experiência com .NET",
    options: null,
  },
  {
    key: "cloudExperience",
    label: "Descreva sua experiência com AWS, Azure ou Google Cloud",
    options: null,
  },
  { key: "english", label: "Nível de inglês", options: languageLevels },
  {
    key: "englishWork",
    label: "Como você se sente para trabalhar em inglês?",
    options: null,
  },
  { key: "spanish", label: "Nível de espanhol", options: languageLevels },
  {
    key: "spanishWork",
    label: "Como você se sente para trabalhar em espanhol?",
    options: null,
  },
  {
    key: "gcp",
    label: "Experiência com Google Cloud (GCP)",
    options: [
      "Nenhuma",
      "Acadêmica",
      "Uso profissional",
      "Configuração e administração profissional",
    ],
  },
  {
    key: "dotnet",
    label: "Seu nível em .NET",
    options: ["Básico", "Intermediário", "Avançado", "Especialista"],
  },
  {
    key: "accessibility",
    label: "Acessibilidade no processo seletivo",
    options: [
      "Não necessito de nenhuma acessibilidade",
      "Descrição de imagens e audiodescrição de vídeos",
      "Intérprete de Libras ou Legenda",
      "Dificuldade na fala (exemplo: gagueira, disartria.)",
      "Digital (exemplo: aumento de tela do computador, mudanças de contraste)",
      "Elevador/Rampa",
      "Local silencioso e com baixa luminosidade",
      "Deficiencia auditiva (fonética diferente)",
    ],
  },
] as const;
export type ApplicationPreferenceKey =
  (typeof applicationPreferenceFields)[number]["key"];
export type ApplicationPreferences = Partial<
  Record<ApplicationPreferenceKey, string>
> & { confirmedAt?: string };
