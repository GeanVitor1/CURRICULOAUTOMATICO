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
it("publica a retomada autorizada da mesma candidatura já reservada, mesmo na cota", async () => {
  w.routine.dailyLimit = 1;
  mocks.plan.mockResolvedValue({ dailyLimit: 1 });
  const a = w.applications[0];
  const url = "https://fixture.gupy.io/jobs/12345";
  a.resumeId = "resume-1";
  a.resumeState = {
    resumeId: "resume-1",
    destinationUrl: url,
    recordedAt: new Date().toISOString(),
  };
  a.history = [
    {
      at: new Date().toISOString(),
      actor: "Sistema",
      message: "Envio iniciado. Aguardando recibo.",
    },
  ];
  expect(await dispatchNextApplication("alice:live")).toBe(true);
  expect(mocks.send.mock.calls[0][1].applicationId).toBe(a.id);
  a.resumeId = "different-resume";
  mocks.send.mockClear();
  expect(await dispatchNextApplication("alice:live")).toBe(false);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("prioriza uma retomada ATS completa sobre pendências antigas na cota", async () => {
  w.routine.dailyLimit = 1;
  mocks.plan.mockResolvedValue({dailyLimit:1});
  const a=w.applications[1];
  a.resumeId="resume";
  a.missingQuestions=[];
  a.resumeState={kind:"ats",resumeId:"resume",destinationUrl:"https://jobs.lever.co/empresa/123/apply",targetUrl:"https://jobs.lever.co/empresa/123/apply",recordedAt:new Date().toISOString()};
  a.history=[{at:new Date().toISOString(),actor:"Sistema",message:"Envio iniciado."}];
  expect(await dispatchNextApplication("alice:live")).toBe(true);
  expect(mocks.send.mock.calls[0][1].applicationId).toBe(a.id);
});
it("publica somente a autorização individual enquanto a rotina está pausada", async () => {
  w.routine.enabled = false;
  w.routine.mode = "approval";
  w.applications[1].resumeId = "approved-resume";
  w.applications[1].singleSubmission = {
    confirmedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    resumeId: "approved-resume",
    destinationUrl: "https://empresa.gupy.io/jobs/1",
    method: "browser",
  };
  expect(await dispatchNextApplication("alice:live")).toBe(true);
  expect(mocks.send.mock.calls[0][1]).toEqual({
    workspaceId: "alice:live",
    applicationId: "candidate-2",
  });
  mocks.send.mockClear();
  w.applications[1].singleSubmission.expiresAt = new Date(
    Date.now() - 1,
  ).toISOString();
  expect(await dispatchNextApplication("alice:live")).toBe(false);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("dispatches explicitly rejected Gmail only with a new individual authorization at the existing quota", async () => {
  w.routine.mode = "approval";
  w.routine.dailyLimit = 1;
  mocks.plan.mockResolvedValue({dailyLimit:1});
  const at=new Date().toISOString();
  const a=w.applications[0];
  a.resumeId="resume";
  a.singleSubmission={resumeId:"resume",destinationUrl:"mailto:jobs@employer.example",method:"email",confirmedAt:at,expiresAt:new Date(Date.now()+1800000).toISOString()};
  a.history=[{at,actor:"Sistema",message:"Envio iniciado."},{at,actor:"Sistema",message:"O Gmail recusou o envio. [GMAIL_REJECTED HTTP 403] Confira a conexao."}];
  expect(await dispatchNextApplication("alice:live")).toBe(true);
  a.history.push({at,actor:"Sistema",message:"Envio iniciado."});
  a.history.push({at,actor:"Sistema",message:"Resultado desconhecido."});
  expect(await dispatchNextApplication("alice:live")).toBe(false);
});
