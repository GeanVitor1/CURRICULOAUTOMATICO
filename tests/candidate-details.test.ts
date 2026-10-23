import { describe, expect, it } from "vitest";
import {
  applyCandidateDetails,
  candidateDetailsSchema,
} from "../server/candidate-details";
import {
  candidateDetailsReady,
  missingCandidateDetails,
} from "../shared/candidate-details";
import { createWorkspace } from "../server/workspace";
import { applyResumeProfile } from "../server/resume-state";
import { candidateAnswer } from "../server/portal-application";

const details = {
  phone: "11999990000",
  location: "São Paulo, SP",
  years: 1,
  salaryDesired: 3000,
  acceptsPj: true,
  compensationDisclosure: "prefer_not_to_say" as const,
  confirmation: true as const,
};
describe("Dados básicos antes das candidaturas", () => {
  it("exige uma escolha explícita de PJ e remuneração, sem presumir recusa de divulgação", () => {
    expect(
      candidateDetailsSchema.safeParse({ ...details, acceptsPj: undefined })
        .success,
    ).toBe(false);
    expect(
      candidateDetailsSchema.safeParse({
        ...details,
        compensationDisclosure: undefined,
      }).success,
    ).toBe(false);
    expect(
      candidateDetailsSchema.safeParse({
        ...details,
        compensationDisclosure: "inform",
        currentCompensation: " ",
      }).success,
    ).toBe(false);
    const w = createWorkspace("Pessoa", "fixture@example.test");
    applyCandidateDetails(w, candidateDetailsSchema.parse(details));
    delete w.profile.compensationDisclosure;
    expect(candidateDetailsReady(w.profile)).toBe(false);
  });
  it("reutiliza a preferência explícita por não divulgar sem copiar a pretensão", () => {
    const w = createWorkspace("Pessoa", "fixture@example.test");
    applyCandidateDetails(w, candidateDetailsSchema.parse(details));
    const question = "Qual é a sua remuneração atual (ou última) + benefícios?";
    expect(candidateAnswer(question, w.profile)).toBeUndefined();
    w.profile.confirmed = true;
    expect(candidateAnswer(question, w.profile)).toBe("Prefiro não informar");
    expect(
      candidateAnswer("Você tem interesse em atuar no regime PJ?", w.profile),
    ).toBe("Sim");
    applyCandidateDetails(
      w,
      candidateDetailsSchema.parse({
        ...details,
        acceptsPj: false,
        compensationDisclosure: "inform",
        currentCompensation: "R$ 2.000 + vale-alimentação",
      }),
    );
    expect(candidateAnswer(question, w.profile)).toBe(
      "R$ 2.000 + vale-alimentação",
    );
    expect(
      candidateAnswer("Você tem interesse em atuar no regime PJ?", w.profile),
    ).toBe("Não");
    applyCandidateDetails(w, candidateDetailsSchema.parse(details));
    expect(w.profile.currentCompensation).toBeUndefined();
    expect(candidateAnswer(question, w.profile)).toBe("Prefiro não informar");
  });
  it("preenche apenas pretensão mensal e experiência geral confirmadas", () => {
    const w = createWorkspace("Pessoa", "fixture@example.test");
    applyCandidateDetails(w, candidateDetailsSchema.parse(details));
    expect(candidateAnswer("Pretensão salarial", w.profile)).toBeUndefined();
    w.profile.confirmed = true;
    expect(candidateAnswer("Pretensão salarial mensal", w.profile)).toBe(
      "3000",
    );
    expect(candidateAnswer("Anos de experiência", w.profile)).toBe("1");
    expect(
      candidateAnswer("Qual seu salário atual?", w.profile),
    ).toBeUndefined();
    expect(
      candidateAnswer("Pretensão salarial anual em USD", w.profile),
    ).toBeUndefined();
    expect(
      candidateAnswer("Quantos anos de experiência em React?", w.profile),
    ).toBeUndefined();
    w.profile.salaryDesired = 0;
    w.profile.salaryMin = 5000;
    expect(candidateAnswer("Pretensão salarial", w.profile)).toBeUndefined();
  });
  it("pede os dados no primeiro acesso sem aprovar currículo nem iniciar rotina", () => {
    const w = createWorkspace("Pessoa", "fixture@example.test");
    expect(candidateDetailsReady(w.profile)).toBe(false);
    expect(missingCandidateDetails(w.profile)).toEqual(
      expect.arrayContaining([
        "telefone com DDD",
        "cidade e estado",
        "tempo de experiência",
        "confirmação dos dados básicos",
      ]),
    );
    applyCandidateDetails(w, candidateDetailsSchema.parse(details));
    expect(candidateDetailsReady(w.profile)).toBe(true);
    expect(w.profile.confirmed).toBe(false);
    expect(w.profile.salaryDesired).toBe(3000);
    expect(w.profile.salaryMin).toBe(0);
    expect(w.filters.salaryMin).toBe(0);
    expect(w.routine.enabled).toBe(false);
  });
  it.each([
    { phone: "123" },
    { location: " " },
    { years: null },
    { years: -1 },
    { salaryDesired: null },
    { salaryDesired: -100 },
    { confirmation: false },
  ])("recusa respostas incompletas ou sem confirmação: %j", (change) => {
    expect(
      candidateDetailsSchema.safeParse({ ...details, ...change }).success,
    ).toBe(false);
  });
  it("aceita primeiro emprego e pretensão explicitamente não definida", () => {
    const w = createWorkspace("Pessoa", "fixture@example.test");
    applyCandidateDetails(
      w,
      candidateDetailsSchema.parse({ ...details, years: 0, salaryDesired: 0 }),
    );
    expect(candidateDetailsReady(w.profile)).toBe(true);
    expect(w.profile.years).toBe(0);
    expect(w.profile.salaryDesired).toBe(0);
  });
  it("preserva experiência confirmada ao analisar outro arquivo", () => {
    const w = createWorkspace("Pessoa", "fixture@example.test");
    applyCandidateDetails(w, candidateDetailsSchema.parse(details));
    applyResumeProfile(w, {
      id: "resume",
      name: "fixture.pdf",
      uploadedAt: "",
      approved: false,
      text: "Desenvolvedor C# .NET",
      skills: ["C#"],
      analysis: "",
      suggestion: { years: 12 },
    });
    expect(w.profile.years).toBe(1);
    expect(w.profile.phone).toBe(details.phone);
    expect(w.profile.location).toBe(details.location);
    expect(w.profile.salaryDesired).toBe(3000);
    expect(candidateDetailsReady(w.profile)).toBe(true);
  });
});
