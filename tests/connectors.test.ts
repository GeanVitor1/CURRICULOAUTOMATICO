import { afterEach, describe, expect, it, vi } from "vitest";
import { connectors, SourceError } from "../server/connectors";
import type { Source } from "../shared/types";
const source = (
  type: Source["type"],
  overrides: Partial<Source> = {},
): Source => ({
  id: "test",
  type,
  company: "Empresa do teste",
  board: "test-board",
  enabled: true,
  discovery: true,
  application: false,
  status: "",
  ...overrides,
});
const response = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("Conectores: contratos oficiais e erros sem vagas artificiais", () => {
  it("Greenhouse preserva URL e namespace, sem tratar atualização como publicação", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        jobs: [
          {
            id: 7,
            title: "Atendente",
            absolute_url: "https://example.test/jobs/7",
            content: "<p>Atendimento &amp; vendas</p>",
            location: { name: "Recife" },
            updated_at: "2026-10-01",
          },
        ],
      }),
    );
    const [job] = await connectors.greenhouse.discover(source("greenhouse"));
    expect(job).toMatchObject({
      title: "Atendente",
      description: "Atendimento & vendas",
      publishedAt: null,
      salaryMin: null,
      demo: false,
    });
    expect(job.origins[0].id).toBe("test-board:7");
  });
  it("Ashby omite não listadas e extrai salário anual sem misturar bônus/equity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        jobs: [
          {
            title: "Administrativo",
            jobUrl: "https://jobs.ashbyhq.com/test-board/abc",
            isListed: true,
            descriptionPlain: "Organização de documentos",
            location: "Brazil",
            workplaceType: "Remote",
            compensation: {
              summaryComponents: [
                {
                  compensationType: "EquityPercentage",
                  minValue: 1,
                  maxValue: 2,
                },
                {
                  compensationType: "Salary",
                  minValue: 24000,
                  maxValue: 30000,
                  currencyCode: "USD",
                  interval: "1 YEAR",
                },
              ],
            },
          },
          { isListed: false },
        ],
      }),
    );
    const jobs = await connectors.ashby.discover(source("ashby"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      salaryMin: 24000,
      salaryMax: 30000,
      currency: "USD",
      salaryPeriod: "1 YEAR",
      modality: "Remoto",
      geographicEligibility: "Brazil",
    });
  });
  it("Jobicy pagina por cursor e preserva restrição geográfica e atribuição", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        response({
          jobs: [
            {
              id: 1,
              companyName: "Employer",
              jobTitle: "Customer Support",
              url: "https://jobicy.com/jobs/1",
              jobDescription: "<p>Help customers</p>",
              jobGeo: "USA",
              salaryMin: 20,
              salaryCurrency: "USD",
              salaryPeriod: "hourly",
            },
          ],
          nextCursor: "opaque/+=",
        }),
      )
      .mockResolvedValueOnce(response({ jobs: [], nextCursor: null }));
    const [job] = await connectors.jobicy.discover(source("jobicy"));
    expect(String(mock.mock.calls[1][0])).toContain("cursor=opaque%2F%2B%3D");
    expect(job).toMatchObject({
      company: "Employer",
      source: "Jobicy",
      url: "https://jobicy.com/jobs/1",
      geographicEligibility: "USA",
      salaryPeriod: "hourly",
    });
  });
  it("HTTP 429 adia retry sem consultar novamente nem devolver mocks", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({}, 429, { "Retry-After": "7200" }));
    await expect(
      connectors.greenhouse.discover(source("greenhouse")),
    ).rejects.toMatchObject({ retryAfterMs: 7200000 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("HTTP 404 e registro sem URL falham claramente", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(
        response({ jobs: [{ id: 1, title: "Vaga sem URL" }] }),
      );
    await expect(
      connectors.greenhouse.discover(source("greenhouse")),
    ).rejects.toThrow("HTTP 404");
    await expect(
      connectors.greenhouse.discover(source("greenhouse")),
    ).rejects.toThrow("URL oficial");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("Adzuna exige credenciais e cobertura declarada sem presumir Brasil", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    const mock = vi.spyOn(globalThis, "fetch");
    await expect(
      connectors.adzuna.discover(source("adzuna", { country: "br" })),
    ).rejects.toBeInstanceOf(SourceError);
    expect(mock).not.toHaveBeenCalled();
    vi.stubEnv("ADZUNA_APP_ID", "test-id");
    vi.stubEnv("ADZUNA_APP_KEY", "test-secret");
    vi.stubEnv("ADZUNA_ALLOWED_COUNTRIES", "gb");
    await expect(
      connectors.adzuna.discover(source("adzuna", { country: "br" })),
    ).rejects.toThrow("cobertura");
  });
  it("Adzuna nunca publica salários previstos como oferecidos pela empresa", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "test-id");
    vi.stubEnv("ADZUNA_APP_KEY", "test-secret");
    vi.stubEnv("ADZUNA_ALLOWED_COUNTRIES", "gb");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        count: 1,
        results: [
          {
            id: "1",
            title: "Cashier",
            company: { display_name: "Employer" },
            redirect_url: "https://example.test/1",
            description: "Store",
            salary_min: 20000,
            salary_max: 30000,
            salary_is_predicted: "1",
          },
        ],
      }),
    );
    const [job] = await connectors.adzuna.discover(
      source("adzuna", { country: "gb" }),
    );
    expect(job.salaryMin).toBeNull();
    expect(job.salaryMax).toBeNull();
  });
});
