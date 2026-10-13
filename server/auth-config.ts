type Environment = Record<string, string | undefined>;

export const hostedOnVercel = (env: Environment = process.env) =>
  env.VERCEL === "1" && env.VERCEL_ENV !== "development";

export const secureAuthCookies = (env: Environment = process.env) =>
  env.NODE_ENV === "production" || hostedOnVercel(env);

const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function publicOrigin(value: string, env: Environment) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (secureAuthCookies(env)
      ? url.protocol !== "https:" || loopback.has(url.hostname)
      : url.protocol !== "https:" &&
        !(url.protocol === "http:" && loopback.has(url.hostname)))
  )
    throw new Error("Configure APP_ORIGIN com a origem pública HTTPS do site.");
  return url.origin;
}

export function appOrigins(env: Environment = process.env): string[] {
  let origins = env.APP_ORIGIN?.trim();
  if (!origins && hostedOnVercel(env)) {
    const domain =
      env.VERCEL_ENV === "preview"
        ? env.VERCEL_URL
        : env.VERCEL_PROJECT_PRODUCTION_URL;
    if (domain) origins = `https://${domain}`;
  }
  if (!origins && !secureAuthCookies(env))
    origins = "http://127.0.0.1:5173,http://localhost:5173";
  return origins
    ? origins.split(",").map((value) => publicOrigin(value.trim(), env))
    : [];
}

export function googleOAuthConfig(env: Environment = process.env) {
  try {
    const clientId = env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    const origins = appOrigins(env);
    if (!clientId || !clientSecret || !origins.length) return null;
    const callback = new URL(
      env.GOOGLE_REDIRECT_URI?.trim() || "/api/auth/google/callback",
      origins[0],
    );
    if (
      !origins.includes(publicOrigin(callback.origin, env)) ||
      callback.pathname !== "/api/auth/google/callback" ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash
    )
      return null;
    return {
      clientId,
      clientSecret,
      redirectUri: callback.href,
      origin: callback.origin,
    };
  } catch {
    return null;
  }
}

export function requirePersistentDatabase(env: Environment = process.env) {
  if (hostedOnVercel(env) && !env.DATABASE_URL?.trim())
    throw new Error(
      "Configure DATABASE_URL com PostgreSQL na Vercel para persistir contas e sessões.",
    );
}

export function validateHostedRuntime(env: Environment = process.env) {
  requirePersistentDatabase(env);
  if (!hostedOnVercel(env)) return;
  if (!appOrigins(env).length)
    throw new Error("Configure APP_ORIGIN com o domínio público da aplicação.");
  if (
    !env.ENCRYPTION_KEY ||
    Buffer.from(env.ENCRYPTION_KEY, "base64").length !== 32
  )
    throw new Error(
      "Configure ENCRYPTION_KEY com uma chave fixa de 32 bytes em base64 na Vercel.",
    );
}
