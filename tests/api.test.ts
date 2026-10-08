import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from 'node:fs';
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import type { FastifyInstance } from "fastify";
import { resumePdf } from "./pdf-fixture";
let app: FastifyInstance,
  cookie = "",
  dir = "",
  userId = "",
  dbModule: typeof import("../server/db");
const headers = () => ({
  "x-orbita-request": "1",
  origin: "http://127.0.0.1:5173",
  cookie,
});
const request = (method: string, url: string, body?: any) =>
  app.inject({ method: method as any, url, headers: headers(), payload: body });
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "orbita-tests-"));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  const module = await import("../server/app");
  dbModule = await import("../server/db");
  app = await module.buildApp();
}, 30000);
afterAll(async () => {
  await app?.close();
  await dbModule?.closeDb();
  if (dir.startsWith(join(tmpdir(), "orbita-tests-")))
    await rm(dir, { recursive: true, force: true });
});
describe("Fluxos de ponta a ponta na API", () => {
  it("serve o build estático e verifica a saúde do banco", async () => {
    expect((await app.inject("/api/health")).statusCode).toBe(200);
    if (existsSync(join(process.cwd(), 'dist', 'index.html'))) {
      const page = await app.inject("/");
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toContain("text/html");
    }
  });
  it("exige autenticação", async () =>
    expect((await app.inject("/api/workspace")).statusCode).toBe(401));
  it("protege solicitações mutativas contra CSRF", async () =>
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/register",
          payload: {},
        })
      ).statusCode,
    ).toBe(403));
  it("cria conta e sessão privada", async () => {
    const r = await request("POST", "/api/auth/register", {
      name: "Pessoa de teste",
      email: "teste@example.test",
      password: "Local-test-pass-123",
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers["set-cookie"]).toContain("HttpOnly");
    expect(r.headers["set-cookie"]).toContain("SameSite=Strict");
    cookie = String(r.headers["set-cookie"]).split(";")[0];
    userId = r.json().id;
  });
  it("workspace real começa vazio e não disponibiliza dados fictícios", async () => {
    const real = (await request("GET", "/api/workspace")).json();
    const demo = await request("GET", "/api/workspace?demo=true");
    expect(real.jobs).toEqual([]);
    expect(demo.statusCode).toBe(400);
    expect((await request("GET", "/api/workspace")).json().jobs).toEqual([]);
  });
  it("rejeita arquivos que fingem ser PDF", async () => {
    const boundary = "test-boundary";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake.pdf"\r\nContent-Type: application/pdf\r\n\r\nnot a pdf\r\n--${boundary}--\r\n`,
    );
    const r = await app.inject({
      method: "POST",
      url: "/api/resumes",
      headers: {
        ...headers(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain("PDF válido");
  });
  it("faz upload DOCX, extrai competências e exige revisão", async () => {
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Curriculo realista de teste: C# .NET SQL Server APIs REST Git Angular. Projetos verdadeiros a confirmar.</w:t></w:r></w:p></w:body></w:document>';
    const zip = zipSync({ "word/document.xml": strToU8(xml) });
    const boundary = "docx-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="curriculo.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
      ),
      Buffer.from(zip),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({
      method: "POST",
      url: "/api/resumes",
      headers: {
        ...headers(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().skills).toContain("C#");
    let w = (await request("GET", "/api/workspace")).json();
    expect(w.resumes[0].approved).toBe(false);
    expect(w.profile.confirmed).toBe(false);
    expect(
      (
        await request("PATCH", `/api/resumes/${w.resumes[0].id}`, {
          approved: true,
        })
      ).statusCode,
    ).toBe(200);
    w.profile.confirmed = true;
    w.profile.years = 2;
    expect((await request("PUT", "/api/profile", w.profile)).statusCode).toBe(
      200,
    );
  });
  it("extrai texto de um PDF válido e mantém a versão privada", async () => {
    const boundary = "pdf-test";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="curriculo.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      resumePdf(),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({
      method: "POST",
      url: "/api/resumes",
      headers: {
        ...headers(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().skills).toContain("C#");
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.resumes[0].text).toContain("Verified projects");
    await request("PATCH", `/api/resumes/${w.resumes[0].id}`, {
      approved: true,
    });
    w.profile.confirmed = true;
    await request("PUT", "/api/profile", w.profile);
    expect(
      (await request("GET", `/api/resumes/${w.resumes[0].id}/download`))
        .headers["content-type"],
    ).toContain("application/pdf");
  });
  it("protege chaves de IA e não inclui segredos na exportação", async () => {
    const result = await request("PUT", "/api/intelligence", {
      provider: "openai",
      consent: true,
      model: "model-for-test",
      enabled: true,
      apiKey: "secret-for-test",
      clearKey: false,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().keyConfigured).toBe(true);
    expect(JSON.stringify(result.json())).not.toContain("secret-for-test");
    expect((await request("GET", "/api/export")).body).not.toContain(
      "secret-for-test",
    );
    const { encryptSecret, decryptSecret } =
      await import("../server/intelligence");
    const cipher = encryptSecret("another-secret");
    expect(cipher).not.toContain("another-secret");
    expect(decryptSecret(cipher)).toBe("another-secret");
  });
  it("IA aceita somente sugestões com evidência e mantém campos não identificados pendentes", async () => {
    const { verifyEvidence } = await import("../server/intelligence");
    const text =
      "Maria, C# e .NET. Curso de desenvolvimento web. Experiência: 2 anos.";
    const p = verifyEvidence(
      {
        fields: [
          {
            field: "education",
            value: "Curso de desenvolvimento web.",
            evidence: "Curso de desenvolvimento web.",
          },
          {
            field: "experience",
            value: "Trabalhou na NASA",
            evidence: "Texto inexistente",
          },
        ],
        skills: [
          { name: "C#", evidence: "C# e .NET" },
          { name: "Azure", evidence: "C# e .NET" },
        ],
        years: 2,
        yearsEvidence: "Experiência: 2 anos.",
      },
      text,
    );
    expect(p.education).toBe("Curso de desenvolvimento web.");
    expect(p.experience).toBeUndefined();
    expect(p.skills).toEqual(["C#"]);
    expect(p.years).toBe(2);
    expect(p.confirmed).toBe(false);
  });
  it("conector OpenAI usa saída estruturada sem armazenamento e valida as sugestões", async () => {
    const text =
      "Pessoa com C# .NET e projetos em APIs REST; formação a confirmar.";
    const { analyzeResume } = await import("../server/intelligence");
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    fields: [],
                    skills: [{ name: "C#", evidence: "C# .NET" }],
                    years: null,
                    yearsEvidence: "",
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await analyzeResume(userId, text);
    expect(result.method).toBe("openai");
    expect(result.profile.skills).toContain("C#");
    const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe("json_schema");
    mock.mockRestore();
  });
  it("falha de IA usa extração local e Ollama é independente", async () => {
    const { analyzeResume } = await import("../server/intelligence");
    const text =
      "Pessoa com C# .NET SQL Server e APIs REST, informações a confirmar.";
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));
    expect((await analyzeResume(userId, text)).method).toBe("local");
    mock.mockRestore();
    await request("PUT", "/api/intelligence", {
      provider: "ollama",
      model: "local-model",
      enabled: true,
      clearKey: true,
    });
    const ollama = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          done: true,
          response: JSON.stringify({
            fields: [],
            skills: [],
            years: null,
            yearsEvidence: "",
          }),
        }),
        { status: 200 },
      ),
    );
    expect((await analyzeResume(userId, text)).method).toBe("ollama");
    expect(String(ollama.mock.calls[0][0])).toContain("/api/generate");
    ollama.mockRestore();
    await request("PUT", "/api/intelligence", {
      provider: "local",
      model: "",
      enabled: false,
      clearKey: true,
    });
  });
  it("importa, deduplica e explica compatibilidade", async () => {
    const j = {
      title: "Software Engineer I",
      company: "Empresa real de teste",
      url: "https://example.com/job/123",
      description:
        "Desenvolvimento C# .NET, SQL Server e APIs REST em equipe remota. 1 ano de experiencia.",
      location: "Brasil",
      modality: "Remoto",
      level: "Júnior",
      contract: "CLT",
      salaryMin: null,
      salaryMax: null,
      currency: "BRL",
      skills: ["C#", ".NET", "SQL Server", "APIs REST"],
      requiredSkills: [],
      requiredYears: 1,
    };
    expect((await request("POST", "/api/jobs", j)).statusCode).toBe(200);
    await request("POST", "/api/jobs", j);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.jobs.length).toBe(1);
    expect(w.jobs[0].match.score).toBeGreaterThan(80);
  });
  it("prepara candidatura sem declarar envio e impede duplicatas", async () => {
    const w = (await request("GET", "/api/workspace")).json();
    const r = await request("POST", "/api/applications", {
      jobId: w.jobs[0].id,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("Requer ação manual");
    expect(r.json().receipt).toBeNull();
    expect(
      (await request("POST", "/api/applications", { jobId: w.jobs[0].id }))
        .statusCode,
    ).toBe(400);
  });
  it("envio exige confirmação e preserva histórico", async () => {
    const w = (await request("GET", "/api/workspace")).json();
    const id = w.applications[0].id;
    expect(
      (await request("PATCH", `/api/applications/${id}`, { status: "Enviada" }))
        .statusCode,
    ).toBe(400);
    const r = await request("PATCH", `/api/applications/${id}`, {
      status: "Enviada",
      confirmation: true,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().history.length).toBe(2);
    expect(r.json().submittedAt).toBeTruthy();
    expect(
      (
        await request("PATCH", `/api/applications/${id}`, {
          status: "Contratada",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("uma outra conta não acessa os dados nem os arquivos", async () => {
    const old = cookie;
    const r = await request("POST", "/api/auth/register", {
      name: "Outra pessoa",
      email: "outra@example.test",
      password: "Local-test-pass-123",
    });
    cookie = String(r.headers["set-cookie"]).split(";")[0];
    expect((await request("GET", "/api/workspace")).json().jobs).toEqual([]);
    cookie = old;
  });
  it("busca autorizada persiste resultados e isola falhas de fontes", async () => {
    await request("POST", "/api/sources", {
      company: "Acme",
      type: "greenhouse",
      board: "acme",
      enabled: true,
    });
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 123,
              title: "Backend Developer",
              absolute_url: "https://example.com/jobs/123",
              content: "<p>C# .NET SQL Server REST. Remote. Junior.</p>",
              location: { name: "Brasil" },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const r = await request("POST", "/api/discover");
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("queued");
    await (await import("../server/discovery-queue")).processNextDiscoveryTask();
    expect((await request("GET", "/api/workspace")).json().runs[0].discovered).toBe(1);
    expect(mock.mock.calls[0][0]).toContain("boards-api.greenhouse.io");
    mock.mockRestore();
  });
  it("agenda de modo persistido e não ativa envio sem adapter", async () => {
    expect(
      (
        await request("PUT", "/api/routine", {
          enabled: true,
          mode: "approval",
          time: "08:00",
          dailyLimit: 10,
          minScore: 80,
        })
      ).statusCode,
    ).toBe(200);
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.routine.nextRun).toBeTruthy();
    expect(
      (
        await request("PUT", "/api/routine", {
          enabled: true,
          mode: "automatic",
          time: "08:00",
          dailyLimit: 10,
          minScore: 80,
        })
      ).statusCode,
    ).toBe(400);
  });
  it("timeout de envio autorizado deixa resultado desconhecido e não repete", async () => {
    const { automaticSend } = await import("../server/operations");
    process.env.APPLICATION_WEBHOOK_URL =
      "https://adapter.example.test/applications";
    process.env.APPLICATION_WEBHOOK_AUTHORIZED = "true";
    process.env.APPLICATION_WEBHOOK_TOKEN = "test-token";
    const id = `${userId}:live`;
    await dbModule.mutateWorkspace(id, (w) => {
      w.sources.push({
        id: "auth",
        type: "authorized",
        company: w.jobs.find(j => j.id === w.applications[0].jobId)!.company,
        board: "adapter",
        enabled: true,
        discovery: false,
        application: true,
        status: "autorizado",
      });
      w.routine.enabled = true;
      w.routine.mode = "automatic";
      w.applications[0].status = "Aguardando aprovação";
    });
    const state = (await dbModule.readWorkspace(id))!;
    const fake = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await automaticSend(
      id,
      state.applications[0].id,
      fake as any,
    );
    expect(result.status).toBe("Resultado desconhecido");
    expect(fake).toHaveBeenCalledOnce();
    await expect(
      automaticSend(id, state.applications[0].id, fake as any),
    ).rejects.toThrow("não elegível");
    expect(fake).toHaveBeenCalledOnce();
    delete process.env.APPLICATION_WEBHOOK_URL;
    delete process.env.APPLICATION_WEBHOOK_TOKEN;
    delete process.env.APPLICATION_WEBHOOK_AUTHORIZED;
  });
  it("persiste entre reinicializações da aplicação", async () => {
    const original = (await request("GET", "/api/workspace")).json();
    await app.close();
    await dbModule.closeDb();
    vi.resetModules();
    dbModule = await import("../server/db");
    app = await (await import("../server/app")).buildApp();
    const w = (await request("GET", "/api/workspace")).json();
    expect(w.jobs.length).toBe(original.jobs.length);
    expect(w.applications[0].history).toEqual(original.applications[0].history);
  });
  it('registra uma candidatura feita hoje mesmo antes do meio-dia', async () => {
    const j=await request('POST','/api/jobs',{title:'Cargo externo registrado',company:'Empresa externa',url:'https://example.com/external',description:'Oportunidade externa de teste registrada manualmente, sem qualquer envio externo realizado.',location:'Brasil',modality:'Remoto',level:'Júnior',contract:'CLT',salaryMin:null,salaryMax:null,currency:'BRL',skills:[],requiredSkills:[],requiredYears:null});
    const body={jobId:j.json().id,confirmation:true,date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),note:'Fixture de teste'};
    const r=await request('POST','/api/applications/manual',body);expect(r.statusCode).toBe(200);expect(r.json().status).toBe('Enviada');
    expect((await request('POST','/api/applications/manual',body)).statusCode).toBe(400);
  });
  it("exporta dados e exclusão elimina a sessão", async () => {
    const r = await request("GET", "/api/export");
    expect(r.json().jobs.length).toBeGreaterThan(0);
    expect(
      (
        await request("DELETE", "/api/account", {
          password: "Local-test-pass-123",
        })
      ).statusCode,
    ).toBe(200);
    expect((await request("GET", "/api/workspace")).statusCode).toBe(401);
  });
});
