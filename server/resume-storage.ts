import { readFile, writeFile } from "node:fs/promises";
import { encryptSecret, decryptSecret } from "./intelligence";
import type { Resume, Workspace } from "../shared/types";
import { hostedOnVercel } from "./auth-config";

export function archiveResumeFile(
  bytes: Buffer,
  extension: ".pdf" | ".docx",
): NonNullable<Resume["storedFile"]> {
  return { extension, ciphertext: encryptSecret(bytes.toString("base64")) };
}
export function restoreResumeFile(file: NonNullable<Resume["storedFile"]>) {
  return Buffer.from(decryptSecret(file.ciphertext), "base64");
}
export function publicWorkspace(w: Workspace): Workspace {
  return {
    ...w,
    resumes: w.resumes.map(({ storedFile, ...resume }) => ({
      ...resume,
      originalFileAvailable: !!storedFile || !hostedOnVercel(),
    })),
  };
}

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
