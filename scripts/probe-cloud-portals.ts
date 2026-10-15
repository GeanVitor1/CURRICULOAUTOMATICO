import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import type { CandidatePortal } from "../server/portal-browser-policy";
import type { PortalLoginFrame } from "../server/portal-browser-service";
dotenv.config({ path: ".env.production.local", quiet: true });
dotenv.config({ path: ".env.antigravity-owner.local", quiet: true });
dotenv.config({ path: ".env.portal-cloud.local", quiet: true });
const cloud = dotenv.parse(await readFile(".env.antigravity.local"));
process.env.VERCEL_OIDC_TOKEN = cloud.VERCEL_OIDC_TOKEN;
const { cloudPortalCommand } = await import("../server/portal-cloud");
const { closeDb } = await import("../server/db");
const owner =
  process.env.PORTAL_CLOUD_OWNER_ID || process.env.ANTIGRAVITY_OWNER_ID;
if (!owner) throw new Error("Owner not configured");
const requested = process.argv.slice(2);
const portals = requested.length
  ? requested
  : ["gupy", "infojobs", "glassdoor"];
try {
  for (const value of portals) {
    if (!["gupy", "infojobs", "glassdoor"].includes(value))
      throw new Error("Invalid portal");
    const portal = value as CandidatePortal;
    try {
      const frame = await cloudPortalCommand<PortalLoginFrame>(owner, portal, {
        op: "open",
      });
      await writeFile(
        `.data/cloud-${portal}-login.jpg`,
        Buffer.from(frame.image.split(",")[1], "base64"),
      );
      console.log(
        JSON.stringify({
          portal,
          loaded: true,
          address: frame.address,
          blocked: frame.blocked,
          notice: frame.notice,
          fields: frame.fields.map((f) => ({ label: f.label, type: f.type })),
          authenticated: frame.authenticated,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          portal,
          loaded: false,
          error: error instanceof Error ? error.message : "Unknown",
        }),
      );
    } finally {
      await cloudPortalCommand(owner, portal, { op: "close" }).catch(() => {});
    }
  }
} finally {
  await closeDb();
}
