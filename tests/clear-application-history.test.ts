import { expect, it } from "vitest";
import type { Application, Job } from "../shared/types";
import { createWorkspace } from "../server/workspace";
import { clearApplicationHistory } from "../server/clear-application-history";
import { opportunityKey } from "../server/job-identity";

it("clears collected data while preserving preferences, CV and duplicate protection", () => {
  const w = createWorkspace("Pessoa", "fixture@example.test");
  const job = {
    id: "job",
    url: "https://example.test/jobs/1?utm_source=search",
  } as Job;
  w.jobs = [job];
  w.applications = [
    {
      jobId: "job",
      status: "Enviada",
      receipt: "receipt",
      history: [],
    } as unknown as Application,
  ];
  const profile = structuredClone(w.profile),
    resumes = structuredClone(w.resumes),
    routine = structuredClone(w.routine);
  expect(clearApplicationHistory(w)).toEqual({ jobs: 1, applications: 1 });
  expect(w.jobs).toEqual([]);
  expect(w.applications).toEqual([]);
  expect(w.profile).toEqual(profile);
  expect(w.resumes).toEqual(resumes);
  expect(w.routine).toEqual(routine);
  expect(w.submissionExclusions).toEqual([opportunityKey(job)]);
});
it("refuses to erase the claim of a submission in flight", () => {
  const w = createWorkspace("Pessoa", "fixture@example.test");
  w.applications = [{ status: "Enviando" } as Application];
  expect(() => clearApplicationHistory(w)).toThrow("Aguarde");
  expect(w.applications).toHaveLength(1);
});
