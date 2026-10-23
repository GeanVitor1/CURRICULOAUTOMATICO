import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { operatorStore } from "./operator-firestore";
import { and, eq } from "../server/storage-types";
import { analyze, matchesObjectiveFilters } from "../server/engine";
import { canonicalJobUrl } from "../server/job-identity";
import { confirmedAutomaticApplication } from "../server/automation-trace";

// Read and recompute only: no workspace mutation, queue, preparation or upload.
const { store, operatorEmail } = await operatorStore();
try {
  const [user] = await store.select("users", { where: eq("email", operatorEmail) });
  const [row] = await store.select("workspaces", { where: and(eq("userId", user.id), eq("demo", false)) });
  const w = row.data, now = Date.now();
  const unique = [...new Map(w.jobs.filter(j => !j.demo).map(j => [canonicalJobUrl(j.url), j])).values()];
  const recent = unique.filter(j => j.availability !== "closed" && !!j.publishedAt &&
    Date.parse(j.publishedAt) <= now && Date.parse(j.publishedAt) >= now - 14 * 86400000);
  const forms = recent.filter(j => j.destinations?.some(d => d.state === "verified" && d.formFound && Date.parse(d.expiresAt) > now));
  const results = forms.map(job => {
    const objective = matchesObjectiveFilters(job, w.profile, w.filters);
    const match = analyze(job, w.profile, w.filters);
    const applications = w.applications.filter(a => a.jobId === job.id);
    const uncertain = applications.some(a => a.attempts?.some(t => t.outcome === "unknown"));
    const priorTransmission = applications.some(a => a.receipt || a.attempts?.length);
    return { id: job.id, title: job.title, company: job.company, url: job.url,
      publishedAt: job.publishedAt, availability: job.availability, modality: job.modality,
      location: job.location, requiredYears: job.requiredYears, requiredSkills: job.requiredSkills,
      storedScore: job.match.score, recomputedScore: match.score, minimum: w.routine.minScore,
      objectiveFiltersPass: objective, blockers: match.blockers, gaps: match.gaps,
      professionalPass: match.score >= w.routine.minScore && !match.blockers.length && match.confidence !== "insufficient",
      discarded: job.discarded, priorTransmission, uncertain,
      eligibleForFreshPreflight: objective && match.score >= w.routine.minScore && !match.blockers.length && match.confidence !== "insufficient" && !job.discarded && !priorTransmission,
      destinations: job.destinations?.filter(d => d.state === "verified" && d.formFound).map(d => ({ platform: d.platform, url: d.url, expiresAt: d.expiresAt, verifiedAt: d.verifiedAt })),
      applications: applications.map(a => ({ id: a.id, status: a.status, receiptPresent: !!a.receipt,
        attempts: a.attempts?.map(t => ({ id: t.id, outcome: t.outcome })) || [] })),
    };
  }).sort((a, b) => Number(b.objectiveFiltersPass) - Number(a.objectiveFiltersPass) || b.recomputedScore - a.recomputedScore);
  const gupy = recent.filter(j => /\.gupy\.io$/.test(new URL(j.url).hostname)).map(j => {
    const m = analyze(j, w.profile, w.filters);
    return { id: j.id, url: j.url, title: j.title, publishedAt: j.publishedAt,
      objectiveFiltersPass: matchesObjectiveFilters(j, w.profile, w.filters), score: m.score,
      blockers: m.blockers, minimum: w.routine.minScore,
      professionalPass: m.score >= w.routine.minScore && !m.blockers.length && m.confidence !== "insufficient" };
  });
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const report = { at: new Date(now).toISOString(), readOnly: true, workspaceWrites: 0, employerWrites: 0,
    filtersSha256: createHash("sha256").update(JSON.stringify(w.filters)).digest("hex"),
    recent: recent.length, observedForms: forms.length, minimum: w.routine.minScore,
    objectivePass: results.filter(r => r.objectiveFiltersPass).length,
    professionalPass: results.filter(r => r.professionalPass).length,
    eligibleForFreshPreflight: results.filter(r => r.eligibleForFreshPreflight).length,
    results, gupy,
    dailyConfirmedAutomatic: w.applications.filter(a => confirmedAutomaticApplication(a) && new Date(a.submittedAt!).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === day).length,
  };
  await writeFile("artifacts/public-form-reassessment-2026-10-23.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ at: report.at, recent: report.recent, observedForms: report.observedForms,
    objectivePass: report.objectivePass, professionalPass: report.professionalPass,
    eligibleForFreshPreflight: report.eligibleForFreshPreflight,
    top: results.slice(0, 7).map(j => ({ id: j.id, title: j.title, score: j.recomputedScore, blockers: j.blockers })),
    gupy: { count: gupy.length, promising: gupy.filter(j => j.objectiveFiltersPass && j.professionalPass) },
    dailyConfirmedAutomatic: report.dailyConfirmedAutomatic }));
} finally { await store.close(); }
