import { it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { diagnosticsWorkspace, automationDiagnostics } from "../server/automation-diagnostics";
import { createWorkspace } from "../server/workspace";
import type { Store } from "../server/storage-types";
afterEach(()=>vi.unstubAllEnvs());
it("fails closed and pins a read credential to exactly one workspace",()=>{
  expect(diagnosticsWorkspace("a".repeat(64))).toBeNull();
  vi.stubEnv("AUTOMATION_OBSERVER_WORKSPACE","owner:live");
  vi.stubEnv("AUTOMATION_OBSERVER_KEY_SHA256",createHash("sha256").update("a".repeat(64)).digest("hex"));
  expect(diagnosticsWorkspace(undefined)).toBeNull();expect(diagnosticsWorkspace(["a".repeat(64)])).toBeNull();
  expect(diagnosticsWorkspace("b".repeat(64))).toBeNull();expect(diagnosticsWorkspace("a".repeat(64))).toBe("owner:live");
});
it("reads only the scoped account and never exports candidate values, originals or receipt contents",async()=>{
  const w=createWorkspace("PRIVATE_NAME","private@example.test");
  w.applications=[{id:"app",jobId:"job",status:"Enviada",receipt:"PRIVATE_RECEIPT",submittedAt:"2026-10-26T12:00:00Z",history:[],attempts:[{id:"t",startedAt:"2026-10-26T12:00:00Z",receipt:"PRIVATE_ATTEMPT_RECEIPT"}]} as any];
  const select=vi.fn(async(table:string,query:any)=>{
    if(table==="workspaces")return [{id:"owner:live",userId:"owner",demo:false,data:w,updatedAt:new Date()}];
    expect(JSON.stringify(query)).toContain(table==="applicationUsage"?'"owner"':'"owner:live"');return [];
  });
  const store={select,submissionState:vi.fn(async()=>null)} as unknown as Store;
  const result=await automationDiagnostics(store,"owner:live","2026-10-26"),json=JSON.stringify(result);
  expect(json).not.toMatch(/PRIVATE_|private@example/);expect(result.panel.confirmedIds).toEqual(["app"]);
  expect(result.applications[0].receiptSha256).toHaveLength(64);expect(select).toHaveBeenCalledTimes(4);
});
