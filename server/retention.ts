import type { Workspace } from "../shared/types";

const DAY = 86_400_000;
/** Prazos de retenção (dias). */
export const RETENTION = {
  /** Vaga ativa sem candidatura: deixa de valer após ~45 dias da publicação. */
  openJob: 45,
  /** Vaga fechada ou descartada pelo usuário. */
  inactiveJob: 15,
  /** Candidatura pendente/falha que ninguém resolveu. */
  stalledApplication: 60,
  /** Histórico de candidaturas enviadas e demais desfechos. */
  application: 365,
};

const STALLED = new Set(["Requer ação manual", "Falha no envio"]);
const ACTIVE = new Set(["Aguardando aprovação", "Enviando"]);

const age = (now: number, ...dates: (string | null | undefined)[]) => {
  const t = dates.map((d) => (d ? Date.parse(d) : NaN)).find(Number.isFinite);
  return t === undefined ? 0 : (now - t) / DAY;
};

/** Remove vagas e candidaturas vencidas. Vagas salvas ou ligadas a candidaturas mantidas são preservadas. */
export function pruneExpired(w: Workspace, now = Date.now()) {
  const before = { jobs: w.jobs.length, applications: w.applications.length };
  w.applications = w.applications.filter((a) => {
    if (ACTIVE.has(a.status)) return true;
    const limit = STALLED.has(a.status) ? RETENTION.stalledApplication : RETENTION.application;
    return age(now, a.status === "Enviada" ? a.submittedAt : null, a.updatedAt, a.createdAt) <= limit;
  });
  const linked = new Set(w.applications.map((a) => a.jobId));
  w.jobs = w.jobs.filter((j) => {
    if (j.saved || linked.has(j.id)) return true;
    const inactive = j.discarded || j.availability === "closed";
    return inactive
      ? age(now, j.discoveredAt) <= RETENTION.inactiveJob
      : age(now, j.publishedAt, j.discoveredAt) <= RETENTION.openJob;
  });
  return {
    jobs: before.jobs - w.jobs.length,
    applications: before.applications - w.applications.length,
  };
}
