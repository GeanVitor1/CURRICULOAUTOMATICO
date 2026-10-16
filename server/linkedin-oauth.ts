import {
  officialOAuthConfig,
  officialOAuthConnection,
  beginOfficialOAuth,
  completeOfficialOAuth,
  disconnectOfficialOAuth,
} from "./official-oauth";
export const linkedinOAuthConfigured = () => !!officialOAuthConfig("linkedin");
export async function linkedinIdentity(userId: string) {
  const connection = await officialOAuthConnection(userId, "linkedin");
  if (!connection.configured) return null;
  return connection.connectedAt
    ? {
        connectedAt: new Date(connection.connectedAt).toISOString(),
        expiresAt: connection.connected ? connection.expiresAt || 0 : 0,
        scopes: ["openid", "profile", "email"],
      }
    : null;
}
export const beginLinkedinOAuth = (userId: string) =>
  beginOfficialOAuth(userId, "linkedin");
export const completeLinkedinOAuth = (
  userId: string,
  state: string,
  code?: string,
  denied = false,
  fetcher: typeof fetch = fetch,
) => completeOfficialOAuth(userId, "linkedin", state, code, denied, fetcher);
export const disconnectLinkedinIdentity = (userId: string) =>
  disconnectOfficialOAuth(userId, "linkedin");
