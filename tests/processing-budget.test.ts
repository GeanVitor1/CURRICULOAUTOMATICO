import { expect, it } from "vitest";
import { createWorkspace } from "../server/workspace";
import { claimResumeProcessing, releaseResumeProcessing, ProcessingBudgetError } from "../server/processing-budget";
it("rejects concurrent requests and does not let a stale completion release a replacement lease",()=>{
  const w=createWorkspace("Synthetic","qa@example.test");
  claimResumeProcessing(w,"upload","one",1000);
  expect(()=>claimResumeProcessing(w,"analysis","two",1001)).toThrow(ProcessingBudgetError);
  claimResumeProcessing(w,"analysis","two",181001);
  releaseResumeProcessing(w,"one");expect(w.processingSecurity?.lease?.token).toBe("two");
  releaseResumeProcessing(w,"two");expect(w.processingSecurity?.lease).toBeUndefined();
});
it("keeps the per-account sliding budget after a new process reconstructs the workspace",()=>{
  let w=createWorkspace("Synthetic","qa@example.test");
  for(let i=0;i<5;i++){claimResumeProcessing(w,"upload",String(i),1000+i);releaseResumeProcessing(w,String(i));w=structuredClone(w);}
  expect(()=>claimResumeProcessing(w,"upload","sixth",2000)).toThrow(ProcessingBudgetError);
  claimResumeProcessing(w,"upload","next-window",61001);expect(w.processingSecurity?.lease?.token).toBe("next-window");
});
