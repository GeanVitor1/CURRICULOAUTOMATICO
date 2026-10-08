import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
const state = vi.hoisted(() => ({
  config: {
    userId: "user",
    enabled: true,
    provider: "zen",
    model: "ling-3.1-flash-free",
    consent: true,
    encryptedKey: null as string | null,
  },
}));
vi.mock("../server/db", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  return {
    dataDir: mkdtempSync(join(tmpdir(), "orbita-intelligence-tests-")),
    db: {
      select: () => ({ from: () => ({ where: async () => [state.config] }) }),
    },
  };
});
import { dataDir } from "../server/db";
import {
  analyzeJobMatch,
  analyzeResume,
  clearAnalysisCache,
  listZenModels,
  minimizeResume,
  providers,
  requestIntelligence,
  verifyEvidence,
} from "../server/intelligence";
import { defaultFilters, defaultProfile, type Job } from "../shared/types";
const modelResponse = () =>
  new Response(
    JSON.stringify({
      data: [
        { id: "ling-3.1-flash-free" },
        { id: "nemotron-3-ultra-free" },
        { id: "paid-model" },
      ],
    }),
  );
const extracted = {
  fields: [],
  skills: [
    { name: "Atendimento ao público", evidence: "atendimento ao público" },
  ],
  years: null,
  yearsEvidence: "",
};
const chatResponse = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(content) },
        },
      ],
      usage: { total_tokens: 42 },
    }),
  );
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  state.config.consent = true;
  clearAnalysisCache("user");
});
afterAll(async () => {
  if (/orbita-intelligence-tests-/.test(dataDir))
    await rm(dataDir, { recursive: true, force: true });
});
describe("OpenCode Zen real transport contract and privacy", () => {
  it("explica a restrição do plano gratuito sem tentar burlar o provedor", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message:
                "OpenCode's free tier can only be used from within OpenCode",
            },
          }),
          { status: 403 },
        ),
      );
    await expect(
      requestIntelligence("https://opencode.ai/zen/v1/chat/completions", {
        method: "POST",
      }),
    ).rejects.toThrow("só pode ser usado dentro do OpenCode");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("minimiza identificação, contatos, documentos e links preservando fatos profissionais", () => {
    const result = minimizeResume(
      "Maria da Silva\nNome: Maria da Silva\nCPF: 123.456.789-00\nEndereço: Rua Um 99\nEmail: maria@example.com\nCelular: (31) 99999-8888\nEnsino médio completo\nExperiência: atendimento ao público\nPortfolio https://example.com/me",
    );
    expect(result).not.toMatch(
      /Maria|123\.456|Rua Um|maria@example|99999|https:/,
    );
    expect(result).toContain("Ensino médio completo");
    expect(result).toContain("atendimento ao público");
  });
  it("descobre modelos disponíveis sem prometer gratuidade de modelos pagos e bloqueia trial de dados pessoais", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(modelResponse());
    const models = await listZenModels(true);
    expect(models.map((m) => m.id)).not.toContain("paid-model");
    expect(models.find((m) => m.id.includes("nemotron"))?.resumeEligible).toBe(
      false,
    );
  });
  it("envia somente dados minimizados com segredo do servidor e JSON validado", async () => {
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "backend-key-for-test");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(chatResponse(extracted));
    const result = await analyzeResume(
      "user",
      "Nome: Maria\nEmail: maria@example.com\nExperiência: atendimento ao público",
    );
    expect(result.method).toBe("zen");
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect((options?.headers as any).Authorization).toBe(
      "Bearer backend-key-for-test",
    );
    const payload = JSON.parse(String(options?.body));
    expect(payload.messages[1].content).not.toMatch(/Maria|maria@example/);
    expect(result.profile.skills).toContain("Atendimento ao público");
    expect(JSON.stringify(result)).not.toContain("backend-key");
  });
  it("não transmite qualquer currículo sem consentimento e mantém análise local", async () => {
    state.config.consent = false;
    const fetch = vi.spyOn(globalThis, "fetch");
    expect((await analyzeResume("user", "Ensino médio completo")).method).toBe(
      "local",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cacheia análise por usuário e não duplica chamadas externas", async () => {
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "backend-key-for-test");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(chatResponse(extracted));
    const text = "Experiência: atendimento ao público";
    await analyzeResume("user", text);
    await analyzeResume("user", text);
    expect(mock).toHaveBeenCalledTimes(1);
    await analyzeResume("other-user", text);
    expect(mock).toHaveBeenCalledTimes(2);
    clearAnalysisCache("other-user");
  });
  it("falha de credencial não faz retry e nunca gera sugestões artificiais", async () => {
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "backend-key-for-test");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("upstream secret content", { status: 401 }),
      );
    const result = await analyzeResume("user", "Ensino médio completo");
    expect(result.method).toBe("local");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("upstream secret");
  });
  it("rejeita JSON inválido e afirmações sem evidência literal", async () => {
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "backend-key-for-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      chatResponse({ skills: "inventado" }),
    );
    expect((await analyzeResume("user", "Ensino médio completo")).method).toBe(
      "local",
    );
    expect(
      verifyEvidence(
        {
          ...extracted,
          skills: [{ name: "Enfermagem", evidence: "Atendimento ao público" }],
        },
        "Atendimento ao público",
      ).skills,
    ).toEqual([]);
  });
  it("retry com backoff recupera HTTP temporário", async () => {
    vi.useFakeTimers();
    try {
      const mock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
        .mockResolvedValueOnce(new Response('{"ok":true}'));
      const request = requestIntelligence("https://opencode.ai/zen/v1/models");
      await vi.runAllTimersAsync();
      expect(await request).toEqual({ ok: true });
      expect(mock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("limita chamadas simultâneas e libera a fila ao concluir", async () => {
    vi.useFakeTimers();
    try {
      let running = 0,
        maximum = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        running++;
        maximum = Math.max(maximum, running);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running--;
        return new Response('{"ok":true}');
      });
      const pending = Promise.all(
        Array.from({ length: 7 }, () =>
          requestIntelligence("https://opencode.ai/zen/v1/models"),
        ),
      );
      await vi.runAllTimersAsync();
      expect((await pending).length).toBe(7);
      expect(maximum).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("usa citações na interpretação da vaga e preserva bloqueios obrigatórios", async () => {
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "backend-key-for-test");
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      chatResponse({
        explanation: "O registro profissional precisa de confirmação.",
        evidence: [{ source: "job", quote: "COREN ativo obrigatório" }],
      }),
    );
    const job: Job = {
      id: "nursing",
      title: "Técnico de enfermagem",
      company: "Hospital",
      source: "Manual",
      url: "",
      description: "Enfermagem com COREN ativo obrigatório",
      location: "Brasil",
      modality: "Presencial",
      level: "Não especificado",
      contract: "CLT",
      salaryMin: null,
      salaryMax: null,
      currency: "BRL",
      skills: ["Enfermagem"],
      requiredSkills: [],
      requiredYears: null,
      publishedAt: null,
      discoveredAt: "2026-10-08",
      saved: false,
      discarded: false,
      origins: [],
      match: {} as any,
      demo: false,
    };
    const match = await analyzeJobMatch(
      "user",
      {
        ...defaultProfile,
        headline: "Enfermagem",
        skills: ["Enfermagem"],
        confirmed: true,
      },
      job,
      defaultFilters,
    );
    expect(mock).toHaveBeenCalled();
    expect(match.blockers.join()).toContain("COREN");
    expect(match.score).toBeLessThan(50);
    expect(match.explanation).toContain("Leitura complementar por IA");
    expect(match.advice?.signature).toBeTruthy();
  });
});
