import { GoogleAuth, IdentityPoolClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

export function firestoreAuth() {
  const audience = process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE;
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (audience && serviceAccount) {
    const client = new IdentityPoolClient({
      audience,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
      scopes: ["https://www.googleapis.com/auth/datastore"],
    });
    return new GoogleAuth({
      authClient: client,
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  // Hospedagem fora da Vercel (ex.: Render): chave JSON de conta de serviço.
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json)
    return new GoogleAuth({
      credentials: JSON.parse(json.startsWith("{") ? json : Buffer.from(json, "base64").toString("utf8")),
      projectId: process.env.FIREBASE_PROJECT_ID,
      scopes: ["https://www.googleapis.com/auth/datastore"],
    });
  // Local development uses the emulator or explicit Application Default Credentials.
  return new GoogleAuth({
    projectId: process.env.FIREBASE_PROJECT_ID,
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
}
