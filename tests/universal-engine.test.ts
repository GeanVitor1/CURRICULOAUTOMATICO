import { describe, expect, it } from "vitest";
import {
  analyze,
  classify,
  extractSkills,
  locationMatches,
  matchSignature,
  matchesObjectiveFilters,
  parseResume,
  suggestRoles,
} from "../server/engine";
import { defaultFilters, defaultProfile, type Job } from "../shared/types";
import { sourceSchema } from "../server/validation";
const profile = {
  ...defaultProfile,
  confirmed: true,
  headline: "Operador de caixa",
  education: "Ensino médio completo",
  experience: "Trabalho informal: atendia clientes",
  skills: ["Atendimento ao público"],
};
const job: Job = {
  id: "retail",
  title: "Operador de caixa",
  company: "Mercado",
  source: "Jobicy",
  url: "https://example.org/job",
  description:
    "Ensino médio completo. Atendimento ao público. Sem experiência obrigatória.",
  location: "Belo Horizonte, Brazil",
  modality: "Presencial",
  level: "Primeiro emprego",
  contract: "CLT",
  salaryMin: null,
  salaryMax: null,
  currency: "BRL",
  skills: ["Atendimento ao público"],
  requiredSkills: [],
  requiredYears: null,
  publishedAt: null,
  discoveredAt: new Date().toISOString(),
  saved: false,
  discarded: false,
  origins: [],
  match: {} as any,
  demo: false,
};
describe("Compatibilidade para diferentes profissões", () => {
  it("não ignora competências desejadas, especialização do cargo ou idioma selecionado", () => {
    expect(
      matchesObjectiveFilters(job, profile, {
        ...defaultFilters,
        skills: ["Excel"],
      }),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(job, profile, {
        ...defaultFilters,
        skills: ["Atendimento ao público"],
      }),
    ).toBe(true);
    expect(
      matchesObjectiveFilters(
        { ...job, description: "Uma paisagem especial", skills: [] },
        profile,
        { ...defaultFilters, skills: ["SAP"] },
      ),
    ).toBe(false);
    const software = {
      ...job,
      title: "Software Developer",
      description: "Desenvolvimento com JavaScript e React.",
      skills: ["JavaScript", "React"],
    };
    expect(
      matchesObjectiveFilters(software, profile, {
        ...defaultFilters,
        titles: ["Desenvolvedor .NET"],
      }),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(
        {
          ...software,
          description: "Desenvolvimento .NET com inglês.",
          skills: [".NET"],
        },
        profile,
        {
          ...defaultFilters,
          titles: ["Desenvolvedor .NET"],
          language: "English",
        },
      ),
    ).toBe(true);
    expect(
      matchesObjectiveFilters(job, profile, {
        ...defaultFilters,
        language: "English",
      }),
    ).toBe(false);
    expect(
      extractSkills("JavaScript no trabalho, paisagem fora", ["Java", "SAP"]),
    ).not.toContain("Java");
  });
  it("aceita termos de busca Adzuna e protege identificadores ATS", () => {
    expect(
      sourceSchema.safeParse({
        type: "adzuna",
        company: "Adzuna",
        board: "operador de caixa",
        country: "br",
      }).success,
    ).toBe(true);
    expect(
      sourceSchema.safeParse({
        type: "greenhouse",
        company: "Empresa",
        board: "company/../other",
      }).success,
    ).toBe(false);
    expect(
      sourceSchema.safeParse({
        type: "jobicy",
        company: "Jobicy",
        board: "public",
      }).success,
    ).toBe(true);
  });
  it("exclui anúncios encerrados e aceita oportunidades explícitas de primeiro emprego", () => {
    expect(
      matchesObjectiveFilters(
        { ...job, availability: "closed" },
        profile,
        defaultFilters,
      ),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(job, profile, {
        ...defaultFilters,
        titles: ["Primeiro emprego"],
      }),
    ).toBe(true);
  });
  it("interpreta currículo simples e experiência informal sem inventar tempo", () => {
    const parsed = parseResume(
      "Ensino médio completo\nTrabalho informal: atendia clientes\nObjetivo: supermercado",
    );
    expect(parsed.skills).toContain("Atendimento ao público");
    expect(parsed.education).toBe("Ensino médio completo");
    expect(parsed.experience).toContain("atendia clientes");
    expect(parsed.years).toBeUndefined();
    expect(suggestRoles(parsed)).toContain("Operador de caixa");
    expect(parsed.skills).not.toContain("C#");
  });
  it("mantém profissões sem indicação sem cargos de programação", () => {
    expect(suggestRoles({ education: "Ensino fundamental" })).toEqual([]);
    expect(
      extractSkills("Limpeza, Excel, recepção, organização de estoque"),
    ).toEqual(
      expect.arrayContaining([
        "Limpeza",
        "Excel",
        "Recepção",
        "Organização de estoque",
      ]),
    );
  });
  it("pontua escolaridade e atendimento sem exigir portfólio", () => {
    const match = analyze(job, profile, {
      ...defaultFilters,
      titles: ["Operador de caixa"],
    });
    expect(match.confidence).toBe("sufficient");
    expect(match.score).toBeGreaterThan(75);
    expect(match.blockers).toEqual([]);
    expect(match.criteria?.some((c) => c.label === "Escolaridade")).toBe(true);
    expect(match.explanation).toContain("Não representa a probabilidade");
  });
  it("distingue dados insuficientes de baixa compatibilidade", () => {
    const match = analyze(
      {
        ...job,
        skills: [],
        description: "Atividades informadas durante a entrevista",
      },
      { ...defaultProfile, confirmed: true },
      defaultFilters,
    );
    expect(match.confidence).toBe("insufficient");
    expect(match.score).toBe(0);
    expect(match.explanation).toContain("ausência de informação");
  });
  it("bloqueia COREN obrigatório ausente e registro declarado inativo", () => {
    const nursing = {
      ...job,
      title: "Técnico de enfermagem",
      description: "Técnico de enfermagem com COREN ativo obrigatório.",
      skills: ["Enfermagem"],
    };
    for (const education of [
      "Ensino médio completo",
      "Técnico em enfermagem; COREN inativo",
    ])
      expect(
        analyze(
          nursing,
          { ...profile, education, skills: ["Enfermagem"] },
          defaultFilters,
        ).blockers.join(" "),
      ).toContain("COREN");
    expect(
      analyze(
        nursing,
        {
          ...profile,
          education: "Técnico em enfermagem. COREN ativo",
          skills: ["Enfermagem"],
        },
        defaultFilters,
      ).blockers.join(" "),
    ).not.toContain("COREN");
    expect(
      analyze(
        {
          ...nursing,
          description: "Atendimento necessário. COREN ativo desejável.",
        },
        profile,
        defaultFilters,
      ).blockers.join(),
    ).not.toContain("COREN");
  });
  it("alerta sobre CNH de categoria exigida", () => {
    const driving = {
      ...job,
      title: "Motorista",
      description: "Motorista com CNH categoria D obrigatória",
    };
    expect(
      analyze(
        driving,
        { ...profile, skills: ["CNH B"] },
        defaultFilters,
      ).blockers.join(),
    ).toContain("CNH D");
  });
  it("não chama remoto de alinhado quando a preferência é presencial", () => {
    expect(
      analyze({ ...job, modality: "Remoto" }, profile, {
        ...defaultFilters,
        modalities: ["Presencial"],
      }).strengths.join(),
    ).not.toContain("remota alinhada");
  });
  it("reconhece cidades brasileiras com rótulos diferentes e siglas", () => {
    expect(
      locationMatches("Belo Horizonte, Brazil", ["Belo Horizonte, MG"]),
    ).toBe(true);
    expect(locationMatches("São Paulo, Brasil", ["SP"])).toBe(true);
    expect(locationMatches("Remote, United States", ["Brasil"])).toBe(false);
    expect(locationMatches("Paraguay", ["Brasil"])).toBe(false);
    expect(locationMatches("Charleston, SC, US", ["Brasil"])).toBe(false);
    expect(locationMatches("Belo Horizonte, Brazil", ["Curitiba, PR"])).toBe(
      false,
    );
  });
  it("não compara remuneração anual ou desconhecida ao mínimo mensal", () => {
    const filters = { ...defaultFilters, salaryMin: 5000 };
    expect(
      analyze(
        { ...job, salaryMin: 60000, salaryMax: 60000, salaryPeriod: "year" },
        profile,
        filters,
      ).blockers.join(),
    ).not.toContain("salarial");
    expect(
      analyze(
        { ...job, salaryMin: 30000, salaryMax: 30000, salaryPeriod: "annual" },
        profile,
        filters,
      ).blockers.join(),
    ).toContain("salarial");
    expect(
      analyze(
        { ...job, salaryMin: 3000, salaryMax: 3000 },
        profile,
        filters,
      ).gaps.join(),
    ).toContain("Período salarial não informado");
  });
  it("filtra família varejo por preferências e exclui modalidade incompatível", () => {
    expect(
      matchesObjectiveFilters({ ...job, title: "Repositor" }, profile, {
        ...defaultFilters,
        titles: ["Atendente"],
      }),
    ).toBe(true);
    expect(
      matchesObjectiveFilters(job, profile, {
        ...defaultFilters,
        titles: ["Motorista"],
      }),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(job, profile, {
        ...defaultFilters,
        modalities: ["Remoto"],
      }),
    ).toBe(false);
  });
  it("classifica aprendiz, primeiro emprego, contrato e prioridade híbrida", () => {
    expect(classify("Jovem aprendiz administrativo, CLT")).toMatchObject({
      level: "Aprendiz",
      contract: "Aprendiz",
    });
    expect(
      classify("Operador sem experiência, contrato temporário"),
    ).toMatchObject({ level: "Primeiro emprego", contract: "Temporário" });
    expect(
      classify("Modelo híbrido: presencial com 2 dias remoto").modality,
    ).toBe("Híbrido");
  });
  it("mantém interpretação avançada somente para o perfil e vaga analisados", () => {
    const advice = {
      provider: "zen",
      model: "ling-3.1-flash-free",
      explanation: "Leitura verificada.",
      signature: matchSignature(profile, job, defaultFilters),
    };
    const assessedJob = {
      ...job,
      match: { ...analyze(job, profile, defaultFilters), advice },
    };
    expect(analyze(assessedJob, profile, defaultFilters).explanation).toContain(
      "Leitura verificada",
    );
    expect(
      analyze(assessedJob, { ...profile, skills: [] }, defaultFilters).advice,
    ).toBeUndefined();
  });
});
