import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { publicAddress, publicUrl } from "./public-web";

/** Multipart POST/receipt GET with DNS pinned to the IP that passed validation.
 * Never follows redirects, retries a submission, or buffers an unbounded reply.
 */
export const publicFormRequest: typeof fetch = async (input, init) => {
  const form = new Request(input, init);
  const url = publicUrl(form.url);
  if (!["GET", "POST"].includes(form.method) || form.redirect === "follow")
    throw new Error("Método ou redirecionamento não permitido.");
  const signal = AbortSignal.any([form.signal, AbortSignal.timeout(25000)]);
  const body = form.body ? Buffer.from(await form.arrayBuffer()) : undefined;
  if (body && body.length > 6 * 1024 * 1024)
    throw new Error("Formulário excede o limite de envio.");
  signal.throwIfAborted();
  // Also bound DNS waiting; a stalled resolver must not hold a worker forever.
  const addresses = await new Promise<
    Awaited<ReturnType<typeof resolveAddresses>>
  >((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    resolveAddresses(url.hostname)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some((entry) => !publicAddress(entry.address))
  )
    throw new Error("Destino de rede não permitido.");
  const pinned = addresses[0];
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: form.method,
        signal,
        family: pinned.family,
        agent: false,
        headers: Object.fromEntries(form.headers.entries()),
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
          if (size > 1500000) {
            response.destroy(new Error("Resposta excede o limite de leitura."));
            return;
          }
          parts.push(part);
        });
        response.on("error", reject);
        response.on("end", () => {
          const status = response.statusCode || 502;
          if (status < 200 || status > 599) {
            reject(new Error("Resposta HTTP inválida."));
            return;
          }
          if (
            form.redirect === "error" &&
            [301, 302, 303, 307, 308].includes(status)
          ) {
            reject(new Error("Redirecionamento não permitido."));
            return;
          }
          const headers = new Headers();
          for (const name of ["content-type", "location"]) {
            const value = response.headers[name];
            if (typeof value === "string") headers.set(name, value);
          }
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : Buffer.concat(parts),
              { status, headers },
            ),
          );
        });
      },
    );
    req.on("error", reject);
    req.on("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("Upgrade de conexão não permitido."));
    });
    req.end(body);
  });
};

const resolveAddresses = (hostname: string) => lookup(hostname, { all: true });
