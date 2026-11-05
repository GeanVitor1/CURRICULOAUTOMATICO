import { it, expect, vi, beforeEach } from "vitest";
import { createWorkspace } from "../server/workspace";
const mocks=vi.hoisted(()=>({mutate:vi.fn(),select:vi.fn()}));
vi.mock("../server/db",()=>({mutateWorkspace:mocks.mutate,store:{select:mocks.select}}));
import {observeWorker} from "../server/worker-observation";
let w:ReturnType<typeof createWorkspace>;
const metadata={messageId:"message",deliveryCount:1};
beforeEach(()=>{
  vi.clearAllMocks();w=createWorkspace("QA","qa@example.test");
  mocks.select.mockResolvedValue([{workspaceId:"owner:live"}]);
  mocks.mutate.mockImplementation(async(_id,fn)=>fn(w));
});
it("persists delivery metadata and completion without exposing the message payload",async()=>{
  await observeWorker("resolution","task",metadata,async()=>"done");
  expect(w.workerEvents?.map(e=>e.state)).toEqual(["received","completed"]);
  expect(w.workerEvents?.[0]).toMatchObject({messageId:"message",deliveryCount:1,subjectId:"task"});
});
it("persists failure without error prose and propagates the failure to queue recovery",async()=>{
  const error=Object.assign(new Error("PRIVATE_TOKEN"),{code:14});
  await expect(observeWorker("discovery","task",metadata,async()=>{throw error;})).rejects.toBe(error);
  expect(w.workerEvents?.at(-1)).toMatchObject({state:"failed",errorCode:"14"});
  expect(JSON.stringify(w.workerEvents)).not.toContain("PRIVATE_TOKEN");
});
it("does not retry an external action because telemetry failed, and bounds retained events",async()=>{
  mocks.mutate.mockRejectedValueOnce(new Error("db unavailable"));
  const action=vi.fn(async()=>"sent");
  expect(await observeWorker("submission","app",metadata,action,"owner:live")).toBe("sent");
  expect(action).toHaveBeenCalledTimes(1);
  const prior=w.workerEvents![0];w.workerEvents=Array.from({length:200},()=>prior);
  await observeWorker("submission","app",{...metadata,deliveryCount:2},async()=>{},"owner:live");
  expect(w.workerEvents).toHaveLength(200);expect(w.workerEvents.at(-1)?.deliveryCount).toBe(2);
});
