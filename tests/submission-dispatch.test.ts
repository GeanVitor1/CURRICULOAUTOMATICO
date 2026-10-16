import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  send: vi.fn(),
  plan: vi.fn(),
}));
vi.mock("../server/db", async () => {
  const { submissionState } = await import("../server/submission-state");
  return {
    store: {
      submissionState: async (id: string) => {
        const w = await mocks.read(id);
        return w ? submissionState(w, id.slice(0, -5)) : null;
      },
    },
  };
});
vi.mock("@vercel/queue", () => ({ send: mocks.send }));
vi.mock("../server/billing", () => ({ accountPlan: mocks.plan }));
vi.mock("../server/automation-runtime", () => ({
  vercelQueueEnabled: () => true,
}));
import { dispatchNextApplication } from "../server/submission-dispatch";
import { createWorkspace } from "../server/workspace";
import type { Workspace } from "../shared/types";
let w: Workspace;
beforeEach(() => {
  w = createWorkspace("Pessoa", "private@example.test");
  w.demo = false;
  w.routine.enabled = true;
  w.routine.mode = "automatic";
  w.routine.dailyLimit = 20;
  w.applications = [
    { id: "candidate-1", status: "Aguardando aprovação", history: [] },
    { id: "candidate-2", status: "Aguardando aprovação", history: [] },
  ] as unknown as Workspace["applications"];
  mocks.read.mockResolvedValue(w);
  mocks.plan.mockResolvedValue({ dailyLimit: 5 });
  mocks.send.mockResolvedValue({ messageId: "fixture" });
});
afterEach(() => vi.clearAllMocks());
it("publica só a primeira candidatura e apenas identificadores", async () => {
  expect(await dispatchNextApplication("alice:live")).toBe(true);
  expect(mocks.send).toHaveBeenCalledWith(
    "empregatos-submissions",
    { workspaceId: "alice:live", applicationId: "candidate-1" },
    expect.objectContaining({
      idempotencyKey: expect.stringContaining("candidate-1:0:"),
    }),
  );
  expect(JSON.stringify(mocks.send.mock.calls)).not.toContain(
    "private@example.test",
  );
});
it("não publica em paralelo nem enquanto pausado", async () => {
  w.applications[1].status = "Enviando";
  expect(await dispatchNextApplication("alice:live")).toBe(false);
  w.applications[1].status = "Aguardando aprovação";
  w.routine.enabled = false;
  expect(await dispatchNextApplication("alice:live")).toBe(false);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("respeita o limite do plano mesmo quando a rotina tem limite maior", async () => {
  const at = new Date().toISOString();
  for (let i = 0; i < 5; i++)
    w.applications.push({
      id: `done-${i}`,
      status: "Requer ação manual",
      history: [
        {
          at,
          message:
            "Envio iniciado. Aguardando recibo verificável da integração.",
          actor: "Sistema",
        },
      ],
    } as Workspace["applications"][number]);
  expect(await dispatchNextApplication("alice:live")).toBe(false);
  expect(mocks.send).not.toHaveBeenCalled();
});
