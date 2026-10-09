import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { dataDir, mutateWorkspace } from "./db";
import { encryptSecret, decryptSecret } from "./intelligence";
import { RequestError } from "./errors";

type OAuthState = { state: string; expiresAt: number };
type IdentityConnection = {
  connectedAt: string;
  expiresAt: number;
  scopes: string[];
};
const directory = resolve(dataDir, "oauth");
const file = (userId: string, kind: string) =>
  resolve(
    directory,
    createHash("sha256").update(userId).digest("hex") + "." + kind + ".enc",
  );
export function linkedinOAuthConfigured() {
  try {
    const callback = new URL(process.env.LINKEDIN_REDIRECT_URI || "");
    return (
      !!process.env.LINKEDIN_CLIENT_ID &&
      !!process.env.LINKEDIN_CLIENT_SECRET &&
      !callback.username &&
      !callback.password &&
      !callback.hash &&
      callback.pathname === "/api/oauth/linkedin/callback" &&
      (callback.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          callback.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(callback.hostname)))
    );
  } catch {
    return false;
  }
}
async function save(userId: string, kind: string, value: unknown) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = file(userId, kind),
    temporary = destination + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    await writeFile(temporary, encryptSecret(JSON.stringify(value)), {
      mode: 0o600,
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function linkedinIdentity(
  userId: string,
): Promise<IdentityConnection | null> {
  try {
    return JSON.parse(
      decryptSecret(await readFile(file(userId, "identity"), "utf8")),
    );
  } catch {
    return null;
  }
}
export async function beginLinkedinOAuth(userId: string) {
  if (!linkedinOAuthConfigured())
    throw new RequestError(
      "O OAuth oficial do LinkedIn precisa ser configurado no servidor.",
    );
  const state = randomBytes(32).toString("base64url");
  await mutateWorkspace(`${userId}:live`, async () => {
    await save(userId, "generation", state);
    await save(userId, "state", {
      state,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
  });
  return (
    "https://www.linkedin.com/oauth/v2/authorization?" +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
      state,
      scope: "openid profile email",
    })
  );
}
export async function completeLinkedinOAuth(
  userId: string,
  state: string,
  code?: string,
  denied = false,
  fetcher: typeof fetch = fetch,
) {
  // Rename atomically to consume the challenge once, including concurrent callbacks.
  const source = file(userId, "state"),
    consumed = source + "." + randomBytes(8).toString("hex");
  let challenge: OAuthState;
  try {
    await rename(source, consumed);
    challenge = JSON.parse(decryptSecret(await readFile(consumed, "utf8")));
  } catch {
    throw new RequestError(
      "A autorização expirou ou já foi utilizada. Conecte novamente.",
    );
  } finally {
    await rm(consumed, { force: true });
  }
  if (challenge.state !== state || challenge.expiresAt < Date.now())
    throw new RequestError(
      "A autorização não corresponde a esta conta ou expirou.",
    );
  if (denied || !code)
    throw new RequestError("A autorização do LinkedIn não foi concluída.");
  if (!linkedinOAuthConfigured())
    throw new RequestError("OAuth indisponível nesta instalação.");
  try {
    const response = await fetcher(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      },
    );
    if (!response.ok) throw new Error();
    const token = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (
      !token.access_token ||
      typeof token.expires_in !== "number" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    )
      throw new Error();
    const expiresIn = token.expires_in;
    const profile = await fetcher("https://api.linkedin.com/v2/userinfo", {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (
      !profile.ok ||
      typeof ((await profile.json()) as { sub?: string }).sub !== "string"
    )
      throw new Error();
    // Identity only: no job permissions, resume changes, cookies or tokens persisted.
    await mutateWorkspace(`${userId}:live`, async () => {
      // Disconnect, account deletion or a newer authorization wins over a delayed exchange.
      const current = JSON.parse(
        decryptSecret(await readFile(file(userId, "generation"), "utf8")),
      );
      if (current !== state) throw new Error("Authorization replaced");
      await save(userId, "identity", {
        connectedAt: new Date().toISOString(),
        expiresAt: Date.now() + expiresIn * 1000,
        scopes: (token.scope || "openid profile email")
          .split(/\s+/)
          .filter((v) => ["openid", "profile", "email"].includes(v)),
      });
      await rm(file(userId, "generation"), { force: true });
    });
  } catch {
    throw new RequestError(
      "O LinkedIn não confirmou a autenticação. Tente conectar novamente.",
    );
  }
}
export async function disconnectLinkedinIdentity(userId: string) {
  await mutateWorkspace(`${userId}:live`, async () => {
    await Promise.all(
      ["identity", "state", "generation"].map((kind) =>
        rm(file(userId, kind), { force: true }),
      ),
    );
  });
}
