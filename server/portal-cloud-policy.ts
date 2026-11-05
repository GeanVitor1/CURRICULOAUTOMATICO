import { createHash } from "node:crypto";
import type { CandidatePortal } from "./portal-browser-policy";

export function cloudPortalEnabled(userId: string, portal: CandidatePortal) {
  return (
    portal !== 'linkedin' &&
    process.env.PORTAL_CLOUD_ENABLED === "true" &&
    !!process.env.PORTAL_CLOUD_SNAPSHOT_ID &&
    !!userId &&
    (process.env.PORTAL_CLOUD_ALL_USERS === "true" ||
      userId ===
        (process.env.PORTAL_CLOUD_OWNER_ID ||
          process.env.ANTIGRAVITY_OWNER_ID)) &&
    (process.env.PORTAL_CLOUD_SESSION_PORTALS || process.env.PORTAL_CLOUD_PORTALS || "gupy,infojobs,glassdoor")
      .split(",")
      .includes(portal)
  );
}
/** A saved login does not grant a provider's application integration. */
export function cloudPortalCanApply(userId:string,portal:CandidatePortal){
 return portal!=='linkedin'&&cloudPortalEnabled(userId,portal)&&
  (process.env.PORTAL_CLOUD_PORTALS||'gupy,infojobs,glassdoor').split(',').includes(portal);
}
export const portalSandboxName = (userId: string, portal: CandidatePortal) =>
  "empregatos-portal-" +
  createHash("sha256").update(`${userId}:${portal}`).digest("hex").slice(0, 24);
