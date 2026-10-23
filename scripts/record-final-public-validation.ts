import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { operatorStore } from "./operator-firestore";
import { and, eq } from "../server/storage-types";
import { confirmedAutomaticApplication } from "../server/automation-trace";
import { approvedFieldAnswer } from "../server/approved-answers";

// Final read-only reconciliation. No backend processing or candidate transmission.
const { store, operatorEmail } = await operatorStore();
try {
  const [u] = await store.select("users", { where: eq("email", operatorEmail) });
  const [row] = await store.select("workspaces", { where: and(eq("userId", u.id), eq("demo", false)) });
  const w = row.data, at = new Date(), day = at.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const prior = JSON.parse(await readFile("artifacts/automation-viability-state-2026-10-23.json", "utf8"));
  const assessment = JSON.parse(await readFile("artifacts/public-form-reassessment-2026-10-23.json", "utf8"));
  const reads = JSON.parse(await readFile("artifacts/final-public-channel-inspections-2026-10-23.json", "utf8"));
  const details = JSON.parse(await readFile("artifacts/final-lever-form-inspections-2026-10-23.json", "utf8"));
  const today = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === day;
  const global = w.applications.find(a => a.id === "69692d0e-e9ba-448b-bb78-0140f31dc5f5");
  const globalState = global ? { id: global.id, status: global.status, receipt: global.receipt || null,
    submittedAt: global.submittedAt || null,
    attempts: global.attempts?.map(t => ({ id: t.id, startedAt: t.startedAt, finishedAt: t.finishedAt,
      outcome: t.outcome, executor: t.executor, origin: t.origin, runId: t.runId, receipt: t.receipt || null })) } : null;
  const currentFiltersHash = createHash("sha256").update(JSON.stringify(w.filters)).digest("hex");
  const fields = details.results.map((r: any) => ({ jobId: r.jobId, url: r.url,
    httpStatus: r.rendered?.status, closed: r.rendered?.closed,
    fields: r.rendered?.fields?.map((f: any) => {
      const question = f.label?.replace(/\s+/g, " ").replace(/[\s*:✱＊]+$/, "").trim();
      return { ...f, normalizedObservedLabel: question || null,
        approvedAnswerAvailableForObservedLabel: f.type === "file" ?
          f.name === "resume" ? w.resumes.some(r => r.approved && r.originalFileAvailable) : null : question ?
            !!approvedFieldAnswer(question, w.profile, r.url) : null,
        mappingLimit: "Observed labels only; grouped questions, option compatibility and widgets require the production adapter preflight. False or null does not establish that the candidate lacks the underlying fact.",
      };
    }),
    nativeFileInputCount: r.rendered?.fileInputs,
    preflightApproved: false, reason: "Professional eligibility failed before preparation; no input was filled or file loaded. Native required attributes alone do not represent the complete form contract.",
  }));
  const reasons = { uncertain: 0, seniority: 0, affirmative: 0, belowScore: 0, other: 0 };
  for (const r of assessment.results) {
    if (r.uncertain) reasons.uncertain++;
    else if (r.blockers.some((b: string) => b.includes("Senioridade"))) reasons.seniority++;
    else if (r.blockers.some((b: string) => b.includes("PcD"))) reasons.affirmative++;
    else if (r.recomputedScore < assessment.minimum) reasons.belowScore++;
    else reasons.other++;
  }
  const report = { at: at.toISOString(), readOnly: true, workspaceWrites: 0, employerWrites: 0,
    filtersUnchanged: currentFiltersHash === prior.filtersSha256 && currentFiltersHash === assessment.filtersSha256,
    filtersSha256: currentFiltersHash,
    observedForms: assessment.observedForms, objectivelyPassing: assessment.objectivePass,
    professionallyPassing: assessment.professionalPass, freshPreflightEligible: assessment.eligibleForFreshPreflight,
    exclusiveExclusionReasons: reasons,
    indexedQuickApplyHints: reads.results.filter((r: any) => r.kind === "indexed_quick_apply").length,
    indexedHintsStillOpen: reads.results.filter((r: any) => r.kind === "indexed_quick_apply" && r.rendered && !r.rendered.closed).length,
    currentPublicQuickApplyFormsObserved: reads.results.filter((r: any) => r.rendered?.quickApplyVisible && !r.rendered.closed).length,
    confirmedFactsPresent: { name: w.profile.confirmed && !!w.profile.name,
      email: w.profile.confirmed && !!w.profile.email, phone: w.profile.confirmed && !!w.profile.phone,
      location: w.profile.confirmed && !!w.profile.location, years: w.profile.confirmed && w.profile.years !== null,
      desiredSalary: w.profile.confirmed && w.profile.salaryDesired > 0,
      originalApprovedResume: w.resumes.some(r => r.approved && r.originalFileAvailable),
    },
    formsInspectedWithoutFilling: fields,
    globalTi: globalState,
    globalTiAttemptUnchanged: JSON.stringify(globalState?.attempts) === JSON.stringify(prior.globalTi.attempts),
    attemptsToday: w.applications.flatMap(a => (a.attempts || []).filter(t => today(t.startedAt)).map(t => ({
      applicationId: a.id, jobId: a.jobId, id: t.id, origin: t.origin, runId: t.runId,
      executor: t.executor, outcome: t.outcome, receiptPresent: !!t.receipt }))),
    newAttemptsSinceReassessment: w.applications.flatMap(a => a.attempts || []).filter(t => Date.parse(t.startedAt) >= Date.parse(assessment.at)).length,
    dailyConfirmedAutomatic: w.applications.filter(a => confirmedAutomaticApplication(a) && today(a.submittedAt!)).length,
    routine: { enabled: w.routine.enabled, mode: w.routine.mode, destinationPolicy: w.routine.destinationPolicy,
      nextRun: w.routine.nextRun, progress: w.routine.progress },
    newAdapters: 0, newRealSubmissions: 0, newReceipts: 0, productionChanged: false,
  };
  await writeFile("artifacts/final-public-validation-2026-10-23.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ at: report.at, filtersUnchanged: report.filtersUnchanged,
    observedForms: report.observedForms, professionallyPassing: report.professionallyPassing,
    indexedQuickApplyHints: report.indexedQuickApplyHints, indexedHintsStillOpen: report.indexedHintsStillOpen,
    currentPublicQuickApplyFormsObserved: report.currentPublicQuickApplyFormsObserved,
    globalTiAttemptUnchanged: report.globalTiAttemptUnchanged, newAttempts: report.newAttemptsSinceReassessment,
    dailyConfirmedAutomatic: report.dailyConfirmedAutomatic,
    formFieldAvailability: fields.map((r: any) => ({ jobId: r.jobId, fields: r.fields?.length,
      labelsWithExistingAnswer: r.fields?.filter((f: any) => f.approvedAnswerAvailableForObservedLabel === true).length,
      completePreflightPerformed: false })),
  }));
} finally { await store.close(); }
