import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverPortal } from "../server/portal-discovery";
import { searchAntigravity } from "../server/antigravity";
import { createWorkspace } from "../server/workspace";
import type { Source } from "../shared/types";

vi.mock("../server/antigravity", () => ({
  antigravityAvailable: (id?: string) => id === "owner",
  searchAntigravity: vi.fn(),
}));
const citation =
  "https://vertexaisearch.cloud.google.com/grounding-api-redirect/" +
  "a".repeat(40);
const url = "https://www.linkedin.com/jobs/view/1234567890";
const job = {
  title: "Desenvolvedor full stack",
  company: "Empresa",
  location: "Brasil",
  description: "Desenvolvimento TypeScript em contrato CLT remoto.",
  url: citation,
  citationUrl: citation,
};
const source: Source = {
  id: "source",
  type: "portal",
  board: "linkedin",
  company: "LinkedIn",
  enabled: true,
  discovery: true,
  application: false,
  status: "",
};
const w = () => {
  const value = createWorkspace("Teste", "synthetic@example.test");
  value.filters.titles = ["Desenvolvedor full stack"];
  return value;
};
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("PORTAL_DISCOVERY_AUTHORIZED", "");
  vi.mocked(searchAntigravity).mockResolvedValue({
    jobs: [job],
    verifiedUrls: new Set(),
    googleCitationUrls: new Set([citation]),
    searchPerformed: true,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Validação independente das referências Antigravity", () => {
  it("aceita uma referência somente após Google resolver para um anúncio individual no portal correto", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: url } }),
      );
    const found = await discoverPortal(source, w(), "owner");
    expect(found.jobs).toHaveLength(1);
    expect(found.jobs[0].url).toBe(url);
    expect(found.method).toBe("busca pública com Antigravity");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe(citation);
    expect(fetch.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("rejeita uma referência inventada que o Google não reconhece", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    await expect(discoverPortal(source, w(), "owner")).rejects.toThrow(
      "não retornou fontes verificáveis",
    );
  });
  it("rejeita uma página de lista, outro domínio ou anúncio diferente da URL declarada", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const destination of [
      "https://www.linkedin.com/jobs/search/",
      "https://evil.test/jobs/123",
    ]) {
      fetch.mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: destination } }),
      );
      await expect(discoverPortal(source, w(), "owner")).rejects.toThrow();
    }
    vi.mocked(searchAntigravity).mockResolvedValue({
      jobs: [{ ...job, url: "https://www.linkedin.com/jobs/view/9999999999" }],
      verifiedUrls: new Set(),
      googleCitationUrls: new Set([citation]),
      searchPerformed: true,
    });
    fetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: url } }),
    );
    await expect(discoverPortal(source, w(), "owner")).rejects.toThrow(
      "nenhum anúncio individual pôde ser confirmado",
    );
    expect(fetch.mock.calls.every((call) => String(call[0]) === citation)).toBe(
      true,
    );
  });
  it("permite uma busca concluída sem resultados, sem criar anúncios fictícios", async () => {
    vi.mocked(searchAntigravity).mockResolvedValue({
      jobs: [],
      verifiedUrls: new Set(),
      googleCitationUrls: new Set(),
      searchPerformed: true,
    });
    expect((await discoverPortal(source, w(), "owner")).jobs).toEqual([]);
  });
});
