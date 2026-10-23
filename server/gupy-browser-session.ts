import { z } from "zod";

const gupyDomain = (domain: string) =>
  /^(?:[a-z0-9-]+\.)*gupy\.io$/.test(domain.replace(/^\./, ""));
const origin = z.string().max(250).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && gupyDomain(url.hostname) && url.origin === value;
  } catch { return false; }
}, "A sessão deve conter somente origens da Gupy.");

// Reject unrelated credentials rather than silently accepting a browser export.
export const gupyBrowserSessionSchema = z.object({
  cookies: z.array(z.object({
    name: z.string().min(1).max(300),
    value: z.string().max(32768),
    domain: z.string().max(250).refine(gupyDomain),
    path: z.string().max(2048).startsWith("/"),
    expires: z.number().finite(),
    httpOnly: z.boolean(),
    secure: z.literal(true),
    sameSite: z.enum(["Strict", "Lax", "None"]),
  }).strict()).max(150),
  origins: z.array(z.object({
    origin,
    localStorage: z.array(z.object({
      name: z.string().min(1).max(300),
      value: z.string().max(131072),
    }).strict()).max(60),
  }).strict()).max(12),
}).strict().refine((s) => s.cookies.length > 0 || s.origins.some((o) => o.localStorage.length),
  "Nenhuma sessão da Gupy foi encontrada no Chrome.");

export type GupyBrowserSession = z.infer<typeof gupyBrowserSessionSchema>;
