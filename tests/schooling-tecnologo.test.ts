import { describe, expect, it } from "vitest";
import { analyze } from "../server/engine";
import { defaultFilters, defaultProfile } from "../shared/types";
const block = "Escolaridade obrigatória não confirmada no perfil.";
const profile: any = { ...defaultProfile, confirmed: true, level: "Júnior",
  education: "Tecnólogo em Análise e Desenvolvimento de Sistemas\nCentro Universitário Internacional (UNINTER)\nPeríodo: 2025 - Atual" };
const job = (req: string): any => ({ id: "1", title: "Analista de Sistemas", company: "x", level: "Não informado",
  description: `Requisitos obrigatórios:\n- ${req}\n- Conhecimento em C#`, skills: ["C#"], url: "https://x.gupy.io/job/1",
  origins: [], location: "Remoto", modality: "Remoto", contract: "CLT", publishedAt: null, discoveredAt: new Date().toISOString() });
describe("escolaridade de tecnólogo", () => {
  it("tecnólogo cursando atende ensino superior cursando ou completo", () => {
    expect(analyze(job("Ensino superior cursando ou completo em TI"), profile, defaultFilters).blockers).not.toContain(block);
    expect(analyze(job("Graduação em Sistemas de Informação ou áreas afins"), profile, defaultFilters).blockers).not.toContain(block);
  });
  it("vaga que exige superior completo continua bloqueada para quem está cursando", () => {
    expect(analyze(job("Ensino superior completo em TI"), profile, defaultFilters).blockers).toContain(block);
  });
});
