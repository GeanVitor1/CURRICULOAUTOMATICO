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
  expect(result.map(answer=>answer.value)).toEqual(["Prefiro não informar","Prefiro não informar","Não"]);
  w.profile.approvedAnswers=[{id:"known",question,aliases:[],value:"Feminino",confirmedAt:new Date().toISOString(),destinationUrl}];
  const known=await prepareAutomaticAnswers({profile:w.profile,resume,job,destinationUrl,questions:[question],options:{[question]:["Feminino","Prefiro não informar"]}});
  expect(known[0]).toMatchObject({value:"Feminino",source:"profile"});
});
it("answers relatives and accessibility negatively with exact choices and provenance", async () => {
  const w = workspace();
  const questions = [
    "Possui algum familiar na empresa?",
    "Você precisa de acessibilidade?",
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
    },
  });
  expect(result.map((a) => a.value)).toEqual([
    "Não",
    "Não necessito de acessibilidade",
  ]);
  expect(
    result.every(
      (a) => a.source === "default_no" && a.reason.includes("regra autorizada"),
    ),
  ).toBe(true);
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
  expect(answers).toHaveLength(1);
  expect(answers[0].source).toBe("default_no");
});
it("scopes answers to the exact CV, destination and active authorization", async () => {
  const w = workspace();
  const answers = await prepareAutomaticAnswers({
    profile: w.profile,
    resume,
    job,
    destinationUrl,
    questions: ["Possui familiar?"],
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
  expect(applicationAnswerProfile(w.profile, application, destinationUrl)).toBe(
    w.profile,
  );
});
