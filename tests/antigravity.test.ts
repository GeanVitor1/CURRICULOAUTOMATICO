import { describe, it, expect, afterEach, vi } from "vitest";
import { antigravityAvailable } from "../server/antigravity";
import {
  antigravitySettings,
  authorizationUrl,
  parseAntigravitySearch,
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
  });
});
