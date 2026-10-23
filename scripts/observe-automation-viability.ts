import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { operatorStore } from "./operator-firestore";
import { and, eq } from "../server/storage-types";
import { matchesObjectiveFilters } from "../server/engine";
import { confirmedAutomaticApplication } from "../server/automation-trace";
import { canonicalJobUrl, normalized } from "../server/job-identity";
import type { Job } from "../shared/types";

// Read only. No discovery, queue publication, session refresh or submission.
const { store, operatorEmail } = await operatorStore();
try {
  const [user] = await store.select("users", { where: eq("email", operatorEmail) });
  const [row] = await store.select("workspaces", {
    where: and(eq("userId", user.id), eq("demo", false)),
  });
  if (!row) throw new Error("Live workspace missing");
  const w = row.data;
  const at = new Date();
  const day = at.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const previous = JSON.parse(await readFile("artifacts/discovery-quality-real-state-2026-10-23.json", "utf8"));
  const filtersSha256 = createHash("sha256").update(JSON.stringify(w.filters)).digest("hex");
  const unique = [...new Map(w.jobs.filter(j => !j.demo).map(j => [canonicalJobUrl(j.url), j])).values()];
  const recent = unique.filter(j => j.availability !== "closed" && !!j.publishedAt &&
    Date.parse(j.publishedAt) <= at.getTime() && Date.parse(j.publishedAt) >= at.getTime() - 14 * 86400000);
  const compatible = unique.filter(j => j.availability !== "closed" && !j.discarded &&
    matchesObjectiveFilters(j, w.profile, w.filters) && j.match.score >= w.routine.minScore &&
    !j.match.blockers.length && j.match.confidence !== "insufficient" &&
    !w.applications.some(a => a.jobId === j.id && (a.receipt || a.attempts?.length)));
  function family(job: Job) {
    const t = normalized(job.title);
    if (/desenvolv|developer|software|full stack|frontend|backend|devops|sistemas/.test(t)) return "software_infra";
    if (/dados|data |analytics|inteligencia|cientista|machine learning/.test(t)) return "data_analytics";
    if (/vendas|comercial|sales|marketing|growth/.test(t)) return "sales_marketing";
    if (/suporte|support|customer|atendimento|form builder/.test(t)) return "support_operations";
    return "other_or_unclassified";
  }
  const cohorts: Record<string, { records: number; withObservedPublicForm: number; byHost: Record<string, number> }> = {};
  for (const job of recent) {
    const group = cohorts[family(job)] ||= { records: 0, withObservedPublicForm: 0, byHost: {} };
    group.records++;
    const host = new URL(job.url).hostname;
    group.byHost[host] = (group.byHost[host] || 0) + 1;
    if (job.destinations?.some(d => d.state === "verified" && d.formFound && Date.parse(d.expiresAt) > at.getTime()))
      group.withObservedPublicForm++;
  }
  const global = w.applications.find(a => a.id === "69692d0e-e9ba-448b-bb78-0140f31dc5f5");
  const portal = await store.portalMetadata(user.id, "gupy") as { verifiedAt?: string; expiresAt?: number; profileResumeId?: string } | null;
  const report = {
    at: at.toISOString(), readOnly: true, filtersSha256,
    filtersUnchanged: filtersSha256 === previous.filtersSha256,
    jobsInWorkspace: w.jobs.length, uniquePublications: unique.length,
    recentNotKnownClosed: recent.length,
    cohortMethod: "Exclusive title regex families in existing personal inventory, known publication within rolling 14 days, not known closed. No new feed reads. Not other candidates' eligibility, fresh arrival rate, permission or available application capacity.",
    cohorts,
    currentOwnerCompatible: compatible.map(j => ({ id: j.id, title: j.title, url: j.url,
      score: j.match.score, resolution: j.resolution?.state,
      destinationStates: j.destinations?.map(d => d.state) || [],
      existingApplicationIds: w.applications.filter(a => a.jobId === j.id).map(a => a.id),
    })),
    dailyConfirmedAutomatic: w.applications.filter(a => confirmedAutomaticApplication(a) &&
      new Date(a.submittedAt!).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === day).length,
    quotaReservedToday: await store.count("applicationUsage", and(eq("userId", user.id), eq("day", day))),
    globalTi: global ? { id: global.id, jobId: global.jobId, status: global.status,
      receipt: global.receipt || null, submittedAt: global.submittedAt || null,
      attempts: global.attempts?.map(a => ({ id: a.id, startedAt: a.startedAt, finishedAt: a.finishedAt,
        outcome: a.outcome, executor: a.executor, origin: a.origin, runId: a.runId, receipt: a.receipt || null })),
    } : null,
    gupyCloudMetadata: portal ? { saved: true, verifiedAt: portal.verifiedAt || null,
      expiryKnown: !!portal.expiresAt, expired: !!portal.expiresAt && portal.expiresAt <= at.getTime(),
      profileBound: !!portal.profileResumeId } : { saved: false },
    routine: { enabled: w.routine.enabled, mode: w.routine.mode, destinationPolicy: w.routine.destinationPolicy,
      time: w.routine.time, dailyLimit: w.routine.dailyLimit, minScore: w.routine.minScore,
      lastRun: w.routine.lastRun, nextRun: w.routine.nextRun, progress: w.routine.progress },
    latestRun: w.runs[0] ? { id: w.runs[0].id, at: w.runs[0].at, origin: w.runs[0].origin, status: w.runs[0].status } : null,
  };
  await writeFile("artifacts/automation-viability-state-2026-10-23.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await store.close();
}
