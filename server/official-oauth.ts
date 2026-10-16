import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { store } from "./db";
import { and, eq, gt } from "./storage-types";
import { encryptSecret, decryptSecret } from "./intelligence";
import { appOrigins } from "./auth-config";
import { RequestError } from "./errors";
import {
  officialOAuthProviders,
  type OfficialOAuthProvider,
  type OfficialOAuthConnection,
} from "../shared/official-oauth";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const accountId = (userId: string, provider: OfficialOAuthProvider) =>
  `${userId}:${provider}`;
const details = {
  linkedin: {
    prefix: "LINKEDIN",
    scope: "openid profile email",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    profileUrl: "https://api.linkedin.com/v2/userinfo",
  },
  "infojobs-es": {
    prefix: "INFOJOBS_ES",
    scope: "candidate_profile_with_email",
    tokenUrl: "https://www.infojobs.net/oauth/authorize",
    profileUrl: "https://api.infojobs.net/api/6/candidate",
  },
} as const;

export function officialOAuthConfig(provider: OfficialOAuthProvider) {
  try {
    const prefix = details[provider].prefix;
    const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
    const redirectUri = process.env[`${prefix}_REDIRECT_URI`]?.trim();
    if (!clientId || !clientSecret || !redirectUri) return null;
    const callback = new URL(redirectUri);
    if (
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash ||
      callback.pathname !== `/api/oauth/${provider}/callback` ||
      !appOrigins().includes(callback.origin)
    )
      return null;
    return { clientId, clientSecret, redirectUri };
  } catch {
    return null;
  }
}

type SavedAccount = {
  clientId: string;
  accountId: string;
  accountName: string | null;
  scopes: string[];
  // Tokens from the Spanish API never authorize Brazilian submissions.
  accessToken?: string;
  refreshToken?: string;
};

export async function officialOAuthConnection(
  userId: string,
  provider: OfficialOAuthProvider,
): Promise<OfficialOAuthConnection> {
  const [row] = await store.select("portalOAuthAccounts", {
    where: eq("id", accountId(userId, provider)),
  });
  let saved: SavedAccount | null = null;
  if (row?.encryptedData) {
    try {
      saved = JSON.parse(decryptSecret(row.encryptedData));
    } catch {
      /* Invalidated credential. */
    }
  }
  const expiresAt = row?.expiresAt?.getTime() || null;
  const config = officialOAuthConfig(provider);
  const configured = !!config;
  const clientMatches = !!config && saved?.clientId === config.clientId;
  return {
    id: provider,
    ...officialOAuthProviders[provider],
    configured,
    connected: !!(
      clientMatches &&
      saved &&
      expiresAt &&
      expiresAt > Date.now()
    ),
    expired: !!(
      row?.encryptedData &&
      (!saved || !clientMatches || !expiresAt || expiresAt <= Date.now())
    ),
    connectedAt: saved ? row?.connectedAt?.getTime() || null : null,
    expiresAt,
    accountName: saved?.accountName || null,
    automaticApplications: false,
  };
}

export async function beginOfficialOAuth(
  userId: string,
  provider: OfficialOAuthProvider,
) {
  const config = officialOAuthConfig(provider);
  if (!config)
    throw new RequestError(
      `A conexão oficial do ${officialOAuthProviders[provider].name} precisa ser configurada no servidor.`,
    );
  const state = randomBytes(32).toString("base64url"),
    stateHash = hash(state);
  const id = accountId(userId, provider);
  await store.transaction(async (tx) => {
    const [user] = await tx.select("users", {
      where: eq("id", userId),
      lock: true,
    });
    if (!user) throw new RequestError("Sua sessão expirou. Entre novamente.");
    await tx.select("portalOAuthAccounts", { where: eq("id", id), lock: true });
    const account = { id, userId, provider, generation: stateHash };
    await tx.insert("portalOAuthAccounts", account, {
      conflict: { generation: stateHash },
    });
    const challenge = {
      id,
      userId,
      provider,
      stateHash,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60000),
    };
    await tx.insert("portalOAuthStates", challenge, { conflict: challenge });
  });
  const url = new URL(officialOAuthProviders[provider].authorizationUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: details[provider].scope,
  }).toString();
  return url.href;
}

export async function completeOfficialOAuth(
  userId: string,
  provider: OfficialOAuthProvider,
  state: string,
  code?: string,
  denied = false,
  fetcher: typeof fetch = fetch,
) {
  const id = accountId(userId, provider);
  // Consumption is atomic in the shared DB, across Vercel instances. One row
  // per user/provider also bounds expired-state storage without a global scan.
  const [challenge] = await store.delete(
    "portalOAuthStates",
    and(
      eq("id", id),
      eq("stateHash", hash(state)),
      gt("expiresAt", new Date(Date.now())),
    ),
    true,
  );
  if (!challenge)
    throw new RequestError(
      "A autorização não corresponde a esta conta, expirou ou já foi utilizada. Conecte novamente.",
    );
  if (denied || !code)
    throw new RequestError(
      `A autorização do ${officialOAuthProviders[provider].name} não foi concluída.`,
    );
  const config = officialOAuthConfig(provider);
  if (
    !config ||
    config.clientId !== challenge.clientId ||
    config.redirectUri !== challenge.redirectUri
  )
    throw new RequestError(
      "A configuração da conexão mudou. Conecte novamente.",
    );
  try {
    const response = await fetcher(details[provider].tokenUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }),
    });
    if (!response.ok) throw new Error("Token exchange failed");
    const token = z
      .object({
        access_token: z.string().min(1).max(16384),
        expires_in: z
          .number()
          .finite()
          .positive()
          .max(366 * 86400),
        refresh_token: z.string().min(1).max(16384).optional(),
      })
      .parse(await response.json());
    const authorization =
      provider === "infojobs-es"
        ? `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")},Bearer ${token.access_token}`
        : `Bearer ${token.access_token}`;
    const profile = await fetcher(details[provider].profileUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: authorization },
    });
    if (!profile.ok) throw new Error("Profile verification failed");
    const raw = await profile.json();
    const verified =
      provider === "linkedin"
        ? z
            .object({
              sub: z.string().min(1).max(255),
              name: z.string().max(300).optional(),
            })
            .parse(raw)
        : z
            .object({
              key: z.string().min(1).max(255),
              fullName: z.string().max(300).optional(),
            })
            .parse(raw);
    const saved: SavedAccount = {
      clientId: config.clientId,
      accountId: "sub" in verified ? verified.sub : verified.key,
      accountName:
        ("name" in verified
          ? verified.name
          : "fullName" in verified
            ? verified.fullName
            : null) || null,
      scopes: details[provider].scope.split(" "),
      ...(provider === "infojobs-es"
        ? { accessToken: token.access_token, refreshToken: token.refresh_token }
        : {}),
    };
    const now = new Date(Date.now());
    await store.transaction(async (tx) => {
      const [current] = await tx.select("portalOAuthAccounts", {
        where: eq("id", id),
        lock: true,
      });
      if (!current || current.generation !== challenge.stateHash)
        throw new Error("Authorization replaced");
      await tx.update(
        "portalOAuthAccounts",
        {
          encryptedData: encryptSecret(JSON.stringify(saved)),
          connectedAt: now,
          expiresAt: new Date(now.getTime() + token.expires_in * 1000),
        },
        eq("id", id),
      );
    });
  } catch {
    throw new RequestError(
      `O ${officialOAuthProviders[provider].name} não confirmou a autenticação. Tente conectar novamente.`,
    );
  }
}

export async function disconnectOfficialOAuth(
  userId: string,
  provider: OfficialOAuthProvider,
) {
  const id = accountId(userId, provider);
  await store.transaction(async (tx) => {
    await tx.select("portalOAuthAccounts", { where: eq("id", id), lock: true });
    await tx.delete("portalOAuthStates", eq("id", id));
    await tx.delete("portalOAuthAccounts", eq("id", id));
  });
}
