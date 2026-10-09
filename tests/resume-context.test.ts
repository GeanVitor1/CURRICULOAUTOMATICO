import { describe, expect, it } from "vitest";
import { extractSkills, parseResume, suggestRoles } from "../server/engine";
import {
  localResumeTargets,
  supportsTarget,
  TARGETS_VERSION,
} from "../server/resume-targets";
import { upgradeResumeTargets } from "../server/workspace-upgrade";
import { createWorkspace } from "../server/workspace";

export const developerResume = `RESUMO PROFISSIONAL
Analista de Sistemas e Desenvolvedor Full Stack com sólida experiência no ecossistema .NET (C#, ASP.NET
Core e Entity Framework Core), SQL Server, Angular e TypeScript.
Atuação no desenvolvimento, na arquitetura e na manutenção de sistemas web corporativos.
COMPETÊNCIAS TÉCNICAS
Backend e frameworks: C#, .NET 8/10, ASP.NET Core Web API, ASP.NET Core MVC, Razor Views e LINQ.
Frontend e design: Angular 20/21, TypeScript, JavaScript, PrimeNG e Tailwind CSS.
Arquitetura e padrões: Clean Architecture, Repository Pattern, Unit of Work, Background Services (Workers),
processamento em filas, Pipeline e Circuit Breaker.
EXPERIÊNCIA PROFISSIONAL
Analista de Sistemas | 2025 - Atual
Portal Engenharia - Ilhéus, BA (Presencial)
Responsável pela análise de requisitos e pelo desenvolvimento full stack.
● Integração cadastral: consultas ao Protheus para clientes, produtos, vendedores, transportadoras, condições de
pagamento e tabelas comerciais.
Sistema full stack com múltiplos perfis para academias (aluno, professor, recepção, financeiro e
administrador).
Tecnologias: C#, .NET 8, Angular, EF Core, SQL Server, Docker e CI/CD.`;

describe("Contexto profissional do currículo", () => {
  it("sugere somente a área de desenvolvimento no caso relatado, mantendo evidência literal", () => {
    const targets = localResumeTargets(developerResume, {});
    expect(targets.map((target) => target.title)).toEqual(
      expect.arrayContaining([
        "Analista de sistemas",
        "Desenvolvedor full stack",
        "Desenvolvedor .NET",
        "Desenvolvedor frontend",
        "Desenvolvedor backend",
      ]),
    );
    expect(
      targets.every((target) =>
        /Desenvolvedor|Analista de sistemas/.test(target.title),
      ),
    ).toBe(true);
    expect(
      targets.every((target) => developerResume.includes(target.evidence)),
    ).toBe(true);
    expect(extractSkills(developerResume)).not.toEqual(
      expect.arrayContaining(["Reposição de mercadorias"]),
    );
    expect(extractSkills(developerResume)).not.toContain("Vendas");
    expect(extractSkills(developerResume)).not.toContain("Recepção");
    expect(extractSkills(developerResume)).not.toContain("Educação");
    expect(parseResume(developerResume).headline).toBe(
      "Analista de Sistemas e Desenvolvedor Full Stack",
    );
    expect(suggestRoles(parseResume(developerResume))).not.toContain("Repositor");
    expect(parseResume(developerResume).experience).toContain(
      "Portal Engenharia",
    );
  });
  it("não confunde termos técnicos nem trechos válidos com evidência para outro cargo", () => {
    expect(
      localResumeTargets(
        "Arquitetura: Repository Pattern; repositórios Git",
        {},
      ),
    ).toEqual([]);
    expect(
      supportsTarget("Repositor", "Repository Pattern", developerResume),
    ).toBe(false);
    expect(supportsTarget("Vendedor", "vendedores", developerResume)).toBe(
      false,
    );
    expect(supportsTarget("Professor", "professor", developerResume)).toBe(
      false,
    );
    expect(
      supportsTarget("Recepcionista", "Analista de Sistemas", developerResume),
    ).toBe(false);
  });
  it("continua reconhecendo experiência real em comércio, inclusive na mudança de carreira", () => {
    const text =
      developerResume +
      "\nVendedor | 2022 - 2024\nExperiência: reposição de mercadorias e operação de caixa.\nRecepcionista | 2021 - 2022";
    expect(localResumeTargets(text, {}).map((target) => target.title)).toEqual(
      expect.arrayContaining([
        "Vendedor",
        "Repositor",
        "Operador de caixa",
        "Recepcionista",
      ]),
    );
  });
  it("reconhece medicina concluída e não atribui habilitação a quem está cursando", () => {
    expect(localResumeTargets("Médico | 2020 - Atual\nRecepção e atendimento ao público na UBS. Higienização de materiais.", {}).map((target) => target.title)).toEqual(["Médico"]);
    expect(
      localResumeTargets(
        "Formação: graduação em medicina completa\nExperiência: atendimento médico em UBS",
        {},
      ).map((target) => target.title),
    ).toContain("Médico");
    expect(
      localResumeTargets(
        "Estudante de medicina\nGraduação em medicina em andamento",
        {},
      ),
    ).toEqual([]);
    expect(localResumeTargets("Enfermeiro, formação em andamento", {})).toEqual(
      [],
    );
    expect(
      localResumeTargets("Sem experiência como vendedor ou recepcionista", {}),
    ).toEqual([]);
  });
  it("repara sugestões persistidas, revoga cargos inválidos e preserva critérios próprios", () => {
    const w = createWorkspace("Pessoa", "teste@example.test");
    w.filters.titles = ["Repositor", "Desenvolvedor .NET"];
    w.resumes = [
      {
        id: "old",
        name: "Currículo",
        text: developerResume,
        skills: [".NET", "Reposição de mercadorias"],
        approved: true,
        uploadedAt: "2025-01-01",
        analysis: "",
        targetsMethod: "local",
        targetsConfirmed: true,
        targetTitles: ["Repositor"],
        targets: [
          {
            title: "Repositor",
            evidence: "Repository Pattern",
            reason: "",
            caution: "",
          },
        ],
      },
    ];
    w.profile.skills = [".NET", "Reposição de mercadorias"];
    upgradeResumeTargets(w);
    expect(w.resumes[0].targetsVersion).toBe(TARGETS_VERSION);
    expect(w.resumes[0].approved).toBe(true);
    expect(w.resumes[0].targetsConfirmed).toBe(false);
    expect(w.filters.titles).toEqual(["Desenvolvedor .NET"]);
    expect(w.profile.skills).toEqual([".NET"]);
    const upgraded = structuredClone(w);
    upgradeResumeTargets(w);
    expect(w).toEqual(upgraded);
  });
});
