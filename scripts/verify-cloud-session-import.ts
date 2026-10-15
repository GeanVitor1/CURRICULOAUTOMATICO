import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
dotenv.config({ path: ".env.production.local", quiet: true });
dotenv.config({ path: ".env.antigravity-owner.local", quiet: true });
dotenv.config({ path: ".env.portal-cloud.local", quiet: true });
process.env.VERCEL_OIDC_TOKEN = dotenv.parse(
  await readFile(".env.antigravity.local"),
).VERCEL_OIDC_TOKEN;
const { cloudPortalCommand, cloudConnectionMetadata } =
  await import("../server/portal-cloud");
const { closeDb } = await import("../server/db");
const owner =
  process.env.PORTAL_CLOUD_OWNER_ID || process.env.ANTIGRAVITY_OWNER_ID;
if (!owner) throw new Error("Owner not configured");
try {
  if (await cloudConnectionMetadata(owner, "gupy"))
    throw new Error("Do not replace a connected portal during verification");
  let refused = false;
  try {
    await cloudPortalCommand(owner, "gupy", {
      op: "import",
      resumeId: "synthetic-probe",
      state: {
        cookies: [
          {
            name: "qa_non_authenticated",
            value: "synthetic-not-a-session",
            domain: ".gupy.io",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("login compartilhado não foi confirmado")
    )
      throw error;
    refused = true;
  }
  if (!refused || (await cloudConnectionMetadata(owner, "gupy")))
    throw new Error("An unverified session must not become connected");
  console.log(
    JSON.stringify({
      cloudImportHandlerExecuted: true,
      unverifiedSessionRefused: true,
      portalNotFalselyConnected: true,
      applicationsSubmitted: 0,
    }),
  );
} finally {
  await closeDb();
}
