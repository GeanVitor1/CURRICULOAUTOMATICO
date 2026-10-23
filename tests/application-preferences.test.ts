import { describe, it, expect } from "vitest";
import { applicationPreferencesSchema } from "../server/application-preferences";
import { candidateAnswer } from "../server/candidate-answers";
import { createWorkspace } from "../server/workspace";

describe("Respostas pessoais nas preferências", () => {
  it("exige confirmação e valida perfil LinkedIn, níveis e escolhas", () => {
    expect(
      applicationPreferencesSchema.safeParse({ english: "Avançado" }).success,
    ).toBe(false);
    expect(
      applicationPreferencesSchema.safeParse({
        confirmation: true,
        linkedin: "https://linkedin.com.evil.test/in/person",
      }).success,
    ).toBe(false);
    expect(
      applicationPreferencesSchema.safeParse({
        confirmation: true,
        english: "inventado",
      }).success,
    ).toBe(false);
    expect(
      applicationPreferencesSchema.safeParse({
        confirmation: true,
        english: "Não falo",
        gcp: "Nenhuma",
      }).success,
    ).toBe(true);
  });
  it("não presume respostas ausentes nem declarações sobre familiares ou consentimentos", () => {
    const profile = createWorkspace("Pessoa", "fixture@example.test").profile;
    profile.confirmed = true;
    profile.applicationPreferences = {
      english: "Intermediário II",
      linkedin: "https://www.linkedin.com/in/person/",
    };
    expect(candidateAnswer("Nível de inglês", profile)).toBeUndefined();
    profile.applicationPreferences.confirmedAt = new Date().toISOString();
    expect(candidateAnswer("Nível de inglês", profile)).toBe(
      "Intermediário II",
    );
    expect(candidateAnswer("LinkedIn URL", profile)).toBe(
      "https://www.linkedin.com/in/person/",
    );
    expect(candidateAnswer("Nível de espanhol", profile)).toBeUndefined();
    expect(
      candidateAnswer("Tem familiares na empresa?", profile),
    ).toBeUndefined();
    expect(candidateAnswer("Aceito os termos", profile)).toBeUndefined();
  });
});
