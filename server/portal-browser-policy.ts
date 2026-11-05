import { lookup } from "node:dns/promises";
import { publicAddress } from "./public-web";
export { publicAddress } from "./public-web";
import type { BrowserContext } from "playwright";
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
export async function protectBrowser(
  context: BrowserContext,
  portal: CandidatePortal,
  options: {
    interactiveLogin?: boolean;
    onBlockedNavigation?: () => void;
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
      let topNavigation = false;
      if (request.isNavigationRequest()) {
        try {
          topNavigation = request.frame().parentFrame() === null;
        } catch {
          // The initial popup request can precede the creation of its frame.
          // Apply the same strict navigation policy rather than aborting it.
          topNavigation = true;
        }
      }
      if (
        topNavigation &&
        !loginNavigationAllowed(portal, url.href, options.interactiveLogin)
      ) {
        options.onBlockedNavigation?.();
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
