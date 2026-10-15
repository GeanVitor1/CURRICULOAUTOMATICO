import { z } from "zod";
import { portalHost, type CandidatePortal } from "./portal-browser-policy";
const text = z.string().max(100000);
const keyPath = z.union([z.string(), z.array(z.string()), z.null()]);
const database = z
  .object({
    name: z.literal("firebaseLocalStorageDb"),
    version: z.number().int().positive(),
    stores: z
      .array(
        z
          .object({
            name: z.literal("firebaseLocalStorage"),
            keyPath,
            autoIncrement: z.boolean(),
            indexes: z
              .array(
                z
                  .object({
                    name: z.string().max(200),
                    keyPath: z.union([z.string(), z.array(z.string())]),
                    multiEntry: z.boolean(),
                    unique: z.boolean(),
                  })
                  .strict(),
              )
              .max(20),
            records: z
              .array(
                z
                  .object({ key: z.unknown().optional(), value: z.unknown() })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(1),
  })
  .strict();
export const importedStateSchema = z
  .object({
    cookies: z
      .array(
        z
          .object({
            name: z
              .string()
              .min(1)
              .max(256)
              .regex(/^[^\s;=\x00-\x1f]+$/),
            value: z.string().max(16384),
            domain: z.string().max(253),
            path: z.string().max(2000).startsWith("/"),
            expires: z.number().finite(),
            httpOnly: z.boolean(),
            secure: z.literal(true),
            sameSite: z.enum(["Strict", "Lax", "None"]),
          })
          .strict(),
      )
      .max(500),
    origins: z
      .array(
        z
          .object({
            origin: z.string().url().max(500),
            localStorage: z
              .array(
                z.object({ name: z.string().max(1000), value: text }).strict(),
              )
              .max(200),
            indexedDB: z.array(database).max(1).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type ImportedPortalState = z.infer<typeof importedStateSchema>;
export function validatePortalState(
  portal: CandidatePortal,
  input: unknown,
): ImportedPortalState {
  const state = importedStateSchema.parse(input);
  if (
    portal === "linkedin" ||
    JSON.stringify(state).length > 1000000 ||
    state.cookies.some(
      (c) =>
        !portalHost(portal, `https://${c.domain.replace(/^\./, "")}/`) ||
        c.expires < -1,
    ) ||
    state.origins.some(
      (o) =>
        !portalHost(portal, o.origin) || new URL(o.origin).origin !== o.origin,
    )
  )
    throw new Error(
      "Sessão contém dados de outro domínio ou excede os limites.",
    );
  if (
    !state.cookies.length &&
    !state.origins.some((o) => o.localStorage.length || o.indexedDB?.length)
  )
    throw new Error(
      "Nenhuma sessão deste portal foi encontrada. Entre no site oficial primeiro.",
    );
  return state;
}
