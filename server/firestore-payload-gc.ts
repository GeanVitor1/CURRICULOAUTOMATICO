import type { Firestore } from "@google-cloud/firestore";

// A reader can hold an earlier manifest while a different worker commits its
// replacement. Keep immutable chunks beyond the maximum transaction lifetime.
export const PAYLOAD_GC_GRACE_MS = 30 * 60 * 1000;

export async function cleanupPayloadGarbage(db: Firestore, now = Date.now()) {
  const cutoff = new Date(now - PAYLOAD_GC_GRACE_MS);
  const snapshots = await db
    .collection("_payload_gc")
    .where("createdAt", "<=", cutoff)
    .limit(10)
    .get();
  for (const snapshot of snapshots.docs) {
    const value = snapshot.data();
    for (let start = 0; start < value.count; start += 200) {
      const batch = db.batch();
      for (let i = start; i < Math.min(start + 200, value.count); i++)
        batch.delete(
          db
            .doc(value.parent)
            .collection("chunks")
            .doc(`${value.version}-${i}`),
        );
      await batch.commit();
    }
    await snapshot.ref.delete();
  }
}
