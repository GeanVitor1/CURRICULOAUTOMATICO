import type { BrowserContext } from "playwright";
import { lookup } from "node:dns/promises";
import { publicAddress, publicUrl } from "./public-web";
import {detectAts} from './ats-registry';
export function atsExecutionHosts(value:string){
 const destination=publicUrl(value);
 return [destination.hostname,...(detectAts(value)?.platform==='quickin'?['api.quickin.io']:[])];
}

/** Pin Chromium to the address checked here so a second DNS answer cannot reach a private host. */
export async function atsHostResolverRules(destinationUrl: string) {
  const destination = publicUrl(destinationUrl);
  return (await Promise.all(atsExecutionHosts(destination.href).map(async host=>{
  const addresses = await lookup(host, { all: true });
  if (
    !addresses.length ||
    addresses.some((entry) => !publicAddress(entry.address))
  )
    throw new Error("Destino de rede não permitido.");
  const selected =
    addresses.find((entry) => entry.family === 4) || addresses[0];
  const address =
    selected.family === 6 ? `[${selected.address}]` : selected.address;
  return `MAP ${host} ${address}`;
  }))).join(',');
}

export async function guardAtsPage(
  context: BrowserContext,
  destinationUrl: string,
) {
  const destination = publicUrl(destinationUrl);
  const origins=new Set(atsExecutionHosts(destinationUrl).map(host=>`https://${host}`));
  const addresses = await lookup(destination.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((entry) => !publicAddress(entry.address))
  )
    throw new Error("Destino de rede não permitido.");
  // Only the verified origin receives requests. No analytics, third-party forms or external navigation.
  await context.route("**/*", async (route) => {
    try {
      const url = publicUrl(route.request().url());
      if (!origins.has(url.origin)) return await route.abort();
      await route.continue();
    } catch {
      await route.abort();
    }
  });
}
