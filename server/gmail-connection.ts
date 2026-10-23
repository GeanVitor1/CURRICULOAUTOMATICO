import { z } from "zod";
import { store } from "./db";
import { eq, type Store } from "./storage-types";
import { encryptSecret, decryptSecret } from "./intelligence";
import { googleOAuthConfig } from "./auth-config";
import { RequestError } from "./errors";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const accountKey = (userId: string) => `${userId}:gmail-send`;
const credentialsSchema = z.object({
  clientId: z.string(),
  email: z.email(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  scopes: z.array(z.string()),
});
export async function saveGmailConnection(
  tx: Store,
  userId: string,
  email: string,
  token: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  },
) {
  const config = googleOAuthConfig();
  if (
    !config ||
    !token.scope?.split(" ").includes(GMAIL_SEND_SCOPE) ||
    !token.refresh_token ||
    !token.access_token
  )
    throw new RequestError(
      "Autorize o envio de e-mails e o acesso offline na conexão com Google.",
    );
  const credentials = credentialsSchema.parse({
    clientId: config.clientId,
    email,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + Math.min(token.expires_in || 3600, 86400) * 1000,
    scopes: token.scope.split(" "),
  });
  const values = {
    id: accountKey(userId),
    userId,
    provider: "gmail-send",
    generation: crypto.randomUUID(),
    encryptedData: encryptSecret(JSON.stringify(credentials)),
    connectedAt: new Date(),
    expiresAt: new Date(credentials.expiresAt),
  };
  await tx.insert("portalOAuthAccounts", values, { conflict: values });
}
async function savedAccount(userId: string) {
  const [row] = await store.select("portalOAuthAccounts", {
    where: eq("id", accountKey(userId)),
  });
  if (!row?.encryptedData) return null;
  try {
    const saved = credentialsSchema.parse(
      JSON.parse(decryptSecret(row.encryptedData)),
    );
    if (
      saved.clientId !== googleOAuthConfig()?.clientId ||
      !saved.scopes.includes(GMAIL_SEND_SCOPE)
    )
      return null;
    return { saved, generation: row.generation };
  } catch {
    return null;
  }
}
export async function gmailConnection(userId: string) {
  const account = await savedAccount(userId);
  return {
    configured: !!googleOAuthConfig(),
    connected: !!account,
    email: account?.saved.email || null,
    permission: "send_only" as const,
  };
}
export async function disconnectGmail(userId: string) {
  // Deleting the encrypted credential immediately stops this application's future sends.
  await store.delete("portalOAuthAccounts", eq("id", accountKey(userId)));
}
export async function gmailAccessToken(
  userId: string,
  expectedEmail: string,
  fetcher: typeof fetch = fetch,
) {
  const account = await savedAccount(userId),
    config = googleOAuthConfig();
  if (
    !account ||
    !config ||
    account.saved.email.toLowerCase() !== expectedEmail.toLowerCase()
  )
    throw new RequestError(
      "Conecte o Gmail correspondente ao seu e-mail de candidatura nas preferências.",
    );
  const { saved, generation } = account;
  if (saved.expiresAt > Date.now() + 60000) return saved.accessToken;
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: saved.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!response.ok)
    throw new RequestError(
      "A conexão Gmail precisa ser autorizada novamente nas preferências.",
    );
  const token = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive().max(86400),
      scope: z.string().optional(),
    })
    .parse(await response.json());
  if (token.scope && !token.scope.split(" ").includes(GMAIL_SEND_SCOPE))
    throw new RequestError("A permissão de envio do Gmail foi removida.");
  saved.accessToken = token.access_token;
  saved.expiresAt = Date.now() + token.expires_in * 1000;
  const updated = await store.transaction(async (tx) => {
    const [current] = await tx.select("portalOAuthAccounts", {
      where: eq("id", accountKey(userId)),
      lock: true,
    });
    if (current?.generation !== generation || !current.encryptedData)
      return false;
    await tx.update(
      "portalOAuthAccounts",
      {
        encryptedData: encryptSecret(JSON.stringify(saved)),
        expiresAt: new Date(saved.expiresAt),
      },
      eq("id", accountKey(userId)),
    );
    return true;
  });
  if (!updated)
    throw new RequestError("A conexão Gmail mudou. Revise antes de enviar.");
  return saved.accessToken;
}
