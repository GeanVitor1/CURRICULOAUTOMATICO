import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

export const PAYLOAD_CHUNK_BYTES = 512 * 1024;
export type PayloadManifest = {
  checksum: string;
  inline?: Buffer;
  count?: number;
  version?: string;
};
export type EncodedPayload = {
  manifest: PayloadManifest;
  chunks: Buffer[];
  changed: boolean;
};
const checksum = (bytes: Buffer) =>
  createHash("sha256").update(bytes.toString("base64")).digest("hex");
export function encodePayload(
  value: unknown,
  previous?: PayloadManifest,
  inlineLimit = PAYLOAD_CHUNK_BYTES,
): EncodedPayload {
  const bytes = gzipSync(Buffer.from(JSON.stringify(value))),
    sum = checksum(bytes);
  if (previous?.checksum === sum)
    return { manifest: previous, chunks: [], changed: false };
  if (bytes.length <= inlineLimit)
    return {
      manifest: { inline: bytes, checksum: sum },
      chunks: [],
      changed: true,
    };
  const chunks: Buffer[] = [];
  for (let i = 0; i < bytes.length; i += PAYLOAD_CHUNK_BYTES)
    chunks.push(bytes.subarray(i, i + PAYLOAD_CHUNK_BYTES));
  return {
    manifest: { checksum: sum, count: chunks.length, version: randomUUID() },
    chunks,
    changed: true,
  };
}

// Private compressed bytes only. Every cache key includes the document path and
// immutable manifest version. Authoritative metadata is always read from Firestore.
// This is a bounded per-process optimization, not durable storage or a quota guarantee.
export class PayloadCache {
  private entries = new Map<string, { bytes: Buffer; expiresAt: number }>();
  private used = 0;
  constructor(
    private maxBytes = 64 * 1024 * 1024,
    private ttlMs = 10 * 60000,
    private now = Date.now,
  ) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expiresAt <= this.now()) {
      this.remove(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.bytes;
  }
  set(key: string, bytes: Buffer) {
    this.remove(key);
    if (bytes.length > this.maxBytes) return;
    for (const [id, entry] of this.entries)
      if (entry.expiresAt <= this.now()) this.remove(id);
    while (this.used + bytes.length > this.maxBytes && this.entries.size)
      this.remove(this.entries.keys().next().value!);
    this.entries.set(key, { bytes, expiresAt: this.now() + this.ttlMs });
    this.used += bytes.length;
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.used -= entry.bytes.length;
      this.entries.delete(key);
    }
  }
  clear() {
    this.entries.clear();
    this.used = 0;
  }
  get sizeBytes() {
    return this.used;
  }
}
export const payloadCache = new PayloadCache();
export const payloadCacheKey = (path: string, manifest: PayloadManifest) =>
  `${path}:${manifest.version || "inline"}:${manifest.checksum}`;
export async function decodePayload(
  path: string,
  manifest: PayloadManifest,
  load: (index: number) => Promise<Buffer>,
): Promise<any> {
  const key = payloadCacheKey(path, manifest);
  let bytes = manifest.inline
    ? Buffer.from(manifest.inline)
    : payloadCache.get(key);
  if (!bytes) {
    if (
      !manifest.version ||
      !Number.isInteger(manifest.count) ||
      manifest.count! < 1 ||
      manifest.count! > 64
    )
      throw Error("Invalid payload manifest");
    const parts: Buffer[] = [];
    for (let i = 0; i < manifest.count!; i++) parts.push(await load(i));
    bytes = Buffer.concat(parts);
    if (checksum(bytes) !== manifest.checksum)
      throw Error("Stored payload checksum mismatch");
    payloadCache.set(key, bytes);
  }
  if (checksum(bytes) !== manifest.checksum)
    throw Error("Stored payload checksum mismatch");
  return JSON.parse(
    gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }).toString("utf8"),
  );
}
export const WORKSPACE_SECTIONS = ["resumes", "jobs", "applications"] as const;
