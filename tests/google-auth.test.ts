import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type { FastifyInstance, InjectOptions } from "fastify";

const clientId = "fixture.apps.googleusercontent.com";
const origin = "http://127.0.0.1:5173";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const forged = generateKeyPairSync("rsa", { modulusLength: 2048 });
let app: FastifyInstance,
  database: typeof import("../server/db"),
  schema: typeof import("../server/schema");
let directory = "",
  sequence = 1,
  googleSession = "",
  googleUser = "";
const request = (url: string, options: Partial<InjectOptions> = {}) =>
  app.inject({
    url,
    remoteAddress: `127.0.0.${sequence++}`,
    ...options,
    headers: {
      host: "127.0.0.1:5173",
      origin,
      "x-orbita-request": "1",
      ...options.headers,
    },
  });
const cookie = (headers: Record<string, any>, name: string) => {
  const values = headers["set-cookie"];
  return (
    (Array.isArray(values) ? values : [values])
      .find((value) => value?.startsWith(`${name}=`))
      ?.split(";")[0] || ""
  );
};
const begin = async (intent = "signin", session = "") => {
  const result =
    intent === "signin"
      ? await request("/api/auth/google/start")
      : await request("/api/auth/google/start", {
          method: "POST",
          headers: { cookie: session },
          payload: { intent },
        });
  const url = new URL(
    intent === "signin" ? String(result.headers.location) : result.json().url,
  );
  return {
    result,
    url,
    state: url.searchParams.get("state")!,
    nonce: url.searchParams.get("nonce")!,
    browser: cookie(result.headers, "orbita_google_state"),
  };
};
function jwt(
  nonce: string,
  overrides: Record<string, unknown> = {},
  invalidSignature = false,
) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (data: unknown) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const data = `${encode({ alg: "RS256", kid: "fixture" })}.${encode({
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: "google-person",
    email: "google@example.test",
    email_verified: true,
    name: "Pessoa Google",
    iat: now - 30,
    exp: now + 3600,
    nonce,
    ...overrides,
  })}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), invalidSignature ? forged.privateKey : keys.privateKey).toString("base64url")}`;
}
function exchange(
  challenge: Awaited<ReturnType<typeof begin>>,
  overrides: Record<string, unknown> = {},
  invalidSignature = false,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockClear()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: jwt(challenge.nonce, overrides, invalidSignature),
          access_token: "private-google-access-token",
        }),
      ),
    );
}
const callback = (
  challenge: Awaited<ReturnType<typeof begin>>,
  session = "",
  extra = "code=fixture-code",
) =>
  request(`/api/auth/google/callback?state=${challenge.state}&${extra}`, {
    headers: {
      cookie: [challenge.browser, session].filter(Boolean).join("; "),
    },
  });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-google-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  process.env.GOOGLE_CLIENT_ID = clientId;
  process.env.GOOGLE_CLIENT_SECRET = "private-google-client-secret";
  process.env.GOOGLE_REDIRECT_URI = `${origin}/api/auth/google/callback`;
  process.env.APP_ORIGIN = origin;
  database = await import("../server/db");
  schema = await import("../server/schema");
  app = await (await import("../server/app")).buildApp();
}, 30000);
beforeEach(() => {
  vi.spyOn(
    OAuth2Client.prototype,
    "getFederatedSignonCertsAsync",
  ).mockResolvedValue({
    certs: {
      fixture: String(keys.publicKey.export({ type: "spki", format: "pem" })),
    },
    format: "PEM" as Awaited<
      ReturnType<OAuth2Client["getFederatedSignonCertsAsync"]>
    >["format"],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-google-")))
    await rm(directory, { recursive: true, force: true });
});
describe("Cadastro e acesso Google com identidade verificada", () => {
  it("mostra indisponibilidade sem credenciais e não publica segredos", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect((await request("/api/auth/providers")).json()).toEqual({
      google: false,
      googleSignInUrl: null,
    });
    expect((await request("/api/auth/google/start")).headers.location).toBe(
      "/login?google_error=unavailable",
    );
  });
  it("inicia com PKCE, nonce, cookie privado e callback na origem cadastrada", async () => {
    const challenge = await begin();
    expect(challenge.url.origin).toBe("https://accounts.google.com");
    expect(challenge.url.searchParams.get("scope")).toBe(
      "openid email profile",
    );
    expect(challenge.url.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(challenge.state.length).toBeGreaterThan(32);
    expect(challenge.result.headers["set-cookie"]).toContain("HttpOnly");
    expect(challenge.result.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(challenge.url.href).not.toContain("private-google-client-secret");
    const [row] = await database.db
      .select()
      .from(schema.googleOAuthStates)
      .where(
        eq(
          schema.googleOAuthStates.stateHash,
          createHash("sha256").update(challenge.state).digest("hex"),
        ),
      );
    expect(
      createHash("sha256").update(row.codeVerifier).digest("base64url"),
    ).toBe(challenge.url.searchParams.get("code_challenge"));
    expect(
      (
        await request("/api/auth/google/start", {
          headers: { host: "localhost:5173" },
        })
      ).headers.location,
    ).toBe(`${origin}/api/auth/google/start`);
  });
  it("cria conta e workspace sem senha e autentica com sessão do aplicativo", async () => {
    const challenge = await begin();
    const sender = exchange(challenge);
    const result = await callback(challenge);
    expect(result.headers.location).toBe("/app");
    googleSession = cookie(result.headers, "orbita_session");
    const me = (
      await request("/api/auth/me", { headers: { cookie: googleSession } })
    ).json();
    expect(me).toMatchObject({
      email: "google@example.test",
      googleConnected: true,
      hasPassword: false,
      recentGoogleAuthentication: true,
    });
    googleUser = me.id;
    expect(
      (
        await request("/api/workspace", { headers: { cookie: googleSession } })
      ).json().profile.email,
    ).toBe(me.email);
    const [user] = await database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, googleUser));
    expect(user.password).toBeNull();
    expect(user.googleSub).toBe("google-person");
    expect(JSON.stringify(me)).not.toMatch(
      /private-google|id_token|google-person/,
    );
    const body = sender.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("code_verifier")).toBeTruthy();
    const replay = await callback(challenge);
    expect(replay.headers.location).toContain("google_error=expired");
    expect(sender).toHaveBeenCalledOnce();
  });
  it("recusa outro navegador antes de trocar código e preserva o desafio original", async () => {
    const challenge = await begin();
    const sender = exchange(challenge);
    expect(
      (
        await request(
          `/api/auth/google/callback?state=${challenge.state}&code=x`,
          { headers: { cookie: "orbita_google_state=wrong-browser" } },
        )
      ).headers.location,
    ).toContain("google_error=expired");
    expect(sender).not.toHaveBeenCalled();
    expect((await callback(challenge)).headers.location).toBe("/app");
  });
  it("consome uma única vez em callbacks concorrentes", async () => {
    const challenge = await begin();
    const sender = exchange(challenge);
    const results = await Promise.all([
      callback(challenge),
      callback(challenge),
    ]);
    expect(results.filter((r) => r.headers.location === "/app")).toHaveLength(
      1,
    );
    expect(sender).toHaveBeenCalledOnce();
  });
  it("dois navegadores criam uma única conta e identificam a pessoa pelo sub estável", async () => {
    const first = await begin(),
      second = await begin();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const code = (options?.body as URLSearchParams).get("code");
      return new Response(
        JSON.stringify({
          id_token: jwt(code === "first" ? first.nonce : second.nonce, {
            sub: "concurrent-person",
            email: "concurrent@example.test",
          }),
        }),
      );
    });
    const results = await Promise.all([
      callback(first, "", "code=first"),
      callback(second, "", "code=second"),
    ]);
    expect(results.every((result) => result.headers.location === "/app")).toBe(
      true,
    );
    const accounts = await database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.googleSub, "concurrent-person"));
    expect(accounts).toHaveLength(1);
    const changed = await begin();
    exchange(changed, { sub: "google-person", email: "updated@example.test" });
    const result = await callback(changed);
    const identity = (
      await request("/api/auth/me", {
        headers: { cookie: cookie(result.headers, "orbita_session") },
      })
    ).json();
    expect(identity.id).toBe(googleUser);
  });
  it.each([
    ["audiência", { aud: "another-client" }, false],
    ["emissor", { iss: "https://attacker.example.test" }, false],
    ["nonce", { nonce: "another-authorization" }, false],
    ["e-mail não verificado", { email_verified: false }, false],
    [
      "validade",
      {
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      },
      false,
    ],
    ["assinatura", {}, true],
  ])(
    "valida %s do token com assinatura real",
    async (_name, claims, badSignature) => {
      const challenge = await begin();
      exchange(
        challenge,
        claims as Record<string, unknown>,
        badSignature as boolean,
      );
      const result = await callback(challenge);
      expect(result.headers.location).toContain("google_error=failed");
      expect(cookie(result.headers, "orbita_session")).toBe("");
    },
  );
  it("recusa desafio expirado ou autorização cancelada sem consultar tokens", async () => {
    const expired = await begin();
    await database.db
      .update(schema.googleOAuthStates)
      .set({ expiresAt: new Date(0) });
    const sender = vi.spyOn(globalThis, "fetch");
    expect((await callback(expired)).headers.location).toContain(
      "google_error=expired",
    );
    const denied = await begin();
    expect(
      (await callback(denied, "", "error=access_denied")).headers.location,
    ).toContain("google_error=denied");
    expect(sender).not.toHaveBeenCalled();
  });
  it("vincula uma conta com senha somente a partir da sessão autenticada", async () => {
    const registered = await request("/api/auth/register", {
      method: "POST",
      payload: {
        name: "Pessoa existente",
        email: "existing@example.test",
        password: "Existing-password-123",
      },
    });
    const session = cookie(registered.headers, "orbita_session");
    let challenge = await begin();
    exchange(challenge, {
      sub: "existing-google",
      email: "existing@example.test",
    });
    expect((await callback(challenge)).headers.location).toContain(
      "google_error=account_exists",
    );
    let [user] = await database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "existing@example.test"));
    expect(user.googleSub).toBeNull();
    challenge = await begin("link", session);
    exchange(challenge, {
      sub: "existing-google",
      email: "existing@example.test",
    });
    expect((await callback(challenge, session)).headers.location).toBe(
      "/app?google=linked#conta",
    );
    [user] = await database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "existing@example.test"));
    expect(user.googleSub).toBe("existing-google");
    expect(user.password).toBeTruthy();
    challenge = await begin();
    exchange(challenge, {
      sub: "existing-google",
      email: "existing@example.test",
    });
    expect((await callback(challenge)).headers.location).toBe("/app");
  });
  it("recusa vinculação de Google com outro e-mail e invalida desafio no logout", async () => {
    let challenge = await begin("link", googleSession);
    exchange(challenge, {
      sub: "another-person",
      email: "another@example.test",
    });
    expect(
      (await callback(challenge, googleSession)).headers.location,
    ).toContain("google_error=wrong_account");
    const otherLogin = await begin();
    exchange(otherLogin);
    const otherSession = cookie(
      (await callback(otherLogin)).headers,
      "orbita_session",
    );
    challenge = await begin("reauthenticate", otherSession);
    await request("/api/auth/logout", {
      method: "POST",
      headers: { cookie: otherSession },
    });
    const sender = exchange(challenge);
    expect(
      (await callback(challenge, otherSession)).headers.location,
    ).toContain("google_error=expired");
    expect(sender).not.toHaveBeenCalled();
  });
  it("exclusão de conta Google exige confirmação de e-mail e autenticação recente", async () => {
    await database.db
      .update(schema.sessions)
      .set({ googleAuthenticatedAt: new Date(Date.now() - 6 * 60000) })
      .where(
        eq(
          schema.sessions.token,
          createHash("sha256")
            .update(googleSession.split("=")[1])
            .digest("hex"),
        ),
      );
    expect(
      (
        await request("/api/account", {
          method: "DELETE",
          headers: { cookie: googleSession },
          payload: { confirmEmail: "google@example.test" },
        })
      ).statusCode,
    ).toBe(400);
    const challenge = await begin("reauthenticate", googleSession);
    exchange(challenge);
    expect((await callback(challenge, googleSession)).headers.location).toBe(
      "/app?google=reauthenticated#conta",
    );
    expect(
      (
        await request("/api/account", {
          method: "DELETE",
          headers: { cookie: googleSession },
          payload: { confirmEmail: "wrong@example.test" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("/api/account", {
          method: "DELETE",
          headers: { cookie: googleSession },
          payload: { confirmEmail: "google@example.test" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("/api/auth/me", { headers: { cookie: googleSession } }))
        .statusCode,
    ).toBe(401);
  });
});
