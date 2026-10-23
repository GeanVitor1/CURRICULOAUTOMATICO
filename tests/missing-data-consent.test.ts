import { expect, it } from "vitest";
import type { Job, Application } from "../shared/types";
import { createWorkspace } from "../server/workspace";
import { missingDataEligible, missingDataAuthorized, missingDataFingerprint } from "../server/missing-data-consent";

it("limits missing-data consent to the unchanged vacancy, resume and short authorization window", () => {
  const w = createWorkspace("Pessoa", "candidate@example.test");
  w.profile.confirmed = true;
  w.filters.titles = ["Full Stack Developer"];
  w.filters.skills = [];
  w.filters.contracts = ["CLT"];
  w.filters.dateKnownOnly = true;
  w.filters.language = "";
  w.filters.locations = [];
  w.filters.modalities = ["Remoto"];
  const job = { id: "one", title: "Full Stack Developer Júnior", company: "Empresa", url: "https://publisher.example/job", description: "Candidatura por e-mail", location: "Brasil", modality: "Remoto", level: "Júnior", contract: "Não especificado", skills: [], requiredSkills: [], requiredYears: null, publishedAt: null, salaryMin: null, salaryMax: null, origins: [], emailDestination: {email:"jobs@empresa.example",publicationUrl:"https://publisher.example/job",employerUrl:"https://empresa.example",verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()} } as unknown as Job;
  expect(missingDataEligible(w, job)).toBe(true);
  const application = { resumeId: "resume", missingDataConsent: {fingerprint:missingDataFingerprint(job),resumeId:"resume",confirmedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString()} } as Application;
  expect(missingDataAuthorized(w, job, application)).toBe(true);
  expect(missingDataAuthorized(w, {...job, company:"Outra"}, application)).toBe(false);
  expect(missingDataAuthorized(w, job, {...application,resumeId:"other"})).toBe(false);
  application.missingDataConsent!.expiresAt = new Date(Date.now()-1).toISOString();
  expect(missingDataAuthorized(w, job, application)).toBe(false);
  expect(missingDataEligible(w, {...job, contract:"PJ"})).toBe(false);
  expect(missingDataEligible(w, {...job, requiredYears:5})).toBe(false);
  expect(w.filters.contracts).toEqual(["CLT"]);
  expect(w.filters.dateKnownOnly).toBe(true);
});
