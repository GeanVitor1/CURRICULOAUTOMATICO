import { expect, it } from "vitest";
import { pruneExpired } from "../server/retention";

const now = Date.parse("2026-11-23T12:00:00Z");
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
const job = (id: string, extra: object = {}) =>
  ({ id, saved: false, discarded: false, availability: "active", publishedAt: null, discoveredAt: ago(1), ...extra }) as any;
const app = (id: string, jobId: string, status: string, updated: number, extra: object = {}) =>
  ({ id, jobId, status, createdAt: ago(updated), updatedAt: ago(updated), ...extra }) as any;

it("aplica os prazos de retenção preservando vagas protegidas", () => {
  const w = {
    jobs: [
      job("novo"),
      job("velho", { publishedAt: ago(50) }),
      job("fechado", { availability: "closed", discoveredAt: ago(20) }),
      job("salvo", { saved: true, publishedAt: ago(200) }),
      job("enviada", { publishedAt: ago(200) }),
      job("pendente", { publishedAt: ago(200) }),
      job("andamento", { publishedAt: ago(200) }),
    ],
    applications: [
      app("a1", "enviada", "Enviada", 300, { submittedAt: ago(300) }),
      app("a2", "pendente", "Requer ação manual", 61),
      app("a3", "andamento", "Enviando", 500),
      app("a4", "x", "Enviada", 400, { submittedAt: ago(400) }),
    ],
  } as any;
  expect(pruneExpired(w, now)).toEqual({ jobs: 3, applications: 2 });
  expect(w.jobs.map((j: any) => j.id)).toEqual(["novo", "salvo", "enviada", "andamento"]);
  expect(w.applications.map((a: any) => a.id)).toEqual(["a1", "a3"]);
});
