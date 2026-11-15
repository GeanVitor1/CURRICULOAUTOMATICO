import { describe, expect, it } from "vitest";
import { matchOption, releasePending } from "../server/answer-memory";
import { classifyQuestion, topicKey } from "../shared/answer-topics";

const lgpd =
  "Em conformidade com a Lei nº 13.709/2018 (LGPD), os dados enviados abaixo serão utilizados com a finalidade exclusiva de prosseguimento do processo seletivo. Você concorda em compartilhar as informações abaixo?";

function workspace(options?: string[]) {
  return {
    profile: { approvedAnswers: [], answerMemory: [] },
    jobs: [{ id: "j1" }],
    applications: [
      {
        id: "a1",
        jobId: "j1",
        status: "Requer ação manual",
        destinationUrl: "https://empresa.example/vaga",
        missingQuestions: [lgpd],
        questionOptions: options ? { [lgpd]: options } : undefined,
        history: [],
        resumeState: { kind: "ats" },
      },
    ],
  } as any;
}

describe("matchOption", () => {
  it("casa Sim com opção mais longa", () => {
    expect(matchOption("Sim", ["Sim, concordo", "Não concordo"])).toBe("Sim, concordo");
    expect(matchOption("Sim", ["Concordo", "Não concordo"])).toBe("Concordo");
    expect(matchOption("Não", ["Concordo", "Não concordo"])).toBe("Não concordo");
    expect(matchOption("Talvez", ["Sim", "Não"])).toBeUndefined();
  });
});

describe("releasePending com aceite jurídico", () => {
  const key = topicKey(classifyQuestion(lgpd), lgpd);

  it("libera quando o usuário responde explicitamente", () => {
    const w = workspace(["Sim, concordo", "Não concordo"]);
    expect(releasePending(w, { key, value: "Sim" })).toEqual(["a1"]);
    expect(w.profile.approvedAnswers[0].value).toBe("Sim, concordo");
  });

  it("não libera sem resposta explícita", () => {
    const w = workspace(["Sim", "Não"]);
    expect(releasePending(w)).toEqual([]);
  });
});

describe("releasePending com outras perguntas pendentes", () => {
  it("conta a resposta mesmo sem liberar a vaga", () => {
    const key = topicKey(classifyQuestion(lgpd), lgpd);
    const w = workspace(["Sim", "Não"]);
    w.applications[0].missingQuestions.push("Qual sua cor favorita de caneta?");
    const stats = { answered: 0 };
    expect(releasePending(w, { key, value: "Sim" }, stats)).toEqual([]);
    expect(stats.answered).toBe(1);
    expect(w.applications[0].missingQuestions).toEqual(["Qual sua cor favorita de caneta?"]);
  });
});

describe("releasePending atualiza o painel da automação", () => {
  it("zera perguntas pendentes no progresso após responder", () => {
    const key = topicKey(classifyQuestion(lgpd), lgpd);
    const w = workspace(["Sim", "Não"]);
    w.routine = { progress: { blockers: { questions: 2, human: 0, uncertain: 0, nonReceived: 0 } } };
    releasePending(w, { key, value: "Sim" });
    expect(w.routine.progress.blockers.questions).toBe(0);
  });
});
