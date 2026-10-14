import { describe, expect, it } from "vitest";
import { parseResume } from "../server/engine";
import { buildResumeReview, verifyCoaching } from "../server/resume-review";
import { localResumeTargets, supportsTarget } from "../server/resume-targets";
import { verifyEvidence } from "../server/resume-extraction";
import { resumeAnalysisCases } from "./fixtures/resume-analysis-cases";

describe("Resume analysis evaluation cases", () => {
  it("canonicalizes equivalent skill names and does not infer Excel from unspecified spreadsheets", () => {
    const text =
      "Experiência: atendimento a clientes, organização de estoque e planilhas.";
    const profile = verifyEvidence(
      {
        fields: [],
        skills: [
          {
            name: "Atendimento a clientes",
            evidence: "atendimento a clientes",
          },
          {
            name: "Organização de Estoque",
            evidence: "organização de estoque",
          },
        ],
        years: null,
        yearsEvidence: "",
      },
      text,
    );
    expect(profile.skills).toEqual([
      "Atendimento ao público",
      "Organização de estoque",
    ]);
    expect(parseResume(text).skills).not.toContain("Excel");
  });
  for (const sample of resumeAnalysisCases) {
    it(sample.id, () => {
      const profile = parseResume(sample.text);
      const targets = localResumeTargets(sample.text, profile);
      const review = buildResumeReview(sample.text, profile);
      expect(profile.skills).toEqual(
        expect.arrayContaining(sample.expectedSkills),
      );
      for (const skill of sample.forbiddenSkills)
        expect(profile.skills).not.toContain(skill);
      expect(targets.map((target) => target.title)).toEqual(
        expect.arrayContaining(sample.expectedTargets),
      );
      for (const title of sample.forbiddenTargets)
        expect(targets.map((target) => target.title)).not.toContain(title);
      expect(review.sections).toHaveLength(5);
      for (const strength of review.strengths)
        expect(sample.text).toContain(strength.evidence);
      for (const target of targets)
        expect(sample.text).toContain(target.evidence);
    });
  }
  it("preserves multiline education, projects and languages", () => {
    const text =
      "Objetivo profissional\nAnalista de dados\nFormação acadêmica\nUniversidade Fictícia\nEstatística | 2020 - 2024\nCursos complementares\nPower BI - concluído\nProjetos pessoais\nPainel de vendas em Power BI\nIdiomas\nInglês intermediário";
    const profile = parseResume(text);
    expect(profile.headline).toBe("Analista de dados");
    expect(profile.education).toContain("Universidade Fictícia");
    expect(profile.education).toContain("2020 - 2024");
    expect(profile.education).toContain("Power BI - concluído");
    expect(profile.experience).toBe("Painel de vendas em Power BI");
    expect(profile.languages).toBe("Inglês intermediário");
  });
  it("rejects unrelated jobs and invented seniority even with a real quote", () => {
    const text = "Competências: Python\nExperiência: atendimento ao público";
    expect(supportsTarget("Diretor executivo", "Python", text)).toBe(false);
    expect(supportsTarget("Desenvolvedor sênior", "Python", text)).toBe(false);
    expect(supportsTarget("Médico", "atendimento ao público", text)).toBe(
      false,
    );
    expect(supportsTarget("Atendente", "", text)).toBe(false);
    expect(
      supportsTarget("Desenvolvedor Python", "C#", "Competências: C#"),
    ).toBe(false);
    expect(supportsTarget("Desenvolvedor .NET", "C#", "Competências: C#")).toBe(
      false,
    );
  });
  it("distinguishes an objective from experience", () => {
    const text = "Objetivo: Vendedor\nFormação: ensino médio completo";
    const target = localResumeTargets(text, parseResume(text)).find(
      (target) => target.title === "Vendedor",
    )!;
    expect(target.basis).toBe("objective");
    expect(target.reason).toContain("não experiência comprovada");
  });
  it("asks first job candidates about real activities without inventing experience", () => {
    const text = "Objetivo: primeiro emprego\nFormação: ensino médio completo";
    const report = buildResumeReview(text, parseResume(text));
    const action = report.improvements.find(
      (item) => item.category === "experience",
    )!;
    expect(action.action).toContain("trabalhos informais");
    expect(action.evidence).toBe("");
    expect(report.strengths.some((item) => /Atividades/.test(item.label))).toBe(
      false,
    );
  });
  it("keeps only distinct coaching backed by literal professional quotes", () => {
    const text = "Experiência: desenvolvimento com Python.";
    const grounded = {
      category: "experience",
      priority: "high",
      evidence: "desenvolvimento com Python",
      action: "Descreva o contexto e o resultado real do projeto.",
      question: "Qual problema esse projeto resolveu?",
    };
    expect(
      verifyCoaching(
        [grounded, grounded, { ...grounded, evidence: "Trabalhou na NASA" }],
        text,
      ),
    ).toEqual([grounded]);
    expect(verifyCoaching({ bad: true }, text)).toEqual([]);
  });
  it("does not accept invented fields or negated years from the model", () => {
    const result = verifyEvidence(
      {
        fields: [
          {
            field: "education",
            value: "Graduação concluída",
            evidence: "Curso em andamento",
          },
        ],
        skills: [],
        years: 5,
        yearsEvidence: "Não tenho 5 anos de experiência",
      },
      "Curso em andamento. Não tenho 5 anos de experiência.",
    );
    expect(result.education).toBeUndefined();
    expect(result.years).toBeUndefined();
  });
  it("reports truncated AI input and does not expose contacts as strengths", () => {
    const text =
      "Nome: Pessoa Fictícia\nEmail: pessoa@example.test\nObjetivo: Atendente\nExperiência: atendimento ao público\nFormação: ensino médio completo";
    const review = buildResumeReview(text, parseResume(text), {
      method: "gemini",
      analyzedText: "Objetivo: Atendente",
    });
    expect(review.coverage.truncated).toBe(true);
    expect(JSON.stringify(review)).not.toMatch(
      /pessoa@example.test|Pessoa Fictícia/,
    );
  });
});
