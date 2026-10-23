import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createWorkspace } from "../server/workspace";
import { submissionState } from "../server/submission-state";
import type { Workspace } from "../shared/types";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  deliver: vi.fn(),
  recover: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("@vercel/queue", () => ({
  QueueClient: class {
    handleNodeCallback(callback: (message: unknown, metadata: unknown) => Promise<void>) {
      return callback;
    }
  },
}));
vi.mock("../server/auth-config", () => ({ validateHostedRuntime: () => {} }));
vi.mock("../server/db", () => ({
  store: { submissionState: mocks.read },
  mutateWorkspace: mocks.mutate,
}));
vi.mock("../server/operations", () => ({
  automaticSend: mocks.deliver,
  recoverInterruptedSends: mocks.recover,
}));
vi.mock("../server/submission-dispatch", () => ({
  dispatchNextApplication: mocks.dispatch,
}));
vi.mock("../server/automatic-cycle",()=>({continueAutomaticCycle:vi.fn()}));
import callback from "../server/vercel-submission-worker";
import {continueAutomaticCycle} from "../server/automatic-cycle";

let w: Workspace, id: string;
const invoke = () =>
  (callback as unknown as (payload: unknown,metadata:unknown) => Promise<void>)({
    workspaceId: "alice:live",
    applicationId: id,
  },{messageId:'controlled-message',deliveryCount:1,topicName:'empregatos-submissions',consumerGroup:'api_Ssubmission-worker_Dmjs'});
beforeEach(() => {
  vi.clearAllMocks();
  id = randomUUID();
  w = createWorkspace("Pessoa fictícia", "qa@example.test");
  w.routine.enabled = false;
  w.routine.mode = "approval";
  w.applications = [
    {
      id,
      jobId: "job",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      receipt: null,
      note: "",
      mode: "single",
      resumeId: "resume",
      status: "Aguardando aprovação",
      history: [],
      singleSubmission: {
        confirmedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        resumeId: "resume",
        destinationUrl: "https://empresa.gupy.io/jobs/1",
        method: "browser",
      },
    },
  ];
  mocks.read.mockImplementation(async () => submissionState(w, "alice"));
  mocks.deliver.mockResolvedValue(undefined);
});
it("o consumidor processa uma autorização individual mesmo com a rotina pausada", async () => {
  await invoke();
  expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith("alice:live", id);
  expect(mocks.dispatch).toHaveBeenCalledWith("alice:live");
  expect(w.routine.enabled).toBe(false);
});
it("reentrega depois do resultado persistido retoma o ciclo sem repetir a submissão",async()=>{
  w.routine.enabled=true;w.routine.mode="automatic";
  delete w.applications[0].singleSubmission;
  mocks.deliver.mockImplementationOnce(async()=>{w.applications[0].status="Enviada";});
  mocks.dispatch.mockRejectedValueOnce(new Error("Continuation publish interrupted"));
  await expect(invoke()).rejects.toThrow("Continuation publish interrupted");
  await invoke();
  expect(mocks.deliver).toHaveBeenCalledTimes(1);
  expect(continueAutomaticCycle).toHaveBeenCalledWith("alice:live");
});
it.each(["cancelled", "expired", "sending", "already_sent"])(
  "não inicia uma nova tentativa: %s",
  async (state) => {
    if (state === "cancelled") w.applications[0].status = "Requer ação manual";
    if (state === "expired")
      w.applications[0].singleSubmission!.expiresAt = new Date(
        Date.now() - 1,
      ).toISOString();
    if (state === "sending") w.applications[0].status = "Enviando";
    if (state === "already_sent") w.applications[0].status = "Enviada";
    await invoke();
    expect(mocks.deliver).not.toHaveBeenCalled();
  },
);
