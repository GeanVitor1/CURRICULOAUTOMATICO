import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  // Accept only global unicast IPv6; excludes loopback, mapped IPv4, ULA and link-local.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:(?:0*:|db8:)/i.test(address) &&
    !/^2002:/i.test(address)
  );
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hostname.endsWith(".") ||
    !url.hostname.includes(".") ||
    /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) ||
    (isIP(url.hostname.replace(/[\[\]]/g, "")) &&
      !publicAddress(url.hostname.replace(/[\[\]]/g, "")))
  )
    throw new Error("Destino público HTTPS inválido.");
  return url;
}
export type PublicPage = {
  url: string;
  status: number;
  html: string;
  contentType: string;
};
/** Resolve DNS once and pin that IP to the socket. Every redirect is independently validated. */
export async function readPublicPage(
  value: string,
  signal = AbortSignal.timeout(12000),
): Promise<PublicPage> {
  let url = publicUrl(value);
  for (let hop = 0; hop < 5; hop++) {
    const addresses = await lookup(url.hostname, { all: true });
    if (
      !addresses.length ||
      addresses.some((entry) => !publicAddress(entry.address))
    )
      throw new Error("Destino de rede não permitido.");
    const pinned = addresses[0];
    signal.throwIfAborted();
    const result = await new Promise<{
      status: number;
      location?: string;
      contentType: string;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          signal,
          family: pinned.family,
          headers: {
            Accept: "text/html,application/json",
            "User-Agent": "EmpreGatos/1.0 (+public-job-discovery)",
          },
          lookup: (_hostname, options, done) =>
            (done as Function)(
              null,
              (options as { all?: boolean }).all ? [pinned] : pinned.address,
              pinned.family,
            ),
        },
        (response) => {
          const parts: Buffer[] = [];
          let size = 0;
          response.on("data", (part: Buffer) => {
            size += part.length;
            // Employer social posts may include a large public comment tree.
            // Keep a fixed ceiling while allowing their structured job evidence.
            const limit = url.hostname==='candidatos.abler.com.br'&&url.pathname==='/sitemap.xml'
              ? 6000000 : /(^|\.)linkedin\.com$/.test(url.hostname) ? 3000000 : 1500000;
            if (size > limit) {
              response.destroy(new Error("Página excede o limite de leitura."));
              return;
            }
            parts.push(part);
          });
          response.on("error", reject);
          response.on("end", () =>
            resolve({
              status: response.statusCode || 0,
              location: response.headers.location,
              contentType: String(response.headers["content-type"] || ""),
              body: Buffer.concat(parts).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
      url = publicUrl(new URL(result.location, url).href);
      continue;
    }
    return {
      url: url.href,
      status: result.status,
      html: result.body,
      contentType: result.contentType,
    };
  }
  throw new Error("Limite de redirecionamentos atingido.");
}
