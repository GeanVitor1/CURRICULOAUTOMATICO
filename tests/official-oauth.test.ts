import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq } from "../server/storage-types";

vi.mock("@electric-sql/pglite", async (original) => {
  const actual = await original<typeof import("@electric-sql/pglite")>();
  return {
    ...actual,
    PGlite: class extends actual.PGlite {
      constructor() {
        super();
      }
    },
  };
});
let database: typeof import("../server/db"),
  oauth: typeof import("../server/official-oauth"),
  directory = "";
let userId = "";
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "official-oauth-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("DATABASE_PROVIDER", "");
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:5173");
  vi.stubEnv("INFOJOBS_ES_CLIENT_ID", "ij-client");
  vi.stubEnv("INFOJOBS_ES_CLIENT_SECRET", "ij-private-secret");
  vi.stubEnv(
    "INFOJOBS_ES_REDIRECT_URI",
    "http://127.0.0.1:5173/api/oauth/infojobs-es/callback",
  );
  database = await import("../server/db");
  oauth = await import("../server/official-oauth");
  userId = randomUUID();
  await database.store.insert("users", {
    id: userId,
    email: `${userId}@example.test`,
    name: "Fixture",
  });
}, 30000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await database?.closeDb();
  vi.unstubAllEnvs();
  if (directory.startsWith(join(tmpdir(), "official-oauth-")))
    await rm(directory, { recursive: true, force: true });
});
const authorization = async () =>
  new URL(await oauth.beginOfficialOAuth(userId, "infojobs-es"));
const receipt = () =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "ij-private-token",
          refresh_token: "ij-private-refresh",
          expires_in: 3600,
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          key: "ij-private-subject",
          fullName: "Pessoa Espanha",
        }),
      ),
    );

it("usa os endpoints oficiais e mantém a conta espanhola separada do Brasil", async () => {
  const url = await authorization();
  expect(url.origin).toBe("https://www.infojobs.net");
  expect(url.pathname).toBe("/api/oauth/user-authorize/index.xhtml");
  expect(url.searchParams.get("scope")).toBe("candidate_profile_with_email");
  expect(url.href).not.toContain("ij-private-secret");
  const fetcher = receipt();
  await oauth.completeOfficialOAuth(
    userId,
    "infojobs-es",
    url.searchParams.get("state")!,
    "code",
    false,
    fetcher,
  );
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://www.infojobs.net/oauth/authorize",
  );
  expect(fetcher.mock.calls[1][0]).toBe(
    "https://api.infojobs.net/api/6/candidate",
  );
  expect(
    (fetcher.mock.calls[1][1]!.headers as Record<string, string>).Authorization,
  ).toBe(
    `Basic ${Buffer.from("ij-client:ij-private-secret").toString("base64")},Bearer ij-private-token`,
  );
  const metadata = await oauth.officialOAuthConnection(userId, "infojobs-es");
  expect(metadata).toMatchObject({
    connected: true,
    region: "ES",
    automaticApplications: false,
    accountName: "Pessoa Espanha",
  });
  expect(JSON.stringify(metadata)).not.toMatch(
    /ij-private-(token|refresh|subject)|ij-private-secret/,
  );
  process.env.INFOJOBS_ES_CLIENT_ID = "another-application";
  expect(
    await oauth.officialOAuthConnection(userId, "infojobs-es"),
  ).toMatchObject({ connected: false, expired: true });
  process.env.INFOJOBS_ES_CLIENT_ID = "ij-client";
  const [raw] = await database.store.select("portalOAuthAccounts", {
    where: eq("id", `${userId}:infojobs-es`),
  });
  expect(raw.encryptedData).not.toMatch(/ij-private-|Pessoa Espanha/);
  const { decryptSecret } = await import("../server/intelligence");
  expect(JSON.parse(decryptSecret(raw.encryptedData!))).toMatchObject({
    accessToken: "ij-private-token",
    refreshToken: "ij-private-refresh",
  });
});

it("consome o estado no banco uma única vez entre callbacks concorrentes", async () => {
  const url = await authorization();
  const fresh = await import("../server/official-oauth");
  const fetcher = receipt();
  const results = await Promise.allSettled(
    [0, 1].map(() =>
      fresh.completeOfficialOAuth(
        userId,
        "infojobs-es",
        url.searchParams.get("state")!,
        "code",
        false,
        fetcher,
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("não aceita outro usuário, outro provedor ou um código de autorização substituída", async () => {
  const first = await authorization();
  const next = await authorization();
  const fetcher = receipt();
  await expect(
    oauth.completeOfficialOAuth(
      "other-user",
      "infojobs-es",
      next.searchParams.get("state")!,
      "code",
      false,
      fetcher,
    ),
  ).rejects.toThrow("expirou");
  await expect(
    oauth.completeOfficialOAuth(
      userId,
      "linkedin",
      next.searchParams.get("state")!,
      "code",
      false,
      fetcher,
    ),
  ).rejects.toThrow("expirou");
  await expect(
    oauth.completeOfficialOAuth(
      userId,
      "infojobs-es",
      first.searchParams.get("state")!,
      "code",
      false,
      fetcher,
    ),
  ).rejects.toThrow("expirou");
  expect(fetcher).not.toHaveBeenCalled();
  await oauth.completeOfficialOAuth(
    userId,
    "infojobs-es",
    next.searchParams.get("state")!,
    "code",
    false,
    fetcher,
  );
});

it("desconectar durante a troca impede restaurar uma autorização antiga", async () => {
  const url = await authorization();
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "private-token", expires_in: 3600 }),
      ),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
  const result = oauth.completeOfficialOAuth(
    userId,
    "infojobs-es",
    url.searchParams.get("state")!,
    "code",
    false,
    fetcher,
  );
  const rejected = expect(result).rejects.toThrow("não confirmou");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await oauth.disconnectOfficialOAuth(userId, "infojobs-es");
  finish(new Response(JSON.stringify({ key: "private-subject" })));
  await rejected;
  expect(
    await oauth.officialOAuthConnection(userId, "infojobs-es"),
  ).toMatchObject({ connected: false, connectedAt: null });
});

it("rejeita callbacks externos e remove os registros ao excluir a conta", async () => {
  const previous = process.env.INFOJOBS_ES_REDIRECT_URI!;
  process.env.INFOJOBS_ES_REDIRECT_URI =
    "https://evil.example/api/oauth/infojobs-es/callback";
  expect(oauth.officialOAuthConfig("infojobs-es")).toBeNull();
  process.env.INFOJOBS_ES_REDIRECT_URI = previous;
  await authorization();
  await database.store.delete("users", eq("id", userId));
  expect(
    await database.store.select("portalOAuthAccounts", {
      where: eq("userId", userId),
    }),
  ).toHaveLength(0);
  expect(
    await database.store.select("portalOAuthStates", {
      where: eq("userId", userId),
    }),
  ).toHaveLength(0);
});
