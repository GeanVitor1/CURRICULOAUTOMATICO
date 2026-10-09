import { afterEach, describe, expect, it, vi } from "vitest";
import { applyInterview, interviewSchema } from "../server/career-interview";
import { createWorkspace } from "../server/workspace";
import {
  analyze,
  matchesObjectiveFilters,
  matchesSelectedSites,
} from "../server/engine";
import { defaultFilters, defaultProfile, type Job } from "../shared/types";

const workspace = () => {
  const w = createWorkspace("Pessoa", "test@example.test");
  w.resumes = [
    {
      id: "resume",
      name: "Currículo.pdf",
      uploadedAt: "2026-10-09",
      text: "Desenvolvedor .NET com C#",
      skills: ["C#", ".NET"],
      approved: false,
      analysis: "",
      suggestion: { headline: "Desenvolvedor .NET", skills: ["C#", ".NET"] },
    },
  ];
  return w;
};
const answers = {
  resumeId: "resume",
  titles: ["Desenvolvedor .NET"],
  modalities: ["Remoto", "Presencial"],
  city: "Ilhéus, BA",
  sameCityOnly: true,
  salaryMin: 5000,
  salaryMax: 10000,
  includeUnknownSalary: true,
  ageDays: 7,
  contracts: [],
  sites: ["linkedin", "gupy"] as ("linkedin" | "gupy")[],
  dailyLimit: 10,
};
const job: Job = {
  id: "job",
  title: "Desenvolvedor .NET",
  company: "Empresa",
  source: "Manual",
  url: "",
  description: "Desenvolvimento C# e .NET",
  location: "São Paulo, SP, Brasil",
  modality: "Remoto",
  contract: "PJ",
  level: "Pleno",
  salaryMin: 6000,
  salaryMax: 7000,
  salaryPeriod: "month",
  currency: "BRL",
  skills: ["C#", ".NET"],
  requiredSkills: [],
  requiredYears: null,
  publishedAt: new Date(Date.now() - 3600000).toISOString(),
  discoveredAt: "2026-10-09",
  origins: [],
  match: {} as any,
  saved: false,
  discarded: false,
  demo: false,
};
const profile = {
  ...defaultProfile,
  confirmed: true,
  headline: "Desenvolvedor .NET",
  skills: ["C#", ".NET"],
};
afterEach(() => vi.unstubAllEnvs());
describe("Entrevista e filtros simples", () => {
  it("não usa vagas antigas de sites que a pessoa não escolheu", () => {
    const w = workspace();
    applyInterview(
      w,
      interviewSchema.parse({
        step: 5,
        complete: true,
        start: "save",
        answers,
      }),
    );
    expect(
      matchesSelectedSites(
        { ...job, url: "https://empresa.gupy.io/jobs/123" },
        w,
      ),
    ).toBe(true);
    expect(
      matchesSelectedSites(
        { ...job, url: "https://www.infojobs.com.br/vaga-de-dev__123.aspx" },
        w,
      ),
    ).toBe(false);
  });
  it("salva uma entrevista incompleta sem iniciar ou aprovar candidaturas", () => {
    const w = workspace();
    applyInterview(w, interviewSchema.parse({ step: 2, answers }));
    expect(w.interview?.step).toBe(2);
    expect(w.routine.enabled).toBe(false);
    expect(w.resumes[0].approved).toBe(false);
  });
  it("transforma as respostas em critérios únicos e gerencia os sites sem configuração técnica", () => {
    const w = workspace();
    w.filters.skills = ["Excel"];
    w.filters.levels = ["Júnior"];
    w.sources = [
      {
        id: "old",
        type: "jobicy",
        board: "public",
        company: "Jobicy",
        enabled: true,
        application: false,
        discovery: true,
        status: "",
      },
    ];
    applyInterview(
      w,
      interviewSchema.parse({
        step: 5,
        complete: true,
        start: "prepare",
        answers,
      }),
    );
    expect(w.interview?.completed).toBe(true);
    expect(w.profile.confirmed).toBe(true);
    expect(w.resumes[0].approved).toBe(true);
    expect(w.filters).toMatchObject({
      remoteAnywhere: true,
      dateKnownOnly: true,
      ageDays: 7,
      salaryOnly: false,
      skills: [],
      levels: [],
      salaryMin: 5000,
      salaryMax: 10000,
    });
    expect(
      w.sources
        .filter((source) => source.enabled)
        .map((source) => source.board),
    ).toEqual(["linkedin", "gupy"]);
    expect(w.routine).toMatchObject({
      enabled: true,
      mode: "approval",
      dailyLimit: 10,
    });
  });
  it("não ativa envio automático sem conexão e só libera os sites autorizados", () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    const w = workspace();
    expect(() =>
      applyInterview(
        w,
        interviewSchema.parse({
          step: 5,
          complete: true,
          start: "automatic",
          answers,
        }),
      ),
    ).toThrow("ainda não está conectado");
    expect(w.routine.enabled).toBe(false);
    expect(w.resumes[0].approved).toBe(false);
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "true");
    vi.stubEnv(
      "APPLICATION_WEBHOOK_URL",
      "https://authorized.example.test/apply",
    );
    vi.stubEnv("APPLICATION_WEBHOOK_TOKEN", "test-token");
    vi.stubEnv("APPLICATION_WEBHOOK_PORTALS", "linkedin,gupy");
    applyInterview(
      w,
      interviewSchema.parse({
        step: 5,
        complete: true,
        start: "automatic",
        answers,
      }),
    );
    expect(w.routine.mode).toBe("automatic");
  });
  it("uma fonte sem envio não impede ativação das fontes autorizadas", () => {
    const w = workspace();
    applyInterview(
      w,
      interviewSchema.parse({
        step: 5,
        complete: true,
        start: "automatic",
        answers,
      }),
      ["gupy"],
    );
    expect(w.routine.mode).toBe("automatic");
    expect(
      w.sources.find((source) => source.board === "gupy")?.application,
    ).toBe(true);
    expect(
      w.sources.find((source) => source.board === "linkedin")?.application,
    ).toBe(false);
  });
  it("cidade limita presencial e híbrido, sem esconder vaga remota brasileira de outra cidade", () => {
    const filters = {
      ...defaultFilters,
      titles: ["Desenvolvedor .NET"],
      locations: ["Ilhéus, BA"],
      remoteAnywhere: true,
    };
    expect(matchesObjectiveFilters(job, profile, filters)).toBe(true);
    expect(
      matchesObjectiveFilters(
        { ...job, modality: "Presencial" },
        profile,
        filters,
      ),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(
        { ...job, modality: "Híbrido" },
        profile,
        filters,
      ),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(
        { ...job, modality: "Presencial", location: "Ilhéus, BA" },
        profile,
        filters,
      ),
    ).toBe(true);
    expect(
      matchesObjectiveFilters(
        { ...job, location: "United States" },
        profile,
        filters,
      ),
    ).toBe(false);
  });
  it("aplica 24 horas e 3 dias e não inclui anúncio sem data em um período definido", () => {
    expect(
      matchesObjectiveFilters(
        { ...job, publishedAt: "2020-01-01T00:00:00Z" },
        profile,
        { ...defaultFilters, ageDays: 365, dateKnownOnly: false },
      ),
    ).toBe(true);
    const filters = { ...defaultFilters, dateKnownOnly: true, ageDays: 1 };
    expect(matchesObjectiveFilters(job, profile, filters)).toBe(true);
    const old = {
      ...job,
      publishedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    };
    expect(matchesObjectiveFilters(old, profile, filters)).toBe(false);
    expect(
      matchesObjectiveFilters(old, profile, { ...filters, ageDays: 3 }),
    ).toBe(true);
    expect(
      matchesObjectiveFilters({ ...job, publishedAt: null }, profile, filters),
    ).toBe(false);
    expect(
      matchesObjectiveFilters({ ...job, publishedAt: null }, profile, {
        ...filters,
        dateKnownOnly: false,
      }),
    ).toBe(true);
  });
  it("respeita salário anunciado, mínimo/máximo e a remoção do mínimo antigo do perfil", () => {
    const filters = {
      ...defaultFilters,
      salaryMin: 5000,
      salaryMax: 10000,
      salaryOnly: true,
    };
    expect(matchesObjectiveFilters(job, profile, filters)).toBe(true);
    expect(
      matchesObjectiveFilters(
        { ...job, salaryMin: null, salaryMax: null },
        profile,
        filters,
      ),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(
        { ...job, salaryMin: 11000, salaryMax: 12000 },
        profile,
        filters,
      ),
    ).toBe(false);
    expect(
      matchesObjectiveFilters(
        { ...job, salaryMin: 1000, salaryMax: 2000 },
        profile,
        filters,
      ),
    ).toBe(false);
    expect(
      analyze(
        job,
        { ...profile, salaryMin: 10000 },
        { ...filters, salaryMin: 0 },
      ).blockers,
    ).toEqual([]);
  });
});
