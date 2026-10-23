import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../server/gemini", () => ({ geminiJson: vi.fn() }));
import { geminiJson } from "../server/gemini";
import {
  prepareQuestionDrafts,
  savedQuestionDrafts,
} from "../server/question-drafts";
import { createWorkspace } from "../server/workspace";
import { confirmCandidateDetails } from "./fixtures/candidate-details";

beforeEach(() => vi.clearAllMocks());
const input = {
  resume: "Desenvolvi APIs com PostgreSQL e Git.",
  questions: ["Descreva seu projeto"],
  title: "Desenvolvedor",
  model: "gemini-test",
};

it("returns supported suggestions and never approves answers", async () => {
  vi.mocked(geminiJson).mockResolvedValue({
    answers: [
      {
        question: input.questions[0],
        answer: "Desenvolvi APIs com PostgreSQL e Git.",
        evidence: [input.resume],
      },
    ],
  });
  const answers = await prepareQuestionDrafts(input);
  expect(answers).toHaveLength(1);
  expect(answers[0]).not.toHaveProperty("confirmedAt");
});

it("rejects fabricated evidence, unknown questions and incompatible options", async () => {
  vi.mocked(geminiJson).mockResolvedValue({
    answers: [
      {
        question: input.questions[0],
        answer: "Especialista",
        evidence: ["Sou especialista em SQL"],
      },
      { question: "Outra pergunta", answer: "Sim", evidence: [input.resume] },
      {
        question: input.questions[0],
        answer: "Avançado",
        evidence: [input.resume],
      },
    ],
  });
  expect(
    await prepareQuestionDrafts({
      ...input,
      options: { [input.questions[0]]: ["Básico"] },
    }),
  ).toEqual([]);
});

it("does not ask the model to answer sensitive declarations", async () => {
  expect(
    await prepareQuestionDrafts({
      ...input,
      questions: ["Concordo com a política de privacidade?"],
    }),
  ).toEqual([]);
  expect(geminiJson).not.toHaveBeenCalled();
});

it("does not infer language confidence from comfort working in that language", async () => {
  expect(await prepareQuestionDrafts({ ...input, questions: ["Qual é seu nível de confiança ao trabalhar em inglês?"], confirmedFacts: ["Como se sente para trabalhar em inglês?: Não"] })).toEqual([]);
  expect(geminiJson).not.toHaveBeenCalled();
});

it("rejects a claim about AWS when the cited evidence only describes Azure", async () => {
  const resume = "Competências: Git e Azure DevOps.";
  vi.mocked(geminiJson).mockResolvedValue({ answers: [{question: input.questions[0], answer: "Não tenho experiência com AWS. Uso Azure DevOps.", evidence: [resume]}] });
  expect(await prepareQuestionDrafts({...input,resume})).toEqual([]);
});

it("uses confirmed preferences without guessing sensitive declarations", () => {
  const profile = createWorkspace("Pessoa", "fixture@example.test").profile;
  profile.confirmed = true;
  profile.applicationPreferences = {
    currentCompany: "Empresa A",
    confirmedAt: new Date().toISOString(),
  };
  const drafts = savedQuestionDrafts(
    ["Current company", "Concordo com os termos"],
    profile,
    "https://example.test/apply",
  );
  expect(drafts).toEqual([
    {
      question: "Current company",
      answer: "Empresa A",
      source: "profile",
      evidence: ["Resposta já confirmada no seu perfil."],
    },
  ]);
  expect(
    savedQuestionDrafts(
      ["Current company"],
      profile,
      "https://example.test/apply",
      { "Current company": ["Outra"] },
    ),
  ).toEqual([]);
});

it("accepts literal evidence from confirmed preferences", async () => {
  const fact = "Como você se sente para trabalhar em inglês?: Não";
  vi.mocked(geminiJson).mockResolvedValue({
    answers: [
      {
        question: input.questions[0],
        answer: "Não me sinto confortável trabalhando em inglês.",
        evidence: [fact],
      },
    ],
  });
  expect(
    await prepareQuestionDrafts({ ...input, confirmedFacts: [fact] }),
  ).toHaveLength(1);
});

it("reuses confirmed salary for the bilingual numeric salary question", () => {
  const w = createWorkspace("Pessoa", "fixture@example.test");
  confirmCandidateDetails(w);
  w.profile.confirmed = true;
  const question = "What is your salary expectation? Only the numeric value (no currency, text, or benefits)/ Qual é a sua pretensão salarial? Apenas o valor numérico (sem moeda, texto ou benefícios).";
  expect(savedQuestionDrafts([question], w.profile, "https://example.test/apply")[0]?.answer).toBe("3500");
});
