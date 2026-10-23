import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "./storage-types";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { store } from "./db";
import { createWorkspace } from "./workspace";
import { RequestError } from "./errors";
import { googleOAuthConfig } from "./auth-config";
import { GMAIL_SEND_SCOPE, saveGmailConnection } from "./gmail-connection";

export type GoogleIntent = "signin" | "link" | "reauthenticate" | "gmail";
export class GoogleOAuthError extends RequestError {
  constructor(
    public reason: string,
    public intent: GoogleIntent = "signin",
  ) {
    super("Não foi possível concluir o acesso com Google.");
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
export const GOOGLE_COOKIE = "orbita_google_state";
export const GOOGLE_COOKIE_PATH = "/api/auth/google";
export function googleOAuthConfigured() {
  return googleOAuthConfig() !== null;
}
export function googleSignInUrl() {
  const config = googleOAuthConfig();
  return config ? new URL("/api/auth/google/start", config.origin).href : null;
}

export async function beginGoogleOAuth(
  intent: GoogleIntent = "signin",
  sessionToken?: string,
) {
  const config = googleOAuthConfig();
  if (!config) throw new GoogleOAuthError("unavailable", intent);
  let userId: string | undefined;
  const sessionHash = sessionToken ? hash(sessionToken) : undefined;
  if (intent !== "signin") {
    if (!sessionHash) throw new GoogleOAuthError("session_expired", intent);
    const [session] = await store.select("sessions", {
      where: and(eq("token", sessionHash), gt("expiresAt", new Date())),
    });
    if (!session) throw new GoogleOAuthError("session_expired", intent);
    userId = session.userId;
  }
  const state = random(),
    browserToken = random(),
    nonce = random();
  const codeVerifier = randomBytes(48).toString("base64url");
  const { clientId, redirectUri } = config;
  await store.delete("googleOAuthStates", lt("expiresAt", new Date()));
  await store.insert("googleOAuthStates", {
    stateHash: hash(state),
    browserHash: hash(browserToken),
    nonce,
    codeVerifier,
    intent,
    userId,
    sessionHash: intent === "signin" ? null : sessionHash,
    clientId,
    redirectUri,
    expiresAt: new Date(Date.now() + 10 * 60000),
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:
      intent === "gmail"
        ? `openid email ${GMAIL_SEND_SCOPE}`
        : "openid email profile",
    state,
    nonce,
    access_type: intent === "gmail" ? "offline" : "online",
    prompt: intent === "gmail" ? "consent select_account" : "select_account",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update(codeVerifier)
      .digest("base64url"),
  }).toString();
  return { url: url.href, browserToken };
}

export async function completeGoogleOAuth(input: {
  state?: string;
  browserToken?: string;
  sessionToken?: string;
  code?: string;
  denied?: boolean;
}) {
  if (!input.state || !input.browserToken)
    throw new GoogleOAuthError("expired");
  // A matching browser and state consume the challenge atomically, once only.
  const [challenge] = await store.delete(
    "googleOAuthStates",
    and(
      eq("stateHash", hash(input.state)),
      eq("browserHash", hash(input.browserToken)),
      gt("expiresAt", new Date()),
    ),
    true,
  );
  if (!challenge) throw new GoogleOAuthError("expired");
  const intent = challenge.intent as GoogleIntent;
  if (input.denied) throw new GoogleOAuthError("denied", intent);
  if (!input.code) throw new GoogleOAuthError("failed", intent);
  const config = googleOAuthConfig();
  if (
    !config ||
    challenge.clientId !== config.clientId ||
    challenge.redirectUri !== config.redirectUri
  )
    throw new GoogleOAuthError("unavailable", intent);
  if (
    intent !== "signin" &&
    (!input.sessionToken || hash(input.sessionToken) !== challenge.sessionHash)
  )
    throw new GoogleOAuthError("session_expired", intent);
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: challenge.clientId,
        client_secret: config.clientSecret,
        redirect_uri: challenge.redirectUri,
        code_verifier: challenge.codeVerifier,
      }),
    });
    if (!response.ok) throw new GoogleOAuthError("failed", intent);
    const token = z
      .object({
        id_token: z.string().min(1),
        access_token: z.string().optional(),
        refresh_token: z.string().optional(),
        expires_in: z.number().positive().optional(),
        scope: z.string().optional(),
      })
      .parse(await response.json());
    const client = new OAuth2Client({
      clientId: challenge.clientId,
      transporterOptions: { timeout: 15000, retry: false },
    });
    // The official client checks the signature, issuer, audience and expiration.
    const ticket = await client.verifyIdToken({
      idToken: token.id_token,
      audience: challenge.clientId,
    });
    const profile = z
      .object({
        sub: z.string().min(1).max(255),
        email: z.email().max(254),
        email_verified: z.literal(true),
        nonce: z.literal(challenge.nonce),
        name: z.string().optional(),
      })
      .parse(ticket.getPayload());
    const email = profile.email.toLowerCase();
    const user = await store.transaction(async (tx) => {
      if (intent !== "signin") {
        const [session] = await tx.select("sessions", {
          where: and(
            eq("token", challenge.sessionHash!),
            gt("expiresAt", new Date()),
          ),
          lock: true,
        });
        if (!session || session.userId !== challenge.userId)
          throw new GoogleOAuthError("session_expired", intent);
        const [account] = await tx.select("users", {
          where: eq("id", challenge.userId!),
          lock: true,
        });
        if (!account) throw new GoogleOAuthError("session_expired", intent);
        if (intent === "gmail") {
          if (account.email !== email)
            throw new GoogleOAuthError("wrong_account", intent);
          try {
            await saveGmailConnection(tx, account.id, email, token);
          } catch {
            throw new GoogleOAuthError("gmail_permission", intent);
          }
          return account;
        } else if (intent === "reauthenticate") {
          if (account.googleSub !== profile.sub)
            throw new GoogleOAuthError("wrong_account", intent);
        } else {
          if (
            account.email !== email ||
            (account.googleSub && account.googleSub !== profile.sub)
          )
            throw new GoogleOAuthError("wrong_account", intent);
          const [owner] = await tx.select("users", {
            where: eq("googleSub", profile.sub),
          });
          if (owner && owner.id !== account.id)
            throw new GoogleOAuthError("account_exists", intent);
          await tx.update(
            "users",
            { googleSub: profile.sub },
            eq("id", account.id),
          );
        }
        await tx.update(
          "sessions",
          { googleAuthenticatedAt: new Date() },
          eq("token", session.token),
        );
        return account;
      }
      const [existing] = await tx.select("users", {
        where: eq("googleSub", profile.sub),
      });
      if (existing) return existing;
      // Existing password accounts are linked only from their authenticated account page.
      const [collision] = await tx.select("users", {
        where: eq("email", email),
      });
      if (collision) throw new GoogleOAuthError("account_exists", intent);
      const [created] = await tx.insert(
        "users",
        {
          id: randomUUID(),
          email,
          googleSub: profile.sub,
          password: null,
          name: (profile.name?.trim() || email.split("@")[0]).slice(0, 100),
        },
        { conflict: "ignore", returning: true },
      );
      if (!created) {
        const [concurrent] = await tx.select("users", {
          where: eq("googleSub", profile.sub),
        });
        if (concurrent) return concurrent;
        throw new GoogleOAuthError("account_exists", intent);
      }
      await tx.insert("workspaces", {
        id: `${created.id}:live`,
        userId: created.id,
        demo: false,
        data: createWorkspace(created.name, created.email),
      });
      return created;
    });
    return { user, intent };
  } catch (error) {
    if (error instanceof GoogleOAuthError) throw error;
    if (
      (error as any)?.code === "23505" ||
      (error as any)?.cause?.code === "23505"
    )
      throw new GoogleOAuthError("account_exists", intent);
    throw new GoogleOAuthError("failed", intent);
  }
}
