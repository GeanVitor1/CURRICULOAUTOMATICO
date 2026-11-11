import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../server/gemini", () => ({ geminiJson: vi.fn() }));
import { geminiJson } from "../server/gemini";
import {
  applicationAnswerProfile,
  prepareAutomaticAnswers,
} from "../server/automatic-answers";
import { createWorkspace } from "../server/workspace";
import type { Application, Job, Resume } from "../shared/types";
const workspace = () => {
  const w = createWorkspace("Pessoa", "fixture@example.test");
  w.profile.confirmed = true;
  w.profile.answerPolicy = {
    enabled: true,
    missing: "no",
    confirmedAt: new Date().toISOString(),
  };
  return w;
};
const resume = {
  id: "resume",
  text: "Desenvolvi APIs REST com .NET e PostgreSQL.",
} as Resume;
const job = { title: "Desenvolvedor", source: "LinkedIn" } as Job;
const destinationUrl = "https://example.test/apply";
beforeEach(() => vi.clearAllMocks());
it("usa duração explícita por tecnologia e não transforma experiência sem duração em zero",async()=>{
  const w=workspace();
  const question="Quantos anos de experiência você possui com C#?";
  const evidence={...resume,text:"Possuo 4 anos de experiência com C#. Trabalho com .NET e APIs."};
  const result=await prepareAutomaticAnswers({profile:w.profile,resume:evidence,job,destinationUrl,questions:[question]});
  expect(result[0]).toMatchObject({value:"4",confidence:"confirmed",fillable:true});
  const labelled=await prepareAutomaticAnswers({profile:w.profile,resume:{...resume,text:"C#: 3 anos"},job,destinationUrl,questions:[question]});
  expect(labelled[0].value).toBe("3");
  w.profile.skills=["C#"];
  const unknown=await prepareAutomaticAnswers({profile:w.profile,resume:{...resume,text:"Desenvolvimento com C#"},job,destinationUrl,questions:[question]});
  expect(unknown).toEqual([]);
});
it("never replaces a known accessibility need with a negative default",async()=>{
 const w=workspace();w.profile.applicationPreferences={accessibility:"Elevador/Rampa",confirmedAt:new Date().toISOString()};
 const question="Você precisa de acessibilidade?";
 const yes=await prepareAutomaticAnswers({profile:w.profile,resume,job,destinationUrl,questions:[question],options:{[question]:["Sim","Não"]}});
 expect(yes[0].value).toBe("Sim");expect(yes[0].source).toBe("profile");
 const incompatible=await prepareAutomaticAnswers({profile:w.profile,resume,job,destinationUrl,questions:[question],options:{[question]:["Não","Intérprete de Libras"]}});
 expect(incompatible).toEqual([]);
});
it("requires the user's specific policy", async () => {
  const w = workspace();
  delete w.profile.answerPolicy;
  expect(
    await prepareAutomaticAnswers({
      profile: w.profile,
      resume,
      job,
      destinationUrl,
      questions: ["Possui familiar na empresa?"],
    }),
  ).toEqual([]);
});
it("prefers nondisclosure for unknown personal information and never overrides confirmed facts", async () => {
  const w = workspace();
  const question = "Qual o seu gênero?";
  const result = await prepareAutomaticAnswers({profile:w.profile,resume,job,destinationUrl,
    questions:[question,"Qual sua raça?","Possui certificação?"],
    options:{[question]:["Feminino","Masculino","Não","Prefiro não informar"]}});
  // Only the explicit decline option is chosen; free-text race and an unknown certification stay pending.
  expect(result.map(answer=>[answer.question,answer.value,answer.source])).toEqual([[question,"Prefiro não informar","decline_option"]]);
  w.profile.approvedAnswers=[{id:"known",question,aliases:[],value:"Feminino",confirmedAt:new Date().toISOString(),destinationUrl}];
  const known=await prepareAutomaticAnswers({profile:w.profile,resume,job,destinationUrl,questions:[question],options:{[question]:["Feminino","Prefiro não informar"]}});
  expect(known[0]).toMatchObject({value:"Feminino",source:"profile"});
});
it("never answers relatives or accessibility negatively without information", async () => {
  const w = workspace();
  const questions = [
    "Possui algum familiar na empresa?",
    "Você precisa de acessibilidade?",
    "Você é PcD?",
  ];
  const result = await prepareAutomaticAnswers({
    profile: w.profile,
    resume,
    job,
    destinationUrl,
    questions,
    options: {
      [questions[0]]: ["Sim", "Não"],
      [questions[1]]: ["Preciso de rampa", "Não necessito de acessibilidade"],
      [questions[2]]: ["Sim", "Não", "Prefiro não informar"],
    },
  });
  expect(result.map((a) => [a.question, a.value, a.source])).toEqual([[questions[2], "Prefiro não informar", "decline_option"]]);
  expect(result.some((a) => a.source === "default_no")).toBe(false);
});
it("uses source and confirmed information without accepting terms", async () => {
  const w = workspace();
  w.profile.applicationPreferences = {
    currentCompany: "Empresa A",
    confirmedAt: new Date().toISOString(),
  };
  const result = await prepareAutomaticAnswers({
    profile: w.profile,
    resume,
    job,
    destinationUrl,
    questions: [
      "Current company",
      "Como ficou sabendo da nossa vaga?",
      "Concordo com os termos e tratamento de dados",
    ],
    options: { "Como ficou sabendo da nossa vaga?": ["LinkedIn", "Outro"] },
  });
  expect(result.map((a) => [a.value, a.source])).toEqual([
    ["Empresa A", "profile"],
    ["LinkedIn", "job_source"],
  ]);
});
it("uses evidenced AI answers and handles quota without choosing positive defaults", async () => {
  const w = workspace();
  vi.mocked(geminiJson).mockResolvedValueOnce({
    answers: [
      {
        question: "Descreva um projeto",
        answer: resume.text,
        evidence: [resume.text],
      },
    ],
  });
  expect(
    (
      await prepareAutomaticAnswers({
        profile: w.profile,
        resume,
        job,
        destinationUrl,
        questions: ["Descreva um projeto"],
        model: "gemini-test",
      })
    )[0].source,
  ).toBe("ai");
  vi.mocked(geminiJson).mockRejectedValueOnce(new Error("quota"));
  const answers = await prepareAutomaticAnswers({
    profile: w.profile,
    resume,
    job,
    destinationUrl,
    questions: ["Possui certificação?", "Nível técnico"],
    options: { "Nível técnico": ["Avançado", "Especialista"] },
    model: "gemini-test",
  });
  // Unknown facts stay pending: no "Não", "Nenhum" or "0".
  expect(answers).toEqual([]);
});
it("scopes answers to the exact CV, destination and active authorization", async () => {
  const w = workspace();
  const answers = await prepareAutomaticAnswers({
    profile: w.profile,
    resume,
    job,
    destinationUrl,
    questions: ["Possui familiar?"],
    options: { "Possui familiar?": ["Sim", "Não", "Prefiro não responder"] },
  });
  const application = {
    resumeId: resume.id,
    automaticAnswers: answers,
  } as Application;
  expect(
    applicationAnswerProfile(w.profile, application, destinationUrl)
      .approvedAnswers,
  ).toHaveLength(1);
  expect(
    applicationAnswerProfile(w.profile, application, "https://other.test/apply")
      .approvedAnswers,
  ).toEqual([]);
  expect(
    applicationAnswerProfile(
      w.profile,
      { ...application, resumeId: "changed" },
      destinationUrl,
    ).approvedAnswers,
  ).toEqual([]);
  w.profile.answerPolicy!.enabled = false;
  expect(applicationAnswerProfile(w.profile, application, destinationUrl).approvedAnswers).toEqual([]);
});
it.each([true, false])("does not transmit saved answers for other vacancies (automation=%s)", enabled => {
  const w = workspace();
  w.profile.answerPolicy!.enabled = enabled;
  const common = { aliases: [], confirmedAt: new Date().toISOString(), value: "private-value" };
  w.profile.approvedAnswers = [
    { ...common, id: "other-employer", question: "Projeto", destinationUrl: "https://other.example/apply" },
    { ...common, id: "other-vacancy", question: "Experiência", destinationUrl: "https://example.test/another-job" },
    { ...common, id: "sensitive-unscoped", question: "CPF" },
    { ...common, id: "this-vacancy", question: "CPF", destinationUrl },
    { ...common, id: "reusable", question: "Portfólio" },
  ];
  const profile = applicationAnswerProfile(w.profile, { resumeId: "resume" } as Application, destinationUrl);
  expect(profile.approvedAnswers?.map(a => a.id)).toEqual(["this-vacancy", "reusable"]);
  expect(w.profile.approvedAnswers).toHaveLength(5);
});
