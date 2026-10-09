import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  browserAuthorized,
  publicDiscoveryAvailable,
} from "../server/provider-capabilities";
let dir = "",
  cookie = "",
  userId = "",
  app: FastifyInstance;
let oauth: typeof import("../server/linkedin-oauth"),
  database: typeof import("../server/db");
const headers = () => ({
  cookie,
  "x-orbita-request": "1",
  origin: "http://127.0.0.1:5173",
});
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "empregatos-providers-"));
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  process.env.LINKEDIN_CLIENT_ID = "fixture-client";
  process.env.LINKEDIN_CLIENT_SECRET = "fixture-server-secret";
  process.env.LINKEDIN_REDIRECT_URI =
    "http://127.0.0.1:5173/api/oauth/linkedin/callback";
  process.env.PORTAL_BROWSER_AUTHORIZED = "";
  process.env.PORTAL_DISCOVERY_AUTHORIZED = "";
  process.env.APPLICATION_WEBHOOK_AUTHORIZED = "false";
  database = await import("../server/db");
  oauth = await import("../server/linkedin-oauth");
  app = await (await import("../server/app")).buildApp();
  const register = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: headers(),
    payload: {
      name: "Teste",
      email: "providers@example.test",
      password: "Provider-tests-123",
    },
  });
  expect(register.statusCode).toBe(200);
  cookie = String(register.headers["set-cookie"]).split(";")[0];
  userId = (
    await app.inject({ url: "/api/auth/me", headers: headers() })
  ).json().id;
}, 30000);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (dir.startsWith(join(tmpdir(), "empregatos-providers-")))
    await rm(dir, { recursive: true, force: true });
});
const authorization = async (id = userId) =>
  new URL(await oauth.beginLinkedinOAuth(id));
const receipt = () =>
  vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "private-access-token",
          expires_in: 3600,
          scope: "openid profile email",
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ sub: "private-provider-subject", name: "Example" }),
      ),
    );
describe("Permissões reais, OAuth e privacidade", () => {
  it("não habilita navegador ou busca LinkedIn pelo consentimento da pessoa", () => {
    expect(browserAuthorized("linkedin")).toBe(false);
    expect(publicDiscoveryAvailable("linkedin", true)).toBe(false);
    expect(publicDiscoveryAvailable("gupy", false)).toBe(true);
    vi.stubEnv("PORTAL_BROWSER_AUTHORIZED", "gupy");
    expect(browserAuthorized("gupy")).toBe(true);
    expect(browserAuthorized("linkedin")).toBe(false);
  });
  it("abre autenticação oficial com escopos de identidade e estado imprevisível", async () => {
    const url = await authorization();
    expect(url.origin).toBe("https://www.linkedin.com");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")!.length).toBeGreaterThan(32);
    expect(url.href).not.toContain("fixture-server-secret");
    expect((await authorization()).searchParams.get("state")).not.toBe(
      url.searchParams.get("state"),
    );
  });
  it("recusa estado errado antes de trocar código", async () => {
    await authorization();
    const fetcher = vi.spyOn(globalThis, "fetch");
    await expect(
      oauth.completeLinkedinOAuth(userId, "wrong-state", "code"),
    ).rejects.toThrow("não corresponde");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uma conta não pode consumir a autorização da outra", async () => {
    const url = await authorization();
    await expect(
      oauth.completeLinkedinOAuth(
        "another-user",
        url.searchParams.get("state")!,
        "code",
      ),
    ).rejects.toThrow("expirou");
    const fetcher = receipt();
    await oauth.completeLinkedinOAuth(
      userId,
      url.searchParams.get("state")!,
      "code",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("salva apenas metadados cifrados e OAuth nunca habilita candidaturas", async () => {
    const sites = (
      await app.inject({ url: "/api/automation/sites", headers: headers() })
    ).json();
    expect(sites.find((site: any) => site.id === "linkedin")).toMatchObject({
      identityConnected: true,
      connected: false,
      automatic: false,
      discovery: false,
      authMethod: "oauth",
    });
    expect(JSON.stringify(sites)).not.toMatch(
      /private-access-token|fixture-server-secret|private-provider-subject/,
    );
    const files = await readdir(join(dir, "oauth"));
    for (const file of files)
      expect(await readFile(join(dir, "oauth", file), "utf8")).not.toMatch(
        /private-access-token|private-provider-subject|connectedAt/,
      );
  });
  it("consome a autorização uma única vez, mesmo em callbacks simultâneos", async () => {
    const url = await authorization();
    receipt();
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        oauth.completeLinkedinOAuth(
          userId,
          url.searchParams.get("state")!,
          "code",
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });
  it("recusa autorização expirada e recusada pelo provedor", async () => {
    const url = await authorization();
    const timestamp = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(timestamp + 11 * 60000);
    await expect(
      oauth.completeLinkedinOAuth(
        userId,
        url.searchParams.get("state")!,
        "code",
      ),
    ).rejects.toThrow("expirou");
    vi.restoreAllMocks();
    const denied = await authorization();
    await expect(
      oauth.completeLinkedinOAuth(
        userId,
        denied.searchParams.get("state")!,
        undefined,
        true,
      ),
    ).rejects.toThrow("não foi concluída");
  });
  it("não expõe conteúdo do provedor em erros e callback", async () => {
    const url = await authorization();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("secret <script>bad</script>"),
    );
    const callback = await app.inject({
      url:
        "/api/oauth/linkedin/callback?" +
        new URLSearchParams({
          state: url.searchParams.get("state")!,
          code: "private-code",
        }),
      headers: headers(),
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.body).not.toMatch(/private-code|secret|bad/);
    expect(callback.body).toContain("Não foi possível conectar");
    expect(callback.headers["cache-control"]).toBe("no-store");
  });
  it("expõe expiração e desconecta autenticação sem alegar envio", async () => {
    const timestamp = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(timestamp + 2 * 3600000);
    const sites = (
      await app.inject({ url: "/api/automation/sites", headers: headers() })
    ).json();
    expect(sites.find((site: any) => site.id === "linkedin")).toMatchObject({
      identityConnected: false,
      identityExpired: true,
      automatic: false,
    });
    vi.restoreAllMocks();
    const removed = await app.inject({
      method: "DELETE",
      url: "/api/connections/linkedin",
      headers: headers(),
    });
    expect(removed.statusCode).toBe(200);
    expect(await oauth.linkedinIdentity(userId)).toBeNull();
  });
  it("recusa endpoints antigos de navegador sem autorização do serviço", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/connections/linkedin/open",
      headers: headers(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("autorização");
  });
  it("desconectar durante a troca de código impede uma conexão tardia", async () => {
    const url = await authorization();
    let resolveProfile!: (response: Response) => void;
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "private-access-token",
            expires_in: 3600,
          }),
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveProfile = resolve;
          }),
      );
    const exchange = oauth.completeLinkedinOAuth(
      userId,
      url.searchParams.get("state")!,
      "code",
    );
    const failure = expect(exchange).rejects.toThrow("não confirmou");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await oauth.disconnectLinkedinIdentity(userId);
    resolveProfile(new Response(JSON.stringify({ sub: "fixture-sub" })));
    await failure;
    expect(await oauth.linkedinIdentity(userId)).toBeNull();
  });
  it("recupera um envio interrompido como desconhecido sem repetir uma candidatura", async () => {
    const { recoverInterruptedSends } = await import("../server/operations");
    const timestamp = Date.now();
    await database.mutateWorkspace(`${userId}:live`, (w) => {
      w.applications = ["old", "live"].map((id) => ({
        id,
        jobId: `job-${id}`,
        resumeId: null,
        status: "Enviando",
        receipt: null,
        note: "",
        mode: "automatic",
        history: [],
        createdAt: new Date(timestamp - 360000).toISOString(),
        updatedAt: new Date(
          timestamp - (id === "old" ? 180000 : 1000),
        ).toISOString(),
      }));
    });
    await recoverInterruptedSends();
    const w = (await database.readWorkspace(`${userId}:live`))!;
    expect(w.applications[0].status).toBe("Resultado desconhecido");
    expect(w.applications[0].submittedAt).toBeUndefined();
    expect(w.applications[1].status).toBe("Enviando");
    expect(w.applications[0].history[0].message).toContain(
      "não será reenviada",
    );
    await recoverInterruptedSends();
    expect(
      (await database.readWorkspace(`${userId}:live`))!.applications[0].history,
    ).toHaveLength(1);
  });
});
