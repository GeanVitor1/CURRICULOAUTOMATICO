import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { discoverPortal } from "../server/portal-discovery";
import { createWorkspace } from "../server/workspace";
import { isJobUrl } from "../shared/portals";
import type { Source } from "../shared/types";
import { clearPublicPortalCache } from "../server/public-portal-discovery";
beforeEach(() => vi.stubEnv("PORTAL_DISCOVERY_AUTHORIZED", "linkedin"));

const source: Source = {
  id: "public",
  type: "portal",
  company: "Gupy",
  board: "gupy",
  enabled: true,
  discovery: true,
  application: false,
  status: "",
};
const workspace = () => {
  const w = createWorkspace("Teste", "private@example.test");
  w.filters.titles = ["Desenvolvedor .NET"];
  return w;
};
const item = {
  id: 123,
  name: "Desenvolvedor .NET",
  careerPageName: "Empresa",
  jobUrl: "https://empresa.gupy.io/job/eyJqb2JJZCI6MTIzfQ==",
  description:
    "Desenvolvimento C# e ASP.NET Core. Contrato PJ. Experiência mínima de 2 anos.",
  city: "Ilhéus",
  state: "Bahia",
  workplaceType: "on-site",
  publishedDate: "2026-10-08T12:00:00Z",
};
const html = (data: unknown[]) =>
  JSON.stringify({
    data,
    pagination: { limit: 50, offset: 0, total: data.length },
  });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  clearPublicPortalCache();
});
describe("Consulta pública sem Gemini", () => {
  it("lê anúncios publicados na Gupy, preserva requisitos e rejeita links alheios e expirados", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(
            html([
              item,
              { ...item, id: 999, jobUrl: "https://evil.test/jobs/999" },
              { ...item, id: 888, applicationDeadline: "2020-01-01" },
            ]),
          ),
      );
    const result = await discoverPortal(source, workspace());
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      title: item.name,
      company: "Empresa",
      location: "Ilhéus, Bahia",
      modality: "Presencial",
      contract: "PJ",
      requiredYears: 2,
      salaryMin: null,
      availability: "unknown",
      demo: false,
    });
    expect(result.jobs[0].skills).toContain(".NET");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0][0])).not.toContain("private@example.test");
  });
  it("distingue zero anúncios de página bloqueada ou formato alterado", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(html([])));
    expect((await discoverPortal(source, workspace())).jobs).toEqual([]);
    clearPublicPortalCache();
    mock.mockImplementation(async () => new Response("<h1>Login</h1>"));
    await expect(discoverPortal(source, workspace())).rejects.toThrow(
      "mudou o formato",
    );
    mock.mockImplementation(
      async () => new Response("blocked", { status: 403 }),
    );
    await expect(discoverPortal(source, workspace())).rejects.toThrow(
      "HTTP 403",
    );
  });
  it("consulta cada cargo separadamente e não duplica o mesmo anúncio", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(html([item])));
    const w = workspace();
    w.filters.titles.push("Analista de sistemas");
    expect((await discoverPortal(source, w)).jobs).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(
      mock.mock.calls.map((call) =>
        new URL(String(call[0])).searchParams.get("jobName"),
      ),
    ).toEqual(["Desenvolvedor .NET", "Analista de sistemas"]);
  });
  it("aceita o novo link da Gupy mantendo domínio, HTTPS e anúncio individual obrigatórios", () => {
    expect(
      isJobUrl(
        "glassdoor",
        "https://www.glassdoor.com.br/job-listing/desenvolvedor-empresa.htm?jl=12345",
      ),
    ).toBe(true);
    expect(
      isJobUrl(
        "glassdoor",
        "https://www.glassdoor.com/job-listing/desenvolvedor-empresa.htm?jl=12345",
      ),
    ).toBe(true);
    expect(
      isJobUrl(
        "glassdoor",
        "https://glassdoor.com.evil.test/job-listing/fake.htm?jl=12345",
      ),
    ).toBe(false);
    expect(isJobUrl("gupy", item.jobUrl)).toBe(true);
    for (const url of [
      "https://gupy.io.evil.test/job/abc",
      "http://empresa.gupy.io/job/abc",
      "https://empresa.gupy.io/jobs/123/malicious",
      "https://portal.gupy.io/job-search/term=dev",
    ])
      expect(isJobUrl("gupy", url)).toBe(false);
  });
  it("preserva a cidade enviada na consulta e reutiliza resultados sem expor dados pessoais", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(html([item])));
    const w = workspace();
    w.filters.locations = ["Ilhéus, BA"];
    const first = await discoverPortal(source, w);
    expect(
      new URL(String(mock.mock.calls[0][0])).searchParams.get("city"),
    ).toBe("Ilhéus");
    first.jobs[0].saved = true;
    const second = await discoverPortal(source, w);
    expect(second.cached).toBe(true);
    expect(second.jobs[0].saved).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("lê o LinkedIn sem Gemini e busca os requisitos no anúncio individual", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const card =
      '<li><div data-entity-urn="urn:li:jobPosting:123"><h3 class="base-search-card__title">Desenvolvedor .NET</h3><h4 class="base-search-card__subtitle">Empresa</h4><span class="job-search-card__location">Ilhéus, Bahia, Brazil</span><time datetime="2026-10-08"></time></div></li>';
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (url) =>
          new Response(
            String(url).includes("jobPosting/")
              ? '<div class="show-more-less-html__markup">C# e .NET. Contrato PJ. Trabalho presencial. Mínimo de 2 anos.</div>'
              : card,
          ),
      );
    const result = await discoverPortal(
      { ...source, board: "linkedin" },
      workspace(),
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      contract: "PJ",
      modality: "Presencial",
      requiredYears: 2,
      url: "https://www.linkedin.com/jobs/view/123",
      publishedAt: "2026-10-08T00:00:00.000Z",
    });
    expect(result.jobs[0].skills).toContain("C#");
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
