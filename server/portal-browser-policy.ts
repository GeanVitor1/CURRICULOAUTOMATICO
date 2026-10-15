import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { BrowserContext, Page } from "playwright";
import {
  candidatePortals,
  candidatePortalLoginUrls,
  type PortalId,
} from "../shared/portals";

export type CandidatePortal = (typeof candidatePortals)[number];
export const portalLogin: Record<CandidatePortal, string> =
  candidatePortalLoginUrls;
export function identityHost(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      ["accounts.google.com", "www.linkedin.com", "linkedin.com"].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}
export const loginNavigationAllowed = (
  portal: PortalId,
  value: string,
  interactive = false,
) => portalHost(portal, value) || (interactive && identityHost(value));
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
  options: {
    interactiveLogin?: boolean;
    onBlockedNavigation?: (page: Page) => void;
  } = {},
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
        !loginNavigationAllowed(portal, url.href, options.interactiveLogin)
      ) {
        options.onBlockedNavigation?.(request.frame().page());
        return await route.abort();
      }
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
