/** Cliente OAuth do login do Firebase CLI que renova o access_token sozinho via refresh_token. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { OAuth2Client } from "google-auth-library";

// Credenciais públicas do Firebase CLI (app "instalado"; o segredo não é confidencial).
const CLI_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

export function firebaseCliClient() {
  const config = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  const refresh = config.tokens?.refresh_token;
  if (!refresh) throw new Error("Sem refresh_token do Firebase CLI. Rode uma vez: npx firebase login");
  const client = new OAuth2Client({ clientId: CLI_CLIENT_ID, clientSecret: CLI_CLIENT_SECRET });
  client.setCredentials({ refresh_token: refresh });
  return client;
}
