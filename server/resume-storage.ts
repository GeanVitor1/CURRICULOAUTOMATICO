import { readFile, writeFile } from "node:fs/promises";
import { encryptSecret, decryptSecret } from "./intelligence";

const marker = "EMPREGATOS-RESUME-V1\n";
export async function writePrivateResume(path: string, bytes: Buffer) {
  await writeFile(path, marker + encryptSecret(bytes.toString("base64")), {
    mode: 0o600,
  });
}
export async function readPrivateResume(path: string) {
  const stored = await readFile(path);
  if (!stored.subarray(0, marker.length).equals(Buffer.from(marker)))
    return stored;
  return Buffer.from(
    decryptSecret(stored.subarray(marker.length).toString("utf8")),
    "base64",
  );
}
