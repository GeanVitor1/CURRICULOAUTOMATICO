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
