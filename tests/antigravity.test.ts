import { describe, it, expect, afterEach, vi } from "vitest";
import { antigravityAvailable } from "../server/antigravity";
import {
  antigravitySettings,
  authorizationUrl,
  parseAntigravitySearch,
  isGoogleCitation,
  selectSearchModel,
} from "../server/antigravity-protocol";

afterEach(() => vi.unstubAllEnvs());
const job = {
  title: "Desenvolvedor",
  company: "Empresa",
  url: "https://empresa.gupy.io/jobs/123",
  location: "Brasil",
  description: "Desenvolvimento de sistemas com TypeScript.",
};
const result = (jobs = [job]) =>
  JSON.stringify({
    event: "result",
    result: { status: "SUCCESS", response: JSON.stringify({ jobs }) },
  });

describe("Antigravity remoto", () => {
  it("restringe o uso da assinatura ao titular configurado", () => {
    vi.stubEnv("ANTIGRAVITY_ENABLED", "true");
    vi.stubEnv("ANTIGRAVITY_OWNER_ID", "owner");
    expect(antigravityAvailable("owner")).toBe(true);
    expect(antigravityAvailable("other")).toBe(false);
    expect(antigravityAvailable()).toBe(false);
    vi.stubEnv("ANTIGRAVITY_ENABLED", "false");
    expect(antigravityAvailable("owner")).toBe(false);
  });
  it("usa apenas a autorização oficial com callback Google e PKCE", () => {
    const url =
      "https://accounts.google.com/o/oauth2/auth?redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&code_challenge=abc&state=xyz";
    expect(authorizationUrl("Authenticate: " + url + "\n")).toBe(url);
    expect(
      authorizationUrl(url.replace("antigravity.google", "evil.test")),
    ).toBeNull();
    expect(
      authorizationUrl(
        url.replace("accounts.google.com", "accounts.google.com.evil.test"),
      ),
    ).toBeNull();
  });
  it("não aceita as citações da própria resposta como prova da busca", () => {
    expect(parseAntigravitySearch(result()).verifiedUrls.size).toBe(0);
    const forged = JSON.stringify({
      event: "step_update",
      step_update: {
        state: "DONE",
        step_type: "tool",
        tool_info: { name: "run_command", output: job.url },
      },
    });
    expect(
      parseAntigravitySearch(forged + "\n" + result()).verifiedUrls.size,
    ).toBe(0);
  });
  it("retém URLs vistas nas ferramentas de busca e leitura concluídas", () => {
    const evidence = JSON.stringify({
      event: "step_update",
      step_update: {
        state: "DONE",
        step_type: "tool",
        tool_info: { name: "search_web", output: [{ url: job.url }] },
      },
    });
    const parsed = parseAntigravitySearch(evidence + "\n" + result());
    expect(parsed.jobs).toEqual([job]);
    expect(parsed.verifiedUrls.has(job.url)).toBe(true);
  });
  it("rejeita erro do CLI e registros de ferramenta incompletos", () => {
    expect(() =>
      parseAntigravitySearch(
        JSON.stringify({ event: "result", result: { status: "ERROR" } }),
      ),
    ).toThrow();
    const failed = JSON.stringify({
      event: "step_update",
      step_update: {
        state: "ACTIVE",
        step_type: "tool",
        tool_info: { name: "search_web", output: job.url },
      },
    });
    expect(
      parseAntigravitySearch(failed + "\n" + result()).verifiedUrls.size,
    ).toBe(0);
  });
  it("desativa créditos extras, execução de comandos e envio por navegador", () => {
    expect(antigravitySettings.useG1Credits).toBe(false);
    expect(antigravitySettings.permissions.deny).toEqual(
      expect.arrayContaining(["command(*)", "read_file(*)", "execute_url(*)"]),
    );
    expect(antigravitySettings).not.toHaveProperty("modelProvider");
    expect(antigravitySettings.permissions.allow).toEqual(expect.arrayContaining([
      'read_url(greenhouse.io)','read_url(lever.co)','read_url(ashbyhq.com)','read_url(smartrecruiters.com)',
    ]));
    expect(antigravitySettings.permissions.allow).not.toContain('read_url(*)');
  });
  it("reconhece as referências opacas do Google mesmo quando o CLI omite a saída de search_web", () => {
    const citation =
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/" +
      "AUZIYQ" +
      "a".repeat(30);
    const candidate = { ...job, citationUrl: citation };
    const native = JSON.stringify({
      event: "step_update",
      step_update: {
        state: "DONE",
        step_type: "tool",
        tool_info: { name: "search_web", parameters: { query: "vagas" } },
      },
    });
    const parsed = parseAntigravitySearch(native + "\n" + result([candidate]));
    expect(parsed.searchPerformed).toBe(true);
    expect(parsed.verifiedUrls.size).toBe(0);
    expect([...parsed.googleCitationUrls]).toEqual([citation]);
    expect(
      parseAntigravitySearch(result([candidate])).googleCitationUrls.size,
    ).toBe(0);
  });
  it("não considera redirecionamentos genéricos ou outros hosts como referências Google verificáveis", () => {
    expect(
      isGoogleCitation(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/" +
          "a".repeat(30),
      ),
    ).toBe(true);
    expect(
      isGoogleCitation("https://www.google.com/url?q=https://evil.test"),
    ).toBe(false);
    expect(
      isGoogleCitation(
        "https://vertexaisearch.cloud.google.com.evil.test/grounding-api-redirect/" +
          "a".repeat(30),
      ),
    ).toBe(false);
    expect(
      isGoogleCitation(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/short",
      ),
    ).toBe(false);
  });
  it("escolhe um modelo Flash Low do catálogo atual, sem fixar uma versão que pode desaparecer", () => {
    expect(
      selectSearchModel(
        "gemini-3.8-flash-high\tHigh\ngemini-3.8-flash-low\tLow",
      ),
    ).toBe("gemini-3.8-flash-low");
    expect(selectSearchModel("claude-opus-model\tModel")).toBeUndefined();
  });
});
