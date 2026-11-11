import { describe, expect, it } from "vitest";
import { classifyQuestion, groupPendingQuestions, normalizedText, resolveMemoryAnswer, effectiveAnswerMemory, pendingDigest, type AnswerMemoryEntry } from "../shared/answer-topics";
import { normalized } from "../server/job-identity";
import { memoryAnswer } from "../server/answer-topics";
import type { Profile } from "../shared/types";

const entry = (e: Partial<AnswerMemoryEntry>): AnswerMemoryEntry => ({ id: "m", topic: "relocation_willingness", value: "yes", source: "user", confirmedAt: "2026-01-01T00:00:00.000Z", examples: [], ...e });

describe("classifyQuestion", () => {
  it("treats equivalent relocation questions as one topic", () => {
    for (const q of ["Aceita realocação?", "Tem disponibilidade para mudança?", "Está disposto a residir em outra cidade?", "Are you willing to relocate?"])
      expect(classifyQuestion(q)?.topic, q).toBe("relocation_willingness");
  });
  it("detects other topics and params", () => {
    expect(classifyQuestion("Você aceita contratação PJ?")).toEqual({ topic: "contract_type", params: { contract: "pj" } });
    expect(classifyQuestion("Aceita trabalho presencial?")).toEqual({ topic: "work_modality", params: { modality: "presencial" } });
    expect(classifyQuestion("Qual seu nível de inglês?")?.topic).toBe("english_level");
    expect(classifyQuestion("Quantos anos de experiência com React você possui?")).toEqual({ topic: "tech_experience_years", params: { technology: "react" } });
    expect(classifyQuestion("Possui CNH categoria B?")?.topic).toBe("driver_license");
    expect(classifyQuestion("Descreva um projeto")).toBeNull();
  });
  it("normalizes exactly like job-identity", () => {
    for (const s of ["Aceita realocação? *", "C# / .NET Sênior"]) expect(normalizedText(s)).toBe(normalized(s));
  });
});

describe("resolveMemoryAnswer", () => {
  const relocation = classifyQuestion("Aceita realocação?")!;
  it("maps a known value to the form options", () => {
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, [entry({})], {}, ["Sim", "Não"])?.value).toBe("Sim");
    expect(resolveMemoryAnswer("Are you willing to relocate?", relocation, [entry({ value: "no" })], {}, ["Yes", "No"])?.value).toBe("No");
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, [entry({})], {})?.value).toBe("Sim");
  });
  it("applies conditions only when the job context matches", () => {
    const memory = [entry({ value: "conditional", conditions: { cities: ["Curitiba", "São Paulo"] } })];
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, memory, { location: "São Paulo, SP" }, ["Sim", "Não"])?.value).toBe("Sim");
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, memory, { location: "Recife, PE" }, ["Sim", "Não"])).toBeUndefined();
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, memory, {}, ["Sim", "Não"])).toBeUndefined();
  });
  it("returns unknown when the value cannot map to an option or reuse is off", () => {
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, [entry({})], {}, ["Talvez"])).toBeUndefined();
    expect(resolveMemoryAnswer("Aceita realocação?", relocation, [entry({ reuse: false })], {}, ["Sim", "Não"])).toBeUndefined();
  });
  it("maps modality, contract and levels", () => {
    const modality = [entry({ topic: "work_modality", value: "remoto,hibrido" })];
    expect(resolveMemoryAnswer("Aceita trabalho presencial?", classifyQuestion("Aceita trabalho presencial?")!, modality, {}, ["Sim", "Não"])?.value).toBe("Não");
    expect(resolveMemoryAnswer("Modelo de trabalho", classifyQuestion("Modelo de trabalho")!, modality, {}, ["Presencial", "Híbrido"])?.value).toBe("Híbrido");
    const contract = [entry({ topic: "contract_type", value: "clt,pj" })];
    expect(resolveMemoryAnswer("Aceita PJ?", classifyQuestion("Aceita PJ?")!, contract, {}, ["Sim", "Não"])?.value).toBe("Sim");
    const english = [entry({ topic: "english_level", value: "Avançado" })];
    expect(resolveMemoryAnswer("English level", classifyQuestion("English level")!, english, {}, ["Basic", "Intermediate", "Advanced"])?.value).toBe("Advanced");
  });
  it("derives memory from existing preferences and salary through the server", () => {
    const profile = { confirmed: true, candidateDetailsConfirmedAt: "2026-01-01", salaryDesired: 8000, skills: [], applicationPreferences: { english: "Intermediário I", confirmedAt: "2026-01-01" } } as unknown as Profile;
    expect(effectiveAnswerMemory(profile).map((m) => m.topic)).toEqual(["english_level", "salary_expectation"]);
    expect(memoryAnswer("Pretensão salarial", profile, { location: "", modality: "", title: "" })?.value).toBe("8000");
    expect(memoryAnswer("Qual seu nível de inglês?", profile, { location: "", modality: "", title: "" }, ["Básico", "Intermediário", "Avançado"])?.value).toBe("Intermediário");
  });
});

describe("groupPendingQuestions", () => {
  it("groups equivalent pending questions across applications", () => {
    const groups = groupPendingQuestions([
      { id: "a", status: "Requer ação manual", missingQuestions: ["Aceita realocação?", "Descreva um projeto"] },
      { id: "b", status: "Requer ação manual", missingQuestions: ["Are you willing to relocate?"], questionOptions: { "Are you willing to relocate?": ["Yes", "No"] } },
      { id: "c", status: "Enviada", missingQuestions: ["Aceita realocação?"] },
    ]);
    expect(groups[0]).toMatchObject({ key: "relocation_willingness", applicationIds: ["a", "b"], options: ["Yes", "No"] });
    expect(groups).toHaveLength(2);
    expect(pendingDigest(groups)).toContain("Só precisamos de 2 respostas");
  });
});

describe("releasePending", () => {
  it("one answer releases every application waiting on the same topic, others stay pending", async () => {
    const { createWorkspace } = await import("../server/workspace");
    const { upsertMemory, releasePending } = await import("../server/answer-memory");
    const w = createWorkspace("Pessoa", "fixture@example.test");
    w.profile.confirmed = true;
    const job = (id: string, location: string) => ({ id, title: "Dev", company: "X", location, modality: "Presencial", source: "LinkedIn", url: `https://x.test/${id}` }) as any;
    const app = (id: string, jobId: string, missingQuestions: string[]) => ({ id, jobId, status: "Requer ação manual", destinationUrl: `https://ats.test/${id}`, missingQuestions, questionOptions: {}, history: [], receipt: null }) as any;
    w.jobs = [job("j1", "São Paulo, SP"), job("j2", "Curitiba, PR"), job("j3", "Recife, PE")];
    w.applications = [app("a1", "j1", ["Aceita realocação?"]), app("a2", "j2", ["Are you willing to relocate?"]), app("a3", "j3", ["Tem disponibilidade para mudança?"])];
    upsertMemory(w, { topic: "relocation_willingness", value: "conditional", conditions: { cities: ["São Paulo", "Curitiba"] } });
    expect(releasePending(w).sort()).toEqual(["a1", "a2"]);
    expect(w.applications.map((a) => a.status)).toEqual(["Aguardando aprovação", "Aguardando aprovação", "Requer ação manual"]);
    expect(w.profile.approvedAnswers?.map((a) => [a.question, a.value, a.destinationUrl])).toEqual([
      ["Aceita realocação?", "Sim", "https://ats.test/a1"], ["Are you willing to relocate?", "Yes", "https://ats.test/a2"]]);
  });
});

import { classifyQuestion as cq, resolveMemoryAnswer as rma } from "../shared/answer-topics";
import { it as it2, expect as ex2 } from "vitest";
it2("usa a faixa salarial escolhida quando ela é uma das opções", () => {
  const q = "Qual a sua expectativa salarial (valor bruto CLT)?";
  const opts = ["Até 3.000,00", "Entre 3.001,00 e 4.000,00", "Entre 4.001,00 e 5.000,00", "Acima de 5.000,00"];
  const entry = { id: "s", topic: "salary_expectation", value: "Entre 4.001,00 e 5.000,00", source: "user", confirmedAt: "2026-11-11T00:00:00Z", examples: [q] } as any;
  ex2(rma(q, cq(q)!, [entry], {}, opts)?.value).toBe("Entre 4.001,00 e 5.000,00");
  ex2(rma(q, cq(q)!, [{ ...entry, value: "R$ 8.000,00" }], {}, undefined)?.value).toBe("8000");
});
