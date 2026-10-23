import { afterEach, expect, it, vi } from "vitest";
import type { Application, Job } from "../shared/types";
import { bindExecution, confirmedAutomaticApplication, discoveredJob, traceJob } from "../server/automation-trace";
import { publicJob, destinationExecutionAvailable } from "../server/ats-registry";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("binds publication, product run, attempt and receipt without logging candidate data",()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  const job={id:"job",company:"Private employer",title:"Private title"} as Job;
  discoveredJob(job,"scheduled-run","scheduled_automation");
  const a={id:"app",receipt:"verified-receipt",submittedAt:new Date().toISOString()} as Application;
  const execution=bindExecution(a,job);
  a.attempts=[{...execution,id:"attempt",executor:"email",startedAt:new Date().toISOString(),outcome:"confirmed",receipt:a.receipt!}];
  expect(confirmedAutomaticApplication(a)).toBe(true);
  expect(confirmedAutomaticApplication({...a,receipt:"different"})).toBe(false);
  expect(confirmedAutomaticApplication({...a,attempts:[]})).toBe(false);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/Private employer|Private title/);
  const correlation=job.automation!.correlationId;
  discoveredJob(job,"new-run","user_triggered_automation");
  expect(job.automation!.correlationId).toBe(correlation);
  expect(a.execution?.runId).toBe("scheduled-run");
  expect(publicJob(job).automation).toBeUndefined();
});
it.each(["legacy_unclassified","agent_assisted_diagnostic","individual_user_submission"] as const)("does not call %s a proven automatic submission",origin=>{
  vi.spyOn(console,"info").mockImplementation(()=>{});
  const job={id:"job"} as Job;
  discoveredJob(job,"run",origin);
  const a={receipt:"receipt",submittedAt:new Date().toISOString(),mode:"automatic"} as Application;
  const execution=bindExecution(a,job);
  a.attempts=[{...execution,id:"attempt",executor:"ats_browser",startedAt:new Date().toISOString(),outcome:"confirmed",receipt:"receipt"}];
  expect(confirmedAutomaticApplication(a)).toBe(false);
  for(let i=0;i<100;i++)traceJob(job,"preparation",`block_${i}`);
  expect(job.automation!.events).toHaveLength(40);
});
it("does not use a native company grant as browser infrastructure for Lever",()=>{
  vi.stubEnv("COMPANY_FORM_AUTHORIZED","company.example");
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","");
  vi.stubEnv("ATS_EXECUTION_LOCAL","");
  const destination={platform:"lever",url:"https://jobs.lever.co/company/00000000-0000-4000-8000-000000000000",evidence:[]} as never;
  expect(destinationExecutionAvailable(destination)).toBe(false);
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","[SENSITIVE]");
  expect(destinationExecutionAvailable(destination)).toBe(false);
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","configured-snapshot");
  expect(destinationExecutionAvailable(destination)).toBe(true);
});
