import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { db } from "./db";
import { googleOAuthStates, sessions, users, workspaces } from "./schema";
import { createWorkspace } from "./workspace";
import { RequestError } from "./errors";

export type GoogleIntent = "signin" | "link" | "reauthenticate";
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
  try {
    if (
      !process.env.GOOGLE_CLIENT_ID?.trim() ||
      !process.env.GOOGLE_CLIENT_SECRET?.trim()
    )
      return false;
    const callback = new URL(process.env.GOOGLE_REDIRECT_URI || "");
    const origins = (
      process.env.APP_ORIGIN || "http://127.0.0.1:5173,http://localhost:5173"
    )
      .split(",")
      .map((value) => value.trim());
    return (
      origins.includes(callback.origin) &&
      callback.pathname === "/api/auth/google/callback" &&
      !callback.username &&
      !callback.password &&
      !callback.search &&
      !callback.hash &&
      (callback.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" &&
          callback.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname)))
    );
  } catch {
    return false;
  }
}
export function googleSignInUrl() {
  return googleOAuthConfigured()
    ? new URL("/api/auth/google/start", process.env.GOOGLE_REDIRECT_URI!).href
    : null;
}

export async function beginGoogleOAuth(
  intent: GoogleIntent = "signin",
  sessionToken?: string,
) {
  if (!googleOAuthConfigured())
    throw new GoogleOAuthError("unavailable", intent);
  let userId: string | undefined;
  const sessionHash = sessionToken ? hash(sessionToken) : undefined;
  if (intent !== "signin") {
    if (!sessionHash) throw new GoogleOAuthError("session_expired", intent);
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.token, sessionHash),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!session) throw new GoogleOAuthError("session_expired", intent);
    userId = session.userId;
  }
  const state = random(),
    browserToken = random(),
    nonce = random();
  const codeVerifier = randomBytes(48).toString("base64url");
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  await db
    .delete(googleOAuthStates)
    .where(lt(googleOAuthStates.expiresAt, new Date()));
  await db.insert(googleOAuthStates).values({
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
    scope: "openid email profile",
    state,
    nonce,
    access_type: "online",
    prompt: "select_account",
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
  const [challenge] = await db
    .delete(googleOAuthStates)
    .where(
      and(
        eq(googleOAuthStates.stateHash, hash(input.state)),
        eq(googleOAuthStates.browserHash, hash(input.browserToken)),
        gt(googleOAuthStates.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!challenge) throw new GoogleOAuthError("expired");
  const intent = challenge.intent as GoogleIntent;
  if (input.denied) throw new GoogleOAuthError("denied", intent);
  if (!input.code) throw new GoogleOAuthError("failed", intent);
  if (
    !googleOAuthConfigured() ||
    challenge.clientId !== process.env.GOOGLE_CLIENT_ID?.trim() ||
    challenge.redirectUri !== process.env.GOOGLE_REDIRECT_URI
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
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: challenge.redirectUri,
        code_verifier: challenge.codeVerifier,
      }),
    });
    if (!response.ok) throw new GoogleOAuthError("failed", intent);
    const token = z
      .object({ id_token: z.string().min(1) })
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
    const user = await db.transaction(async (tx) => {
      if (intent !== "signin") {
        const [session] = await tx
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.token, challenge.sessionHash!),
              gt(sessions.expiresAt, new Date()),
            ),
          )
          .for("update");
        if (!session || session.userId !== challenge.userId)
          throw new GoogleOAuthError("session_expired", intent);
        const [account] = await tx
          .select()
          .from(users)
          .where(eq(users.id, challenge.userId!))
          .for("update");
        if (!account) throw new GoogleOAuthError("session_expired", intent);
        if (intent === "reauthenticate") {
          if (account.googleSub !== profile.sub)
            throw new GoogleOAuthError("wrong_account", intent);
        } else {
          if (
            account.email !== email ||
            (account.googleSub && account.googleSub !== profile.sub)
          )
            throw new GoogleOAuthError("wrong_account", intent);
          const [owner] = await tx
            .select()
            .from(users)
            .where(eq(users.googleSub, profile.sub));
          if (owner && owner.id !== account.id)
            throw new GoogleOAuthError("account_exists", intent);
          await tx
            .update(users)
            .set({ googleSub: profile.sub })
            .where(eq(users.id, account.id));
        }
        await tx
          .update(sessions)
          .set({ googleAuthenticatedAt: new Date() })
          .where(eq(sessions.token, session.token));
        return account;
      }
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.googleSub, profile.sub));
      if (existing) return existing;
      // Existing password accounts are linked only from their authenticated account page.
      const [collision] = await tx
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (collision) throw new GoogleOAuthError("account_exists", intent);
      const [created] = await tx
        .insert(users)
        .values({
          id: randomUUID(),
          email,
          googleSub: profile.sub,
          password: null,
          name: (profile.name?.trim() || email.split("@")[0]).slice(0, 100),
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        const [concurrent] = await tx
          .select()
          .from(users)
          .where(eq(users.googleSub, profile.sub));
        if (concurrent) return concurrent;
        throw new GoogleOAuthError("account_exists", intent);
      }
      await tx.insert(workspaces).values({
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
