import { afterEach, expect, it, vi } from "vitest";
import type { Firestore } from "@google-cloud/firestore";
import { firestoreStore } from "../server/storage-firestore";
import { encodePayload, payloadCache } from "../server/firestore-payload";
import { eq } from "../server/storage-types";
afterEach(() => payloadCache.clear());

it("fetches independent workspace sections concurrently and reconstructs them in order", async () => {
  const values = [
    { profile: { name: "Synthetic" } },
    [{ id: "resume" }],
    [{ id: "job" }],
    [{ id: "application" }],
  ];
  const encoded = values.map((value) => encodePayload(value, undefined, 0));
  const manifests = encoded.map((e) => e.manifest);
  const raw = {
    id: "account:live",
    data: {},
    _payload: manifests[0],
    _sections: {
      resumes: manifests[1],
      jobs: manifests[2],
      applications: manifests[3],
    },
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const root = {
    path: "workspaces/synthetic",
    get: async () => ({ exists: true, data: () => raw }),
    collection: () => ({ doc: (id: string) => ({ id }) }),
  };
  const getAll = vi.fn(async (...refs: { id: string }[]) => {
    // Serial decoding cannot reach all four calls and fails the bounded test.
    if (getAll.mock.calls.length === 4) release();
    await gate;
    return refs.map((ref) => {
      const index = manifests.findIndex((m) => ref.id.startsWith(m.version!));
      return { data: () => ({ bytes: encoded[index].chunks[0] }) };
    });
  });
  const db = {
    collection: () => ({ doc: () => root }),
    getAll,
  } as unknown as Firestore;
  const rows = await firestoreStore(db).select("workspaces", {
    where: eq("id", "account:live"),
  });
  expect(getAll).toHaveBeenCalledTimes(4);
  expect(rows[0].data).toEqual({
    ...values[0],
    resumes: values[1],
    jobs: values[2],
    applications: values[3],
  });
}, 2000);
