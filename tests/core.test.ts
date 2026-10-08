import { describe, expect, it } from "vitest";
import {
  analyze,
  classify,
  dedupKey,
  extractSkills,
  nextExecution,
  parseResume,
} from "../server/engine";
import { extractDocx } from "../server/documents";
import { zipSync, strToU8 } from "fflate";
import { defaultFilters, defaultProfile, type Job } from "../shared/types";
const profile = {
  ...defaultProfile,
  skills: ["C#", ".NET", "SQL Server", "APIs REST"],
  years: 2,
  confirmed: true,
};
const job: Job = {
  id: "job",
  title: "Software Engineer I",
  company: "Empresa",
  source: "Manual",
  url: "",
  description: "C# .NET SQL Server APIs REST",
  location: "Brasil",
  modality: "Remoto",
  level: "Júnior",
  contract: "CLT",
  salaryMin: null,
  salaryMax: null,
  currency: "BRL",
  skills: ["C#", ".NET", "SQL Server", "APIs REST"],
  requiredSkills: [],
  requiredYears: 1,
  publishedAt: null,
  discoveredAt: new Date().toISOString(),
  saved: false,
  discarded: false,
  origins: [],
  match: {} as any,
  demo: false,
};
describe("Motor de aderência", () => {
  it("Radar também reconhece uma família profissional fora de software", () => {
    const p = {
      ...profile,
      headline: "Designer UX",
      skills: ["Figma", "Pesquisa com usuários"],
    };
    const j = {
      ...job,
      title: "Product Designer",
      skills: ["Figma", "Pesquisa com usuários"],
    };
    const m = analyze(j, p, {
      ...defaultFilters,
      titles: ["Designer UX"],
      skills: ["Figma"],
    });
    expect(m.radar).toBe(true);
    expect(m.score).toBeGreaterThan(80);
  });
  it("não confunde a idade da empresa com experiência exigida", () =>
    expect(
      classify("Empresa com 50 anos no mercado, busca desenvolvedor junior"),
    ).toMatchObject({ requiredYears: null }));
  it("reconhece variações de C# e .NET", () =>
    expect(
      extractSkills("CSharp, ASP.NET Core, SQL Server, Angular, REST"),
    ).toEqual(
      expect.arrayContaining([
        "C#",
        ".NET",
        "ASP.NET Core",
        "SQL Server",
        "Angular",
        "APIs REST",
      ]),
    ));
  it("gera Radar por competências mesmo com outro título", () => {
    const m = analyze(job, profile, {
      ...defaultFilters,
      titles: ["Desenvolvedor .NET Júnior"],
    });
    expect(m.radar).toBe(true);
    expect(m.score).toBeGreaterThan(80);
    expect(m.strengths.length).toBeGreaterThan(0);
  });
  it("salário desconhecido não é zero nem é bloqueado pelo mínimo", () => {
    const m = analyze(job, profile, { ...defaultFilters, salaryMin: 5000 });
    expect(m.blockers).toEqual([]);
    expect(m.gaps).toContain("Salário não divulgado.");
  });
  it("salário abaixo do mínimo bloqueia independentemente de similaridade", () => {
    const m = analyze({ ...job, salaryMin: 1000, salaryMax: 2000 }, profile, {
      ...defaultFilters,
      salaryMin: 5000,
    });
    expect(m.blockers.length).toBeGreaterThan(0);
    expect(m.score).toBeLessThan(50);
  });
  it("requisito obrigatório ausente bloqueia", () =>
    expect(
      analyze(
        { ...job, requiredSkills: ["Azure"] },
        profile,
        defaultFilters,
      ).blockers.join(),
    ).toContain("Azure"));
  it("vaga Júnior com 5 anos exige revisão", () => {
    const m = analyze({ ...job, requiredYears: 5 }, profile, defaultFilters);
    expect(m.blockers.join()).toContain("título é júnior");
    expect(m.score).toBeLessThan(50);
  });
  it("não usa palavras-chave para inventar experiência", () => {
    const p = parseResume("Cursos C# e .NET. e-mail: pessoa@exemplo.com.");
    expect(p.skills).toEqual(["C#", ".NET"]);
    expect(p.years).toBeUndefined();
    expect(p.education).toBeUndefined();
    expect(p.confirmed).toBe(false);
  });
  it("normaliza duplicatas com acentos e caixa", () =>
    expect(
      dedupKey({ ...job, title: "Analista JÚNIOR", company: "EMPRESA" }),
    ).toBe(dedupKey({ ...job, title: "analista junior", company: "empresa" })));
  it("não deduplica cargos de locais diferentes", () =>
    expect(dedupKey(job)).not.toBe(dedupKey({ ...job, location: "Lisboa" })));
  it("identifica experiência realmente exigida", () =>
    expect(
      classify("Junior developer, minimum of 5 years of experience, remote"),
    ).toMatchObject({ level: "Júnior", modality: "Remoto", requiredYears: 5 }));
  it("empresa bloqueada e pagamento impedem preparação", () =>
    expect(
      analyze(
        { ...job, description: "Taxa de inscrição para a vaga" },
        profile,
        { ...defaultFilters, blockedCompanies: ["empresa"] },
      ).blockers.length,
    ).toBe(2));
});
describe("Agendamento e documentos", () => {
  it("usa Brasília e agenda amanhã quando o horário passou", () =>
    expect(nextExecution("08:00", new Date("2026-10-08T12:00:00Z"))).toBe(
      "2026-10-09T11:00:00.000Z",
    ));
  it("não pula o horário que ainda não passou", () =>
    expect(nextExecution("08:00", new Date("2026-10-08T10:00:00Z"))).toBe(
      "2026-10-08T11:00:00.000Z",
    ));
  it("extrai DOCX com quebras e entidades", () => {
    const doc = zipSync({
      "word/document.xml": strToU8(
        "<w:document><w:p><w:r><w:t>C# &amp; .NET</w:t></w:r></w:p><w:p><w:t>SQL Server</w:t></w:p></w:document>",
      ),
    });
    expect(extractDocx(Buffer.from(doc))).toBe("C# & .NET\nSQL Server");
  });
});
