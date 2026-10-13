import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";

const args = process.argv.slice(2);
const envFlag = args.indexOf("--output-env");
const envFile =
  envFlag >= 0
    ? resolve(args.splice(envFlag, 2)[1] || ".env")
    : resolve(".env");
const originFlag = args.indexOf("--origin");
const explicitOrigin =
  originFlag >= 0 ? args.splice(originFlag, 2)[1] : undefined;
try {
  const input = args[0] || "google-client.local.json";
  const raw = await readFile(resolve(input), "utf8").catch((error) => {
    if (!args[0] && error.code === "ENOENT")
      throw new Error(
        "Salve o JSON do cliente OAuth Web como google-client.local.json na pasta do projeto ou execute: npm run configure:google -- /caminho/client_secret.json",
      );
    throw error;
  });
  const credentials = JSON.parse(raw).web;
  if (
    !credentials ||
    typeof credentials.client_id !== "string" ||
    !credentials.client_id.endsWith(".apps.googleusercontent.com") ||
    typeof credentials.client_secret !== "string" ||
    !credentials.client_secret.trim() ||
    !Array.isArray(credentials.redirect_uris)
  )
    throw new Error(
      "O arquivo precisa ser o JSON de um cliente OAuth do tipo Aplicativo da Web.",
    );
  let content = await readFile(envFile, "utf8").catch(() =>
    readFile(resolve(".env.example"), "utf8").catch(() => ""),
  );
  const current = parse(content);
  const origin = (
    explicitOrigin ||
    current.APP_ORIGIN ||
    "http://127.0.0.1:5173"
  )
    .split(",")[0]
    .trim();
  const callback =
    (!explicitOrigin && current.GOOGLE_REDIRECT_URI) ||
    new URL("/api/auth/google/callback", origin).href;
  const callbackUrl = new URL(callback);
  if (
    callbackUrl.origin !== origin ||
    callbackUrl.pathname !== "/api/auth/google/callback" ||
    callbackUrl.search ||
    callbackUrl.hash ||
    callbackUrl.username ||
    callbackUrl.password
  )
    throw new Error(
      "GOOGLE_REDIRECT_URI precisa usar a origem do APP_ORIGIN e o caminho /api/auth/google/callback.",
    );
  if (!credentials.redirect_uris.includes(callback))
    throw new Error(
      `Adicione este URI de redirecionamento no cliente Google Cloud e baixe o JSON novamente: ${callback}`,
    );
  const updates = {
    ...(explicitOrigin ? { APP_ORIGIN: origin } : {}),
    GOOGLE_CLIENT_ID: credentials.client_id.trim(),
    GOOGLE_CLIENT_SECRET: credentials.client_secret.trim(),
    GOOGLE_REDIRECT_URI: callback,
  };
  for (const [key, value] of Object.entries(updates)) {
    if (/[\r\n"\\]/.test(value))
      throw new Error("O arquivo contém uma credencial em formato inesperado.");
    const line = `${key}="${value}"`;
    const expression = new RegExp(`^${key}=.*$`, "m");
    content = expression.test(content)
      ? content.replace(expression, () => line)
      : `${content.trimEnd()}\n${line}\n`;
  }
  await writeFile(envFile, content, { mode: 0o600 });
  await chmod(envFile, 0o600);
  console.log(`Google configurado em ${envFile}. Nenhuma chave foi exibida.`);
  console.log(`Callback: ${callback}`);
  console.log(
    `Reinicie npm run dev e abra ${origin}/login para continuar com Google.`,
  );
} catch (error) {
  // Never print downloaded credential objects, parsing fragments or tokens.
  const message =
    error instanceof SyntaxError
      ? "O arquivo de credenciais não contém JSON válido."
      : error?.code
        ? "Não foi possível ler ou salvar o arquivo de configuração."
        : error.message;
  console.error(message);
  process.exitCode = 1;
}
