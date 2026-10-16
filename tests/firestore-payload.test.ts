import { afterEach, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  PayloadCache,
  encodePayload,
  decodePayload,
  payloadCache,
  PAYLOAD_CHUNK_BYTES,
} from "../server/firestore-payload";
afterEach(() => payloadCache.clear());
it("reuses an unchanged immutable payload without rewriting chunks", () => {
  const value = randomBytes(1100 * 1024).toString("base64"),
    first = encodePayload(value);
  expect(first.chunks.length).toBeGreaterThan(1);
  expect(first.chunks.every((b) => b.length <= PAYLOAD_CHUNK_BYTES)).toBe(true);
  const next = encodePayload(value, first.manifest);
  expect(next.changed).toBe(false);
  expect(next.chunks).toHaveLength(0);
  expect(next.manifest).toBe(first.manifest);
});
it("caches private bytes by document and version, invalidates by content, and rejects corruption", async () => {
  const value = randomBytes(700 * 1024).toString("base64"),
    encoded = encodePayload(value),
    read = vi.fn(async (i: number) => encoded.chunks[i]);
  expect(await decodePayload("alice/file", encoded.manifest, read)).toBe(value);
  const coldReads = read.mock.calls.length;
  expect(coldReads).toBeGreaterThan(1);
  expect(await decodePayload("alice/file", encoded.manifest, read)).toBe(value);
  expect(read).toHaveBeenCalledTimes(coldReads);
  expect(await decodePayload("bob/file", encoded.manifest, read)).toBe(value);
  expect(read).toHaveBeenCalledTimes(2 * coldReads);
  await expect(
    decodePayload(
      "alice/file",
      { ...encoded.manifest, checksum: "invalid" },
      async () => Buffer.from("wrong"),
    ),
  ).rejects.toThrow("checksum");
  const replaced = encodePayload("new file");
  expect(await decodePayload("alice/file", replaced.manifest, read)).toBe(
    "new file",
  );
});
it("bounds memory and lifetime without treating an in-memory cache as persistence", () => {
  let now = 0;
  const cache = new PayloadCache(8, 10, () => now);
  cache.set("one", Buffer.alloc(4));
  cache.set("two", Buffer.alloc(4));
  expect(cache.get("one")).toHaveLength(4);
  cache.set("three", Buffer.alloc(4));
  expect(cache.get("two")).toBeUndefined();
  expect(cache.sizeBytes).toBe(8);
  now = 11;
  expect(cache.get("one")).toBeUndefined();
  cache.set("oversized", Buffer.alloc(9));
  expect(cache.get("oversized")).toBeUndefined();
  cache.clear();
  expect(cache.sizeBytes).toBe(0);
});
