import { afterEach, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { Firestore } from "@google-cloud/firestore";
import {
  cleanupPayloadGarbage,
  PAYLOAD_GC_GRACE_MS,
} from "../server/firestore-payload-gc";
import {
  encodePayload,
  decodePayload,
  payloadCache,
} from "../server/firestore-payload";

afterEach(() => payloadCache.clear());

it("keeps a concurrent reader's obsolete chunks alive, then reclaims only the retired version", async () => {
  const now = Date.now(),
    parent = "workspaces/test";
  const oldValue = randomBytes(700 * 1024).toString("base64");
  const old = encodePayload(oldValue),
    current = encodePayload("replacement");
  const chunks = new Map(
    old.chunks.map((bytes, i) => [
      `${parent}/chunks/${old.manifest.version}-${i}`,
      bytes,
    ]),
  );
  chunks.set(
    `${parent}/chunks/${current.manifest.version}-0`,
    Buffer.from("current"),
  );
  const tasks = new Map([
    [
      "retired",
      {
        parent,
        version: old.manifest.version,
        count: old.chunks.length,
        createdAt: new Date(now),
      },
    ],
  ]);
  const reference = (path: string): any => ({
    path,
    collection: (name: string) => ({
      doc: (id: string) => reference(`${path}/${name}/${id}`),
    }),
  });
  const queried = vi.fn();
  const db = {
    doc: reference,
    collection: () => ({
      where: (field: string, operator: string, cutoff: Date) => {
        queried(field, operator, cutoff);
        return {
          limit: () => ({
            get: async () => ({
              docs: [...tasks]
                .filter(([, task]) => task.createdAt <= cutoff)
                .map(([id, task]) => ({
                  data: () => task,
                  ref: {
                    delete: async () => {
                      tasks.delete(id);
                    },
                  },
                })),
            }),
          }),
        };
      },
    }),
    batch: () => {
      const paths: string[] = [];
      return {
        delete: (ref: { path: string }) => paths.push(ref.path),
        commit: async () => {
          paths.forEach((path) => chunks.delete(path));
        },
      };
    },
  } as unknown as Firestore;

  // The reader already obtained old.manifest when the writer replaced the root.
  await cleanupPayloadGarbage(db, now);
  expect(queried).toHaveBeenCalledWith(
    "createdAt",
    "<=",
    new Date(now - PAYLOAD_GC_GRACE_MS),
  );
  expect(
    await decodePayload(parent, old.manifest, async (i) =>
      chunks.get(`${parent}/chunks/${old.manifest.version}-${i}`)!,
    ),
  ).toBe(oldValue);
  expect(tasks.size).toBe(1);
  await cleanupPayloadGarbage(db, now + PAYLOAD_GC_GRACE_MS - 1);
  expect(tasks.size).toBe(1);
  await cleanupPayloadGarbage(db, now + PAYLOAD_GC_GRACE_MS);
  expect(tasks.size).toBe(0);
  expect(chunks.size).toBe(1);
  expect(chunks.has(`${parent}/chunks/${current.manifest.version}-0`)).toBe(
    true,
  );
});
