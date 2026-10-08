import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFParse } from "pdf-parse";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance,
  db: typeof import("../server/db"),
  dir = "",
  owner = "",
  other = "",
  resumeId = "";
const headers = (cookie = owner) => ({
  cookie,
  "x-orbita-request": "1",
  origin: "http://127.0.0.1:5173",
});
const request = (method: string, url: string, payload?: any, cookie = owner) =>
  app.inject({ method: method as any, url, headers: headers(cookie), payload });
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbita-refactor-"));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  db = await import("../server/db");
  app = await (await import("../server/app")).buildApp();
  for (const name of ["owner", "other"]) {
    const response = await request(
      "POST",
      "/api/auth/register",
      {
        name: `Teste ${name}`,
        email: `${name}@example.test`,
        password: "Test-private-password-123",
      },
      "",
    );
    expect(response.statusCode).toBe(200);
    const cookie = String(response.headers["set-cookie"]).split(";")[0];
    if (name === "owner") owner = cookie;
    else other = cookie;
  }
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.closeDb();
  if (resolve(dir).startsWith(resolve(tmpdir()) + "\\orbita-refactor-"))
    await rm(dir, { recursive: true, force: true });
});
describe("Produto universal, documentos e isolamento", () => {
  it("conta nova começa sem cargos ou competências de tecnologia", async () => {
    const response = await request("GET", "/api/workspace");
    expect(response.statusCode).toBe(200);
    const w = response.json();
    expect(w.filters.titles).toEqual([]);
    expect(w.filters.skills).toEqual([]);
    expect(w.jobs).toEqual([]);
    expect(w.onboarding.completed).toBe(false);
  });
  it("onboarding persiste etapas e aplica preferências comuns só na confirmação", async () => {
    const answers = {
      goal: "Auxiliar administrativo",
      location: "Belo Horizonte, MG",
      resumeChoice: "later",
      experience: "Ensino médio completo. Atendimento informal em loja.",
      modalities: ["Presencial"],
      contracts: ["CLT"],
      salaryMin: 1500,
    };
    expect(
      (await request("PUT", "/api/onboarding", { step: 2, answers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/workspace")).json().onboarding.step,
    ).toBe(2);
    expect(
      (await request("GET", "/api/workspace")).json().filters.titles,
    ).toEqual([]);
    expect(
      (
        await request("PUT", "/api/onboarding", {
          step: 5,
          answers,
          complete: true,
        })
      ).statusCode,
    ).toBe(200);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.onboarding.completed).toBe(true);
    expect(w.filters.titles).toEqual(["Auxiliar administrativo"]);
    expect(w.filters.modalities).toEqual(["Presencial"]);
  });
  it("guia didático persiste progresso por pessoa, pode pausar e concluir", async () => {
    expect(
      (
        await request("PUT", "/api/guide", {
          step: 2,
          active: true,
          dismissed: false,
          completed: false,
        })
      ).statusCode,
    ).toBe(200);
    expect((await request("GET", "/api/workspace")).json().guide.step).toBe(2);
    expect(
      (await request("GET", "/api/workspace", undefined, other)).json().guide,
    ).toBeUndefined();
    expect(
      (
        await request("PUT", "/api/guide", {
          step: 2,
          active: false,
          dismissed: true,
          completed: false,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request("PUT", "/api/guide", {
          step: 5,
          active: false,
          dismissed: true,
          completed: true,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/workspace")).json().guide.completed,
    ).toBe(true);
  });
  it("salva rascunho de currículo somente na conta proprietária", async () => {
    const data = {
      name: "João da Silva",
      email: "owner@example.test",
      location: "Recife, PE",
      headline: "Atendimento ao cliente",
      education: "Ensino médio completo",
      experience: "Atendimento informal na loja da família",
      skills: "Atendimento, organização",
      languages: "Português",
    };
    expect(
      (await request("PUT", "/api/resumes/draft", { step: 4, data }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/workspace")).json().resumeDraft.data.name,
    ).toBe("João da Silva");
    expect(
      (await request("GET", "/api/workspace", undefined, other)).json()
        .resumeDraft,
    ).toBeUndefined();
  });
  it("gera PDF legível com acentos sem inventar experiência", async () => {
    const response = await request("POST", "/api/resumes/build", {
      name: "João da Silva",
      email: "owner@example.test",
      location: "Recife, PE",
      headline: "Atendimento ao cliente",
      education: "Ensino médio completo",
      experience: "Atendimento informal na loja da família",
      skills: ["Atendimento", "Organização"],
      languages: "Português",
    });
    expect(response.statusCode).toBe(200);
    resumeId = response.json().resumeId;
    const pdf = await request("GET", `/api/resumes/${resumeId}/download`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    const parser = new PDFParse({ data: pdf.rawPayload });
    try {
      const text = await parser.getText();
      expect(text.text).toContain("João da Silva");
      expect(text.text).toContain("Ensino médio completo");
      expect(text.text).toContain("Atendimento informal");
      expect(text.text).not.toContain("GitHub");
    } finally {
      await parser.destroy();
    }
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.resumeDraft).toBeUndefined();
    expect(w.resumes[0].approved).toBe(false);
  });
  it("outra conta não baixa, aprova nem vê o currículo ou seu conteúdo", async () => {
    expect(
      (
        await request(
          "GET",
          `/api/resumes/${resumeId}/download`,
          undefined,
          other,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          "PATCH",
          `/api/resumes/${resumeId}`,
          { approved: true },
          other,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await request("GET", "/api/workspace", undefined, other)).json().resumes,
    ).toEqual([]);
    expect(
      (await app.inject(`/api/resumes/${resumeId}/download`)).statusCode,
    ).toBe(401);
  });
  it("mostra cargos sustentados pelo currículo, confirma a busca e isola a direção por conta", async () => {
    const w = (await request("GET", "/api/workspace")).json();
    const r = w.resumes.find((r: any) => r.id === resumeId);
    expect(r.targets.length).toBeGreaterThan(0);
    expect(
      r.targets.every((target: any) => r.text.includes(target.evidence)),
    ).toBe(true);
    expect(
      (
        await request("PUT", `/api/resumes/${resumeId}/targets`, {
          titles: ["Médico inventado"],
        })
      ).statusCode,
    ).toBe(400);
    const titles = [r.targets[0].title];
    expect(
      (
        await request(
          "PUT",
          `/api/resumes/${resumeId}/targets`,
          { titles },
          other,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await request("PUT", `/api/resumes/${resumeId}/targets`, { titles }))
        .statusCode,
    ).toBe(200);
    const updated = (await request("GET", "/api/workspace")).json();
    expect(updated.filters.titles).toEqual(titles);
    expect(
      updated.resumes.find((r: any) => r.id === resumeId).targetsConfirmed,
    ).toBe(true);
    expect(
      (await request("GET", "/api/workspace", undefined, other)).json().filters
        .titles,
    ).toEqual([]);
  });
  it("catálogo é autenticado e prioriza portais de empregos brasileiros", async () => {
    expect((await app.inject("/api/source-registry")).statusCode).toBe(401);
    const catalog = (await request("GET", "/api/source-registry")).json();
    expect(catalog.map((s: any) => s.company)).toEqual([
      "LinkedIn",
      "InfoJobs",
      "Indeed",
      "Gupy",
    ]);
    expect(catalog.every((s: any) => s.type === "portal")).toBe(true);
    expect(
      catalog.every((s: any) => s.referenceUrl.startsWith("https://")),
    ).toBe(true);
  });
  it("fontes adicionais aceitas e busca sem fontes responde com erro útil", async () => {
    expect(
      (await request("POST", "/api/discover", undefined, other)).statusCode,
    ).toBe(400);
    for (const type of ["ashby", "jobicy", "adzuna"])
      expect(
        (
          await request("POST", "/api/sources", {
            type,
            company: type,
            board: "public",
            sector: "Serviços",
            country: "br",
          })
        ).statusCode,
      ).toBe(200);
  });
  it("Zen não aceita chave no frontend nem habilitação sem consentimento", async () => {
    expect(
      (
        await request("PUT", "/api/intelligence", {
          provider: "zen",
          model: "ling-3.1-flash-free",
          enabled: true,
          apiKey: "TEST-SECRET-DO-NOT-USE",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("PUT", "/api/intelligence", {
          provider: "zen",
          model: "ling-3.1-flash-free",
          enabled: true,
          consent: false,
        })
      ).json().error,
    ).toContain("Autorize");
    const config = (await request("GET", "/api/intelligence")).json();
    expect(config.enabled).toBe(false);
    expect(config.consent).toBe(false);
    expect(config).not.toHaveProperty("apiKey");
  });
});
