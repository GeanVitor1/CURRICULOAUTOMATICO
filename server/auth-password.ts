import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Keep the existing salt:digest format so current accounts remain compatible.
const dummyHash = "0".repeat(32) + ":" + "0".repeat(128);
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash?: string) {
  const valid = !!storedHash && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(storedHash);
  const [salt, digest] = (valid ? storedHash! : dummyHash).split(":");
  const actual = await derive(password, salt);
  // Unknown accounts also perform scrypt; error messages and hash cost stay uniform.
  return timingSafeEqual(Buffer.from(digest, "hex"), actual) && valid;
}
