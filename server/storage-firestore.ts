import {
  Firestore,
  Filter,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from "@google-cloud/firestore";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  encodePayload,
  decodePayload,
  WORKSPACE_SECTIONS,
  payloadCache,
  payloadCacheKey,
  type PayloadManifest,
} from "./firestore-payload";
import type { Workspace } from "../shared/types";
import type {
  Condition,
  NewRow,
  Query,
  Row,
  Store,
  Table,
  WriteOptions,
} from "./storage-types";
import { collectionNames, keys, eq, and } from "./storage-types";
import { firestoreAuth } from "./firestore-auth";
import { submissionState } from "./submission-state";
import { pausedBeforeSubmission } from "./submission-attempts";
import { cleanupPayloadGarbage } from "./firestore-payload-gc";

const BULK: Partial<Record<Table, string>> = {
  workspaces: "data",
  resumeFiles: "ciphertext",
  sourceCatalog: "jobs",
  opportunityCatalog: "job",
};
// Each chunk stays well below Firestore's 1 MiB document limit, including metadata.
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const idFor = (table: Table, row: Record<string, any>) =>
  hash(JSON.stringify(keys[table].map((k) => row[k])));
const uniqueFields: Partial<Record<Table, string[]>> = {
  users: ["email", "googleSub"],
  subscriptions: ["customerId", "subscriptionId"],
};
const uniqueRef = (
  db: Firestore,
  table: Table,
  field: string,
  value: unknown,
) => db.collection("_unique").doc(hash(JSON.stringify([table, field, value])));
const conflict = () =>
  Object.assign(new Error("Este registro já existe."), { code: "23505" });
function defaults(
  table: Table,
  values: Record<string, any>,
): Record<string, any> {
  const now = new Date();
  const base: Record<Table, Record<string, any>> = {
    users: { password: null, googleSub: null, createdAt: now },
    sessions: { googleAuthenticatedAt: null },
    googleOAuthStates: { userId: null, sessionHash: null },
    portalOAuthStates: {},
    portalOAuthAccounts: {
      encryptedData: null,
      connectedAt: null,
      expiresAt: null,
    },
    workspaces: { demo: false, updatedAt: now },
    resumeFiles: {},
    aiSettings: {
      provider: "local",
      model: "",
      enabled: false,
      consent: false,
      encryptedKey: null,
      updatedAt: now,
    },
    subscriptions: {
      subscriptionId: null,
      plan: "free",
      status: "inactive",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      checkoutId: null,
      checkoutUrl: null,
      checkoutExpiresAt: null,
      updatedAt: now,
    },
    billingEvents: { processedAt: now },
    applicationUsage: { createdAt: now },
    discoveryTasks: {
      status: "queued",
      attempts: 0,
      leaseUntil: null,
      leaseToken: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    },
    sourceCatalog: {
      sector: "Não informado",
      country: "",
      jobs: [],
      fetchedAt: null,
      expiresAt: null,
      retryAt: null,
      leaseUntil: null,
      leaseToken: null,
      lastError: null,
    },
    opportunityCatalog: { fetchedAt: now, leaseToken: null, leaseUntil: null },
    resolutionTasks: {
      requestedJobIds: [],
      status: "queued",
      attempts: 0,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    },
  };
  return {
    ...base[table],
    ...Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined),
    ),
  };
}
function dates(value: any): any {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(dates);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, dates(v)]),
    );
  return value;
}
function matches(row: Record<string, any>, where?: Condition): boolean {
  if (!where) return true;
  if ("conditions" in where)
    return where.op === "and"
      ? where.conditions.every((c) => matches(row, c))
      : where.conditions.some((c) => matches(row, c));
  let a = row[where.field],
    b: any = where.value;
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  switch (where.op) {
    case "==":
      return a === b;
    case "!=":
      return a != null && a !== b;
    case "<":
      return a != null && a < b;
    case ">":
      return a != null && a > b;
    case "in":
      return (b as any[]).includes(a);
    case "not-in":
      return a != null && !(b as any[]).includes(a);
  }
}
function nativeFilter(c: Condition): Filter {
  if ("conditions" in c)
    return (c.op === "and" ? Filter.and : Filter.or)(
      ...c.conditions.map(nativeFilter),
    );
  return Filter.where(c.field, c.op, c.value);
}
function equalities(c?: Condition): Record<string, any> {
  if (!c) return {};
  if ("conditions" in c)
    return c.op === "and"
      ? Object.assign({}, ...c.conditions.map(equalities))
      : {};
  return c.op === "==" ? { [c.field]: c.value } : {};
}
function conditionFields(c?: Condition): string[] {
  return !c
    ? []
    : "conditions" in c
      ? c.conditions.flatMap(conditionFields)
      : [c.field];
}
function projections(w: Workspace) {
  const attempts: Record<string, number> = {};
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  for (const a of w.applications) {
    if (pausedBeforeSubmission(a)) continue;
    const days = new Set<string>();
    for (const e of a.history)
      if (e.message.startsWith("Envio iniciado."))
        days.add(
          new Date(e.at).toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo",
          }),
        );
    if (a.mode === "automatic" && a.submittedAt)
      days.add(
        new Date(a.submittedAt).toLocaleDateString("en-CA", {
          timeZone: "America/Sao_Paulo",
        }),
      );
    for (const day of days)
      if (
        day >=
          new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10) &&
        day <= today
      )
        attempts[day] = (attempts[day] || 0) + 1;
  }
  return {
    _routine: w.routine,
    _latestResumeId: w.resumes[0]?.id || "",
    _portals: w.infrastructure.portalConnections || {},
    _sending: w.applications.some((a) => a.status === "Enviando"),
    _attempts: attempts,
    _submission: submissionState(w, ""),
    _singlePending: w.applications.some(
      (a) => a.status === "Aguardando aprovação" && !!a.singleSubmission,
    ),
  };
}
type Pending = {
  ref: DocumentReference;
  table?: Table;
  row: DocumentData | null;
  raw?: DocumentData;
  original?: DocumentData;
};
export function firestoreStore(db: Firestore, native?: Transaction): Store {
  const namespace = process.env.FIREBASE_PROJECT_ID || "firestore";
  const pending = new Map<string, Pending>(),
    cache = new Map<string, DocumentData | null>();
  const readRaw = async (
    ref: DocumentReference,
    fields?: string[],
  ): Promise<DocumentData | null> => {
    if (native && !fields && cache.has(ref.path)) return cache.get(ref.path)!;
    const snap =
      fields && !native
        ? (await db.getAll(ref, { fieldMask: fields }))[0]
        : native
          ? await native.get(ref)
          : await ref.get();
    const raw = snap.exists ? dates(snap.data()) : null;
    if (native) cache.set(ref.path, raw);
    return raw;
  };
  async function unpack(
    table: Table,
    ref: DocumentReference,
    raw: DocumentData,
    columns?: string[],
  ) {
    const row = { ...raw },
      field = BULK[table];
    if (field && (!columns || columns.includes(field)) && raw._payload) {
      const load = async (p: PayloadManifest) => {
        let parts: Promise<FirebaseFirestore.DocumentSnapshot[]> | undefined;
        return decodePayload(`${namespace}/${ref.path}`, p, async (i) => {
          if (!parts) {
            const refs = Array.from({ length: p.count! }, (_, index) =>
              ref.collection("chunks").doc(`${p.version}-${index}`),
            );
            parts = native ? native.getAll(...refs) : db.getAll(...refs);
          }
          const chunk = (await parts)[i].data();
          if (!chunk?.bytes) throw Error("Stored payload is incomplete");
          return Buffer.from(chunk.bytes);
        });
      };
      row[field] = await load(raw._payload);
      if (table === "workspaces" && raw._sections)
        for (const section of WORKSPACE_SECTIONS) {
          const manifest = raw._sections[section];
          if (!manifest) throw Error("Workspace section is missing");
          row[field][section] = await load(manifest);
        }
    }
    for (const k of Object.keys(row)) if (k.startsWith("_")) delete row[k];
    return columns ? Object.fromEntries(columns.map((k) => [k, row[k]])) : row;
  }
  async function roots(table: Table, query: Query = {}) {
    const col = db.collection(collectionNames[table]),
      equals = equalities(query.where);
    let refs: { ref: DocumentReference; raw: DocumentData }[] = [];
    if (keys[table].every((k) => equals[k] !== undefined)) {
      const fields =
        query.columns && !query.columns.includes(BULK[table] || "")
          ? [
              ...new Set([
                ...query.columns,
                ...conditionFields(query.where),
                ...(query.orderBy || []).map((o) => o.field),
              ]),
            ]
          : undefined;
      const ref = col.doc(idFor(table, equals)),
        raw = await readRaw(ref, fields);
      if (raw) refs.push({ ref, raw });
    } else {
      let q: FirebaseFirestore.Query = col;
      if (query.where) q = q.where(nativeFilter(query.where));
      for (const order of query.orderBy || [])
        q = q.orderBy(order.field, order.direction);
      // Include enough candidates to account for staged rows while locking only
      // the next task, rather than every account's queued work.
      if (query.limit)
        q = q.limit(
          query.limit +
            (native
              ? [...pending.values()].filter((p) => p.table === table).length
              : 0),
        );
      if (
        query.columns &&
        !native &&
        !query.columns.includes(BULK[table] || "")
      )
        q = q.select(
          ...new Set([
            ...query.columns,
            ...conditionFields(query.where),
            ...(query.orderBy || []).map((o) => o.field),
          ]),
        );
      const snapshot = native ? await native.get(q) : await q.get();
      refs = snapshot.docs.map((s) => {
        const raw = dates(s.data());
        if (native) cache.set(s.ref.path, raw);
        return { ref: s.ref, raw };
      });
    }
    const map = new Map(refs.map((r) => [r.ref.path, r]));
    for (const p of pending.values())
      if (p.table === table) {
        if (!p.row) map.delete(p.ref.path);
        else map.set(p.ref.path, { ref: p.ref, raw: p.raw || p.row });
      }
    let result = [...map.values()].filter((r) =>
      matches(pending.get(r.ref.path)?.row || r.raw, query.where),
    );
    for (const order of [...(query.orderBy || [])].reverse())
      result.sort((a, b) => {
        const x = a.raw[order.field],
          y = b.raw[order.field];
        return (
          (x < y ? -1 : x > y ? 1 : 0) * (order.direction === "asc" ? 1 : -1)
        );
      });
    if (query.limit) result = result.slice(0, query.limit);
    return result;
  }
  async function stage(
    table: Table,
    ref: DocumentReference,
    row: DocumentData | null,
    original?: DocumentData | null,
  ) {
    const previous = pending.get(ref.path);
    pending.set(ref.path, {
      ref,
      table,
      row,
      original: previous?.original || original || undefined,
    });
  }
  async function unique(
    table: Table,
    ref: DocumentReference,
    row: DocumentData | null,
    original?: DocumentData | null,
  ) {
    const markers: Pending[] = [];
    for (const field of uniqueFields[table] || []) {
      if (row?.[field] && row[field] !== original?.[field]) {
        const marker = uniqueRef(db, table, field, row[field]),
          existing = pending.has(marker.path)
            ? pending.get(marker.path)!.row
            : await readRaw(marker);
        if (existing && existing.owner !== ref.path) throw conflict();
        if (!existing) markers.push({ ref: marker, row: { owner: ref.path } });
      }
      if (original?.[field] && original[field] !== row?.[field]) {
        const marker = uniqueRef(db, table, field, original[field]);
        await readRaw(marker);
        markers.push({ ref: marker, row: null });
      }
    }
    for (const m of markers) pending.set(m.ref.path, m);
  }
  async function references(table: Table, row: DocumentData) {
    const parent =
      table === "resumeFiles" ||
      table === "discoveryTasks" ||
      table === "resolutionTasks"
        ? ["workspaces", "workspaceId"]
        : [
              "sessions",
              "googleOAuthStates",
              "portalOAuthStates",
              "portalOAuthAccounts",
              "workspaces",
              "aiSettings",
              "subscriptions",
              "applicationUsage",
            ].includes(table)
          ? ["users", "userId"]
          : null;
    if (!parent || !row[parent[1]]) return;
    const ref = db
      .collection(collectionNames[parent[0] as Table])
      .doc(idFor(parent[0] as Table, { id: row[parent[1]] }));
    const existing = pending.has(ref.path)
      ? pending.get(ref.path)!.row
      : await readRaw(ref);
    if (!existing)
      throw Object.assign(new Error("Parent record does not exist"), {
        code: "23503",
      });
  }
  async function usageCounter(row: DocumentData, delta: number) {
    const ref = db
      .collection("_daily_usage")
      .doc(hash(JSON.stringify([row.userId, row.day])));
    const existing = pending.has(ref.path)
      ? pending.get(ref.path)!.row
      : await readRaw(ref);
    const count = Math.max(0, (existing?.count || 0) + delta);
    pending.set(ref.path, {
      ref,
      row: count ? { userId: row.userId, day: row.day, count } : null,
    });
  }
  async function flush() {
    if (!native) throw new Error("Writes require a transaction");
    // All reads, including old chunk metadata and unique markers, finish before
    // issuing any native writes. Firestore may retry the whole unit of work.
    const writes: { ref: DocumentReference; data: DocumentData | null }[] = [];
    const garbage: DocumentReference[] = [];
    const cacheWrites: { key: string; bytes: Buffer }[] = [];
    const collect = (
      ref: DocumentReference,
      old: PayloadManifest | undefined,
      next: PayloadManifest | undefined,
    ) => {
      if (!old?.count || old.version === next?.version) return;
      const task = db
        .collection("_payload_gc")
        .doc(hash(ref.path + ":" + old.version));
      writes.push({
        ref: task,
        data: {
          parent: ref.path,
          version: old.version,
          count: old.count,
          createdAt: new Date(),
        },
      });
      garbage.push(task);
    };
    const pack = (
      ref: DocumentReference,
      value: unknown,
      old?: PayloadManifest,
      inlineLimit?: number,
    ) => {
      const encoded = encodePayload(value, old, inlineLimit);
      if (encoded.chunks.length)
        cacheWrites.push({
          key: payloadCacheKey(`${namespace}/${ref.path}`, encoded.manifest),
          bytes: Buffer.concat(encoded.chunks),
        });
      encoded.chunks.forEach((bytes, i) =>
        writes.push({
          ref: ref.collection("chunks").doc(`${encoded.manifest.version}-${i}`),
          data: { bytes },
        }),
      );
      return encoded.manifest;
    };
    for (const p of pending.values()) {
      if (!p.table) {
        writes.push({ ref: p.ref, data: p.row });
        continue;
      }
      const field = BULK[p.table],
        raw = p.row ? { ...(p.original || {}), ...p.row } : null;
      if (raw && field && Object.hasOwn(p.row!, field)) {
        if (p.table === "workspaces") {
          const body = { ...p.row!.data };
          raw._sections = {};
          for (const section of WORKSPACE_SECTIONS) {
            raw._sections[section] = pack(
              p.ref,
              body[section],
              p.original?._sections?.[section],
              8 * 1024,
            );
            delete body[section];
          }
          raw._payload = pack(
            p.ref,
            body,
            p.original?._sections ? p.original._payload : undefined,
            32 * 1024,
          );
          Object.assign(raw, projections(p.row!.data));
        } else
          raw._payload = pack(
            p.ref,
            p.row![field],
            p.original?._payload,
            p.table === "resumeFiles" ? 8 * 1024 : undefined,
          );
        delete raw[field];
        if (p.table === "sourceCatalog") raw._jobCount = p.row!.jobs.length;
      }
      collect(p.ref, p.original?._payload, raw?._payload);
      for (const section of WORKSPACE_SECTIONS)
        collect(
          p.ref,
          p.original?._sections?.[section],
          raw?._sections?.[section],
        );
      if (!raw || !isDeepStrictEqual(raw, p.original))
        writes.push({ ref: p.ref, data: raw });
    }
    // Fail atomically before committing if a request could exceed Firestore limits.
    const bytesOf = (v: any): number =>
      Buffer.isBuffer(v)
        ? v.length
        : v instanceof Date
          ? 16
          : Array.isArray(v)
            ? v.reduce((s, x) => s + bytesOf(x), 0)
            : v && typeof v === "object"
              ? Object.entries(v).reduce(
                  (s, [k, x]) => s + Buffer.byteLength(k) + bytesOf(x),
                  0,
                )
              : Buffer.byteLength(JSON.stringify(v) || "null");
    const size = writes.reduce(
      (sum, w) => sum + (w.data ? bytesOf(w.data) : 64),
      0,
    );
    if (size > 9 * 1024 * 1024)
      throw new Error(
        "O conjunto de alterações excede o limite da transação. Remova os arquivos em etapas.",
      );
    for (const w of writes)
      if (w.data) native.set(w.ref, w.data, { merge: false });
      else native.delete(w.ref);
    return { garbage, cacheWrites };
  }
  const store: Store = {
    async select(table, query = {}) {
      const out = [];
      for (const { ref, raw } of await roots(table, query)) {
        const staged = pending.get(ref.path)?.row;
        const row = staged
          ? { ...(await unpack(table, ref, raw, query.columns)), ...staged }
          : await unpack(table, ref, raw, query.columns);
        out.push(
          query.columns
            ? Object.fromEntries(query.columns.map((k) => [k, row[k]]))
            : row,
        );
      }
      return out as any;
    },
    async insert(table, values, options: WriteOptions = {}) {
      if (!native)
        return store.transaction((tx) => tx.insert(table, values, options));
      const row = defaults(table, values),
        ref = db.collection(collectionNames[table]).doc(idFor(table, row));
      const existing = pending.has(ref.path)
        ? pending.get(ref.path)!.row
        : await readRaw(ref);
      if (existing) {
        if (options.conflict === "ignore") return [];
        if (options.conflict) {
          await store.update(
            table,
            options.conflict as any,
            and(...keys[table].map((k) => eq(k, row[k]))),
          );
          return options.returning
            ? await store.select(table, {
                where: and(...keys[table].map((k) => eq(k, row[k]))),
              })
            : [];
        }
        throw conflict();
      }
      try {
        await unique(table, ref, row);
      } catch (e) {
        if (options.conflict === "ignore" && (e as any).code === "23505")
          return [];
        throw e;
      }
      await references(table, row);
      if (table === "applicationUsage") await usageCounter(row, 1);
      await stage(table, ref, row);
      return options.returning ? [row as Row<typeof table>] : [];
    },
    async update(table, values, where, returning = false) {
      if (!native)
        return store.transaction((tx) =>
          tx.update(table, values, where, returning),
        );
      const out = [];
      for (const { ref, raw } of await roots(table, { where })) {
        const row = { ...raw, ...pending.get(ref.path)?.row, ...values };
        await unique(table, ref, row, raw);
        await stage(table, ref, row, raw);
        if (returning) {
          const row = {
            ...(await unpack(
              table,
              ref,
              raw,
              Array.isArray(returning) ? returning : undefined,
            )),
            ...values,
          };
          out.push(
            Array.isArray(returning)
              ? Object.fromEntries(returning.map((k) => [k, row[k]]))
              : row,
          );
        }
      }
      return out as any;
    },
    async delete(table, where, returning = false) {
      if (!native)
        return store.transaction((tx) => tx.delete(table, where, returning));
      const out = [];
      for (const { ref, raw } of await roots(table, { where })) {
        if (table === "users") {
          const userId = raw.id;
          for (const child of [
            "sessions",
            "googleOAuthStates",
            "portalOAuthStates",
            "portalOAuthAccounts",
            "aiSettings",
            "subscriptions",
            "applicationUsage",
            "workspaces",
          ] as Table[])
            await store.delete(child, eq("userId", userId));
        }
        if (table === "sessions")
          await store.delete("googleOAuthStates", eq("sessionHash", raw.token));
        if (table === "workspaces")
          for (const child of [
            "resumeFiles",
            "discoveryTasks",
            "resolutionTasks",
          ] as Table[])
            await store.delete(child, eq("workspaceId", raw.id));
        await unique(table, ref, null, raw);
        if (table === "applicationUsage") await usageCounter(raw, -1);
        await stage(table, ref, null, raw);
        if (returning) out.push(await unpack(table, ref, raw));
      }
      return out as any;
    },
    async count(table, where) {
      const equal = equalities(where);
      if (table === "applicationUsage" && equal.userId && equal.day) {
        const ref = db
          .collection("_daily_usage")
          .doc(hash(JSON.stringify([equal.userId, equal.day])));
        const row = pending.has(ref.path)
          ? pending.get(ref.path)!.row
          : await readRaw(ref);
        return row?.count || 0;
      }
      if (native) return (await roots(table, { where })).length;
      let q: FirebaseFirestore.Query = db.collection(collectionNames[table]);
      if (where) q = q.where(nativeFilter(where));
      return (await q.count().get()).data().count;
    },
    async transaction(fn) {
      if (native) return fn(store);
      const committed = await db.runTransaction(
        async (tx) => {
          const unit = firestoreStore(db, tx),
            result = await fn(unit);
          const garbage = await (
            unit as Store & {
              _flush: () => Promise<{
                garbage: DocumentReference[];
                cacheWrites: { key: string; bytes: Buffer }[];
              }>;
            }
          )._flush();
          return { result, ...garbage };
        },
        { maxAttempts: 5 },
      );
      for (const entry of committed.cacheWrites)
        payloadCache.set(entry.key, entry.bytes);
      if (committed.garbage.length)
        await cleanupPayloadGarbage(db).catch(() =>
          console.error(
            JSON.stringify({ event: "firestore_payload_cleanup_pending" }),
          ),
        );
      return committed.result;
    },
    async workspaceRevision(id) {
      const [row] = await store.select("workspaces", {
        where: eq("id", id),
        columns: ["updatedAt"],
      });
      return row?.updatedAt.toISOString() || null;
    },
    async latestResumeId(id) {
      const raw = await readRaw(
        db.collection("workspaces").doc(idFor("workspaces", { id })),
        ["_latestResumeId"],
      );
      return raw?._latestResumeId || "";
    },
    async submissionState(id) {
      const ref = db.collection("workspaces").doc(idFor("workspaces", { id })),
        raw = await readRaw(ref, ["_submission", "userId"]);
      if (!raw) return null;
      if (raw._submission) return { ...raw._submission, userId: raw.userId };
      // Existing workspaces acquire this projection on their next mutation.
      const [row] = await store.select("workspaces", { where: eq("id", id) });
      return row ? submissionState(row.data, row.userId) : null;
    },
    async portalMetadata(userId, portal) {
      const raw = await readRaw(
        db
          .collection("workspaces")
          .doc(idFor("workspaces", { id: `${userId}:live` })),
        ["_portals"],
      );
      return raw?._portals?.[portal] || null;
    },
    async routines() {
      const snap = await db
        .collection("workspaces")
        .where("demo", "==", false)
        .select("id", "_routine")
        .get();
      return snap.docs.map((d) => ({
        id: d.data().id,
        routine: d.data()._routine,
      }));
    },
    async sendingWorkspaceIds() {
      const snap = await db
        .collection("workspaces")
        .where("_sending", "==", true)
        .select("id")
        .get();
      return snap.docs.map((d) => ({ id: d.data().id }));
    },
    async pendingSingleSubmissionWorkspaceIds() {
      const snap = await db
        .collection("workspaces")
        .where("_singlePending", "==", true)
        .select("id")
        .get();
      return snap.docs.map((d) => ({ id: d.data().id }));
    },
    async historicalAttempts(userId, day) {
      const snap = await db
        .collection("workspaces")
        .where("userId", "==", userId)
        .select("_attempts")
        .get();
      return snap.docs.reduce(
        (sum, d) => sum + (d.data()._attempts?.[day] || 0),
        0,
      );
    },
    async catalogMetadata() {
      const snap = await db
        .collection("source_catalog")
        .where("type", "!=", "adzuna")
        .select(
          "key",
          "type",
          "board",
          "company",
          "sector",
          "country",
          "_jobCount",
          "fetchedAt",
          "lastError",
          "retryAt",
          "expiresAt",
        )
        .get();
      return snap.docs.map((d) => ({
        ...dates(d.data()),
        count: d.data()._jobCount || 0,
      }));
    },
    async health() {
      await db.collection("_health").doc("probe").get();
      await cleanupPayloadGarbage(db);
    },
    async close() {
      await db.terminate();
    },
  };
  Object.assign(store, { _flush: flush });
  return store;
}
export function createFirestoreStore() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Configure FIREBASE_PROJECT_ID.");
  return firestoreStore(
    new Firestore({
      projectId,
      ignoreUndefinedProperties: true,
      ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { auth: firestoreAuth() }),
    }),
  );
}
