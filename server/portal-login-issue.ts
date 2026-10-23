import { identityHost } from "./portal-browser-policy";

export function providerLoginIssue(address: string, text: string, chromeConnection = false): string {
  if (!identityHost(address)) return "";
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (
    !/disallowed_useragent|this browser or app may not be secure|(?:este|esse) navegador ou app pode nao ser seguro|couldn.t sign you in|nao foi possivel fazer (?:o )?login|access blocked|acesso bloqueado/i.test(
      normalized,
    ) &&
    !/\/signin\/rejected|\/deniedsigninrejected/i.test(
      new URL(address).pathname,
    )
  )
    return "";
  const provider =
    new URL(address).hostname === "accounts.google.com"
      ? "Google"
      : "O provedor";
  if (chromeConnection) return `${provider} recusou o login neste navegador na nuvem. Use “Conectar pelo meu Chrome” e entre na Gupy pelo seu navegador habitual. A sessão só será transferida com sua autorização e verificada antes da confirmação.`;
  return `${provider} recusou o login neste navegador na nuvem. Volte ao portal e entre com e-mail, senha ou código, conforme as opções disponíveis. Se sua conta usa somente esse provedor, configure outra forma de acesso no site oficial antes de tentar conectar novamente.`;
}
