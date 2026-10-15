import { createHash } from "node:crypto";
import type { CandidatePortal } from "./portal-browser-policy";

export function cloudPortalEnabled(userId: string, portal: CandidatePortal) {
  return (
    process.env.PORTAL_CLOUD_ENABLED === "true" &&
    portal !== "linkedin" &&
    !!process.env.PORTAL_CLOUD_SNAPSHOT_ID &&
    userId ===
      (process.env.PORTAL_CLOUD_OWNER_ID || process.env.ANTIGRAVITY_OWNER_ID) &&
    (process.env.PORTAL_CLOUD_PORTALS || "gupy,infojobs,glassdoor")
      .split(",")
      .includes(portal)
  );
}
export const portalSandboxName = (userId: string, portal: CandidatePortal) =>
  "empregatos-portal-" +
  createHash("sha256").update(`${userId}:${portal}`).digest("hex").slice(0, 24);
