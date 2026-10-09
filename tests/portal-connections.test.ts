import { describe, expect, it } from "vitest";
import { candidateAnswer } from "../server/portal-application";
import {
  portalHost,
  publicAddress,
  portalLogin,
} from "../server/portal-browser-policy";
import { defaultProfile } from "../shared/types";

describe("Conexões privadas e respostas verificadas", () => {
  it("preenche somente os dados pessoais explicitamente aprovados", () => {
    const profile = {
      ...defaultProfile,
      name: "Ana Maria Silva",
      email: "ana@example.test",
      github: "https://github.com/ana",
    };
    expect(candidateAnswer("Nome completo *", profile)).toBe("Ana Maria Silva");
    expect(candidateAnswer("Last name", profile)).toBe("Maria Silva");
    expect(candidateAnswer("Endereço de e-mail", profile)).toBe(profile.email);
    expect(candidateAnswer("Github", profile)).toBe(profile.github);
    expect(
      candidateAnswer("Mobile phone number", {
        ...profile,
        phone: "(73) 99999-9999",
      }),
    ).toBe("(73) 99999-9999");
    for (const question of [
      "Quantos anos de C#?",
      "Possui experiência com vendas?",
      "CPF",
      "Salário desejado",
      "Você pode trabalhar no Brasil?",
      "Telefone",
    ])
      expect(candidateAnswer(question, profile)).toBeUndefined();
  });
  it("não inventa nomes ou respostas a partir de dados ausentes", () => {
    expect(candidateAnswer("Email", defaultProfile)).toBeUndefined();
    expect(candidateAnswer("Nome", defaultProfile)).toBeUndefined();
  });
  it("limita a navegação ao portal e subdomínios legítimos", () => {
    expect(portalHost("gupy", portalLogin.gupy)).toBe(true);
    expect(
      portalHost("infojobs", "https://login.infojobs.com.br/Account/Login"),
    ).toBe(true);
    expect(
      portalHost("glassdoor", "https://www.glassdoor.com/member/profile/"),
    ).toBe(true);
    for (const url of [
      "http://www.linkedin.com/",
      "https://linkedin.com.evil.test/",
      "https://evil.test/linkedin.com",
      "https://www.linkedin.com:8443/",
      "https://user:pass@www.linkedin.com/",
    ])
      expect(portalHost("linkedin", url)).toBe(false);
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.1.1.1",
    "198.18.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("recusa acesso do navegador à rede privada: %s", (ip) =>
    expect(publicAddress(ip)).toBe(false),
  );
  it("permite destinos públicos", () => {
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("172.32.0.1")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
});
