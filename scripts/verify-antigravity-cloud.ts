import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
const cloud = dotenv.parse(await readFile(".env.antigravity.local"));
process.env.VERCEL_OIDC_TOKEN = cloud.VERCEL_OIDC_TOKEN;
dotenv.config({ path: ".env.antigravity-owner.local", quiet: true });
const { antigravityStatus, startAntigravityLogin, disconnectAntigravity } =
  await import("../server/antigravity");
const owner = process.env.ANTIGRAVITY_OWNER_ID;
if (!owner)
  throw new Error("Configure the owner before verifying the cloud runtime");
const status = await antigravityStatus(owner);
if (status.connected)
  throw new Error("Verification must not replace a connected Google account");
try {
  const login = await startAntigravityLogin(owner);
  if (!("url" in login) || !login.url)
    throw new Error("Google authorization did not start");
  console.log(
    JSON.stringify({
      cloudRuntime: true,
      officialGoogleLogin:
        new URL(login.url).hostname === "accounts.google.com",
      authorizationCodeRequired: true,
      otherUsersHaveAccess: (await antigravityStatus("different-owner"))
        .available,
    }),
  );
} finally {
  await disconnectAntigravity(owner);
}
