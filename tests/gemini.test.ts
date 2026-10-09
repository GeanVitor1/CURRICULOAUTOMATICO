import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { generateGemini, geminiResponseSchema } from "../server/gemini";
import { resumeTargets } from "../server/resume-targets";
import { discoverPortal } from "../server/portal-discovery";
import { createWorkspace } from "../server/workspace";
import { isJobUrl } from "../shared/portals";
import type { Source } from "../shared/types";
import { applicationDraft } from "../server/application-draft";
beforeEach(() => vi.stubEnv("PORTAL_DISCOVERY_AUTHORIZED", "linkedin"));
vi.mock("../server/intelligence", () => ({
  getIntelligence: vi.fn(async () => ({
    provider: "gemini",
    enabled: true,
    consent: true,
    model: "gemini-2.5-flash",
  })),
}));
const response = (text: string, groundingMetadata?: unknown) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text }] },
          groundingMetadata,
        },
      ],
    }),
  );
const source: Source = {
  id: "portal",
  board: "linkedin",
  type: "portal",
  company: "LinkedIn",
  enabled: true,
  discovery: true,
  application: false,
  status: "",
};
const workspace = () => {
  const w = createWorkspace("Pessoa sintética", "teste@example.test");
  w.filters.titles = ["Atendente"];
  w.filters.locations = ["Recife"];
  return w;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("Gemini, sugestões e anúncios verificáveis", () => {
  it("a apresentação não converte experiência negada em um fato positivo", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        JSON.stringify({
          opening: "Interesse no cargo",
          facts: ["experiência com Angular", "Angular"],
          closing: "Agradeço",
        }),
      ),
    );
    const text = await applicationDraft(
      "test-user",
      {
        text: "Competências: C# e .NET.\nNão tenho experiência com\nAngular",
      } as any,
      {
        title: "Desenvolvedor Angular",
        company: "Empresa de teste",
        description: "Angular",
      } as any,
    );
    expect(text).not.toContain("• Angular");
    expect(text).not.toContain("• experiência com Angular");
  });
  it("prepara apresentação só com fatos conferidos e ignora qualificações inventadas pelo modelo", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(
        JSON.stringify({
          opening: "Tenho 20 anos de experiência",
          facts: ["Atendimento ao público", "Graduação em medicina"],
          closing: "Disponível para mudar para outro país",
        }),
      ),
    );
    const text = await applicationDraft(
      "test-user",
      {
        text: "Nome: Pessoa sintética\nExperiência: Atendimento ao público",
      } as any,
      {
        title: "Atendente",
        company: "Loja de teste",
        description: "Atendimento no balcão",
      } as any,
    );
    expect(text).toContain("Atendimento ao público");
    expect(text).not.toMatch(
      /20 anos|medicina|mudar para outro país|Pessoa sintética/,
    );
    expect(text).toContain("Tenho interesse na vaga de Atendente");
  });
  it("repete uma indisponibilidade temporária do Google sem trocar o modelo", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(response("ok"));
    expect((await generateGemini("texto fictício")).text).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[0][0]).toBe(mock.mock.calls[1][0]);
  });
  it("envia esquema simples sem limites que excedem a capacidade do Google", () => {
    expect(
      geminiResponseSchema({
        type: "object",
        properties: {
          years: {
            anyOf: [
              { type: "number", minimum: 0, maximum: 70 },
              { type: "null" },
            ],
          },
          skills: {
            type: "array",
            maxItems: 60,
            items: { type: "string", maxLength: 100 },
          },
        },
        required: ["years", "skills"],
      }),
    ).toEqual({
      type: "object",
      properties: {
        years: { anyOf: [{ type: "number" }, { type: "null" }] },
        skills: { type: "array", items: { type: "string" } },
      },
      required: ["years", "skills"],
    });
  });
  it("envia a chave apenas em header e preserva erros sem expor segredos", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response("ok"));
    expect((await generateGemini("texto fictício")).text).toBe("ok");
    expect(String(mock.mock.calls[0][0])).not.toContain("secret-for-test");
    expect((mock.mock.calls[0][1]?.headers as any)["x-goog-api-key"]).toBe(
      "secret-for-test",
    );
    mock.mockResolvedValue(
      new Response("secret upstream payload", { status: 429 }),
    );
    await expect(generateGemini("teste")).rejects.toThrow("cota");
  });
  it("sugere cargos de qualquer área somente com evidência e remove contato antes da chamada", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      response(
        JSON.stringify({
          targets: [
            {
              title: "Eletricista",
              reason: "Experiência em instalações",
              evidence: "Experiência: instalações elétricas",
              caution: "Confira a formação exigida",
            },
            {
              title: "Médico",
              reason: "Inventada",
              evidence: "Graduação em medicina",
              caution: "",
            },
          ],
        }),
      ),
    );
    const result = await resumeTargets(
      "Nome: Maria\nEmail: maria@example.test\nCPF: 123.456.789-00\nExperiência: instalações elétricas",
      {},
      "gemini",
    );
    expect(result.targets.map((t) => t.title)).toEqual(["Eletricista"]);
    const payload = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(payload.contents[0].parts[0].text).not.toMatch(
      /Maria|maria@example|123.456/,
    );
  });
  it("mantém sugestões locais quando a API falha e não inventa cargos para currículo vazio", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 403 }),
    );
    expect(
      (await resumeTargets("Experiência: operador de caixa", {}, "gemini"))
        .method,
    ).toBe("local");
    expect(
      (await resumeTargets("Ensino médio completo", {}, "local")).targets,
    ).toEqual([]);
  });
  it("aceita anúncio citado, rejeita link inventado e não cria salários nem data de publicação", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    const real = "https://www.linkedin.com/jobs/view/atendente-at-loja-12345";
    const invented =
      "https://www.linkedin.com/jobs/view/atendente-at-outra-99999";
    const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      response(
        JSON.stringify({
          jobs: [real, invented].map((url) => ({
            title: "Atendente",
            company: "Loja",
            url,
            location: "Recife",
            description: "Atendimento ao público no balcão da loja.",
          })),
        }),
        {
          webSearchQueries: ["Atendente Recife"],
          groundingChunks: [
            {
              web: {
                uri: "https://br.linkedin.com/jobs/view/atendente-at-loja-12345",
              },
            },
          ],
        },
      ),
    );
    const w = workspace();
    w.profile.email = "private@example.test";
    const result = await discoverPortal(source, w);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      url: real,
      salaryMin: null,
      publishedAt: null,
      availability: "unknown",
      demo: false,
    });
    expect(String(mock.mock.calls[0][1]?.body)).not.toContain(
      "private@example.test",
    );
  });
  it("exige consulta real e bloqueia fontes ou redirecionamentos arbitrários", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-for-test");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => response('{"jobs":[]}'));
    await expect(discoverPortal(source, workspace())).rejects.toThrow(
      "fontes verificáveis",
    );
    mock.mockClear();
    await expect(
      discoverPortal({ ...source, board: "localhost" }, workspace()),
    ).rejects.toThrow("portal disponível");
    expect(mock).not.toHaveBeenCalled();
    expect(
      isJobUrl("linkedin", "https://linkedin.com.evil.test/jobs/view/123"),
    ).toBe(false);
    expect(isJobUrl("linkedin", "https://www.linkedin.com/jobs/search/")).toBe(
      false,
    );
    expect(
      isJobUrl(
        "infojobs",
        "https://www.infojobs.com.br/vaga-de-caixa__123.aspx",
      ),
    ).toBe(true);
  });
});
