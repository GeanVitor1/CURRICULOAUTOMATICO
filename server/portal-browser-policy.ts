import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { BrowserContext } from "playwright";
import { candidatePortals, type PortalId } from "../shared/portals";

export type CandidatePortal = (typeof candidatePortals)[number];
export const portalLogin: Record<CandidatePortal, string> = {
  linkedin: "https://www.linkedin.com/login/",
  gupy: "https://login.gupy.io/candidates/signin",
  infojobs: "https://www.infojobs.com.br/candidate/",
  glassdoor: "https://www.glassdoor.com/member/profile/login",
};
export function portalHost(portal: PortalId, value: string) {
  try {
    const u = new URL(value);
    const roots =
      portal === "glassdoor"
        ? ["glassdoor.com", "glassdoor.com.br"]
        : [
            portal === "gupy"
              ? "gupy.io"
              : portal === "infojobs"
                ? "infojobs.com.br"
                : "linkedin.com",
          ];
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      roots.some(
        (root) => u.hostname === root || u.hostname.endsWith(`.${root}`),
      )
    );
  } catch {
    return false;
  }
}
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Only globally routable IPv6 unicast; mapped IPv4 is deliberately refused.
  return isIP(ip) === 6 && /^[23]/i.test(ip) && !/^2001:(db8|0:)/i.test(ip);
}
export async function protectBrowser(
  context: BrowserContext,
  portal: CandidatePortal,
) {
  const hosts = new Map<string, Promise<boolean>>();
  await context.route("**/*", async (route) => {
    try {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.protocol !== "https:" ||
        (url.port && url.port !== "443") ||
        url.username ||
        url.password
      )
        return await route.abort();
      // Candidate sessions never follow application redirects to an unrelated employer/ATS.
      // Identity providers can only be visited during an explicitly interactive login.
      if (
        request.isNavigationRequest() &&
        request.frame().parentFrame() === null &&
        !portalHost(portal, url.href)
      )
        return await route.abort();
      let allowed = hosts.get(url.hostname);
      if (!allowed) {
        allowed = lookup(url.hostname, { all: true })
          .then(
            (rows) =>
              rows.length > 0 &&
              rows.every((row) => publicAddress(row.address)),
          )
          .catch(() => false);
        hosts.set(url.hostname, allowed);
      }
      if (!(await allowed)) return await route.abort();
      await route.continue();
    } catch {
      await route.abort().catch(() => {});
    }
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
}
