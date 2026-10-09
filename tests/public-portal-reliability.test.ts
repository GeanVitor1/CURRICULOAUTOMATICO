import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPublicPortalCache,
  discoverPublicPortal,
} from "../server/public-portal-discovery";
import { createWorkspace } from "../server/workspace";

const workspace = () => {
  const value = createWorkspace("Teste", "private@example.test");
  value.filters.titles = ["Desenvolvedor .NET"];
  return value;
};
beforeEach(() => vi.stubEnv("PORTAL_DISCOVERY_AUTHORIZED", "linkedin"));
const listing = {
  id: 123,
  name: "Desenvolvedor .NET",
  careerPageName: "Organização",
  jobUrl: "https://empresa.gupy.io/jobs/123",
  description: "Desenvolvimento de aplicações .NET e atendimento ao público.",
  city: "Ilhéus",
  state: "Bahia",
};
const body = () => JSON.stringify({ data: [listing] });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  clearPublicPortalCache();
});

describe("Confiabilidade e limites das consultas públicas", () => {
  it("consulta a segunda página e deduplica anúncios entre páginas", async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({
      ...listing,
      id: index + 1,
      jobUrl: `https://empresa.gupy.io/jobs/${index + 1}`,
    }));
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: first, pagination: { total: 51 } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              first[0],
              { ...listing, id: 51, jobUrl: "https://empresa.gupy.io/jobs/51" },
            ],
            pagination: { total: 51 },
          }),
        ),
      );
    const result = await discoverPublicPortal("gupy", workspace());
    expect(result.jobs).toHaveLength(51);
    expect(
      new URL(String(fetcher.mock.calls[1][0])).searchParams.get("offset"),
    ).toBe("50");
  });
  it("diferencia anúncios malformados de um resultado vazio", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 12 }] })),
    );
    await expect(discoverPublicPortal("gupy", workspace())).rejects.toThrow(
      "anúncios inválidos",
    );
  });
  it("respeita Retry-After e não repete uma fonte em cooldown", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "Retry-After": "120" } }),
      );
    await expect(discoverPublicPortal("gupy", workspace())).rejects.toThrow(
      "HTTP 429",
    );
    const next = workspace();
    next.filters.titles = ["Atendente"];
    await expect(discoverPublicPortal("gupy", next)).rejects.toThrow("Aguarde");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("interrompe antes de ler um corpo anunciado acima do limite", async () => {
    const cancelled = vi.fn();
    const pulled = vi.fn();
    const stream = new ReadableStream<Uint8Array>(
      { pull: pulled, cancel: cancelled },
      { highWaterMark: 0 },
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { headers: { "content-length": "3000001" } }),
    );
    await expect(discoverPublicPortal("gupy", workspace())).rejects.toThrow(
      "excedeu o limite",
    );
    expect(pulled).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("limita bytes durante o download mesmo sem Content-Length", async () => {
    const cancelled = vi.fn();
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(1600000));
        },
        cancel: cancelled,
      },
      { highWaterMark: 0 },
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
    await expect(discoverPublicPortal("gupy", workspace())).rejects.toThrow(
      "excedeu o limite",
    );
    expect(reads).toBe(2);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("preserva caracteres UTF-8 divididos entre chunks", async () => {
    const encoded = new TextEncoder().encode(body());
    const split = encoded.findIndex((byte) => byte === 0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, split));
        controller.enqueue(encoded.slice(split));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
    const result = await discoverPublicPortal("gupy", workspace());
    expect(result.jobs[0].company).toBe("Organização");
    expect(result.jobs[0].location).toBe("Ilhéus, Bahia");
    expect(result.jobs[0].description).toContain("público");
  });

  it("não expõe erros internos de leitura e permite uma nova tentativa", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("https://private.test/?token=secret"));
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(stream))
      .mockResolvedValueOnce(new Response(body()));
    await expect(discoverPublicPortal("gupy", workspace())).rejects.toThrow(
      "Não foi possível ler a página pública",
    );
    expect((await discoverPublicPortal("gupy", workspace())).jobs).toHaveLength(
      1,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesce consultas simultâneas e isola os objetos devolvidos", async () => {
    let release!: (response: Response) => void;
    const waiting = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(waiting);
    const first = discoverPublicPortal("gupy", workspace());
    const second = discoverPublicPortal("gupy", workspace());
    release(new Response(body()));
    const [one, two] = await Promise.all([first, second]);
    one.jobs[0].saved = true;
    expect(two.jobs[0].saved).toBe(false);
    const cached = await discoverPublicPortal("gupy", workspace());
    expect(cached.cached).toBe(true);
    expect(cached.jobs[0].saved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encerra os próximos cargos depois de um HTTP 429 nos detalhes", async () => {
    const cards = Array.from(
      { length: 6 },
      (_, index) =>
        `<li><div data-entity-urn="urn:li:jobPosting:${index + 1}"><h3 class="base-search-card__title">Desenvolvedor .NET</h3><h4 class="base-search-card__subtitle">Empresa</h4><span class="job-search-card__location">Brasil</span></div></li>`,
    ).join("");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url).includes("jobPosting/")
          ? new Response("rate limited", { status: 429 })
          : new Response(cards),
      );
    const value = workspace();
    value.filters.titles.push("Analista de sistemas");
    const result = await discoverPublicPortal("linkedin", value);
    expect(result.jobs).toHaveLength(6);
    expect(result.jobs.every((job) => job.skills.length === 0)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("seeMoreJobPostings"),
      ),
    ).toHaveLength(1);
  });
});
