import { beforeEach, expect, it, vi } from "vitest";
import { createWorkspace } from "../server/workspace";
import type { Workspace } from "../shared/types";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  select: vi.fn(),
  count: vi.fn(),
  plan: vi.fn(),
  ready: vi.fn(),
  queue: vi.fn(),
  dispatch: vi.fn(),
  research: vi.fn(),
  needs: vi.fn(),
  allowance: vi.fn(),
  discovery: vi.fn(),
}));
vi.mock("../server/db", () => ({
  store: { select: mocks.select, count: mocks.count },
  readWorkspace: mocks.read,
  mutateWorkspace: mocks.mutate,
}));
vi.mock("../server/billing", () => ({
  accountPlan: mocks.plan,
  billingDay: () => "2026-10-22",
  releasePausedReservations: vi.fn(),
}));
vi.mock("../server/portal-sessions", () => ({ readyPortals: mocks.ready }));
vi.mock("../server/discovery-queue",()=>({enqueueDiscovery:mocks.discovery}));
vi.mock("../server/operations", () => ({
  queuePreparedApplications: mocks.queue,
}));
vi.mock("../server/submission-dispatch", () => ({
  dispatchNextApplication: mocks.dispatch,
}));
vi.mock("../server/resolution-queue", () => ({
  enqueueResolution: mocks.research,
  needsResearch: mocks.needs,
  researchAllowance: mocks.allowance,
}));
import {
  automaticProgress,
  automaticBlockerMessage,
  continueAutomaticCycle,
} from "../server/automatic-cycle";
it('explica a tentativa incerta sem tratá-la como envio confirmado',()=>{
 const current=createWorkspace('Pessoa QA','qa@example.test');
 current.applications=[{status:'Resultado desconhecido',receipt:null,submittedAt:undefined} as any];
 expect(automaticBlockerMessage(current)).toContain('1 tentativa(s) com resultado desconhecido, sem recibo');
 expect(automaticBlockerMessage(current)).toContain('não serão repetidas automaticamente');
});
let w: Workspace;
const sent = (id: string): Workspace["applications"][number] => ({
  execution:{correlationId:id,runId:"run",origin:"scheduled_automation"},
  attempts:[{id:"attempt-"+id,correlationId:id,runId:"run",origin:"scheduled_automation",executor:"email",startedAt:new Date().toISOString(),outcome:"confirmed",receipt:"provider-receipt-"+id}],
  id,
  jobId: "job-" + id,
  receipt: "provider-receipt-" + id,
  submittedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resumeId: "resume",
  note: "",
  status: "Enviada",
  mode: "automatic",
  history: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  w = createWorkspace("Pessoa", "qa@example.test");
  w.routine.enabled = true;
  w.routine.mode = "automatic";
  w.routine.dailyLimit = 5;
  w.profile.confirmed = true;
  w.resumes = [
    { id: "resume", approved: true } as Workspace["resumes"][number],
  ];
  mocks.read.mockImplementation(async () => w);
  mocks.mutate.mockImplementation(async (_id, fn) => fn(w, {}));
  mocks.select.mockImplementation(async (table) =>
    table === "workspaces" ? [{ userId: "alice" }] : [],
  );
  mocks.count.mockResolvedValue(0);
  mocks.plan.mockResolvedValue({ dailyLimit: 5 });
  mocks.ready.mockResolvedValue([]);
  mocks.queue.mockReturnValue(0);
  mocks.allowance.mockReturnValue(10);
  mocks.needs.mockReturnValue(true);
});
it("repõe a fila depois de cada recibo até cinco, sem uma nova ação do usuário", async () => {
  mocks.queue.mockImplementation((current) => {
    if (
      current.applications.filter((a: any) => a.status === "Enviada").length < 5
    )
      current.applications.push({
        id: "next",
        status: "Aguardando aprovação",
        history: [],
      });
  });
  for (let i = 0; i < 5; i++) {
    await continueAutomaticCycle("alice:live");
    expect(w.routine.progress?.state).toBe("sending");
    w.applications = w.applications.filter((a) => a.id !== "next");
    w.applications.push(sent(String(i)));
  }
  await continueAutomaticCycle("alice:live");
  expect(mocks.dispatch).toHaveBeenCalledTimes(5);
  expect(w.routine.progress).toMatchObject({
    sent: 5,
    target: 5,
    remaining: 0,
    state: "complete",
  });
});
it("uma candidatura enviada não encerra a pesquisa das quatro restantes", async () => {
  w.applications = [sent("1")];
  w.jobs = [{} as Workspace["jobs"][number]];
  await continueAutomaticCycle("alice:live");
  expect(mocks.research).toHaveBeenCalledExactlyOnceWith("alice:live");
  expect(w.routine.progress).toMatchObject({
    sent: 1,
    remaining: 4,
    state: "researching",
  });
});
it("não repete resultados desconhecidos nem ultrapassa a cota", async () => {
  w.applications = Array.from({ length: 5 }, (_, i) => ({
    ...sent(String(i)),
    receipt: null,
    submittedAt: undefined,
    status: "Resultado desconhecido",
    history: [
      {
        at: new Date().toISOString(),
        message: "Envio iniciado.",
        actor: "Sistema",
      },
    ],
  })) as Workspace["applications"];
  await continueAutomaticCycle("alice:live");
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.research).not.toHaveBeenCalled();
  expect(w.routine.progress).toMatchObject({ sent: 0, state: "waiting" });
});
it('preserves an unknown attempt and continues researching other vacancies while quota remains',async()=>{
 w.applications=[{...sent('uncertain'),status:'Resultado desconhecido',receipt:null,submittedAt:undefined,
  attempts:[{id:'attempt-uncertain',correlationId:'uncertain',origin:'scheduled_automation',executor:'ats_browser',startedAt:new Date().toISOString(),outcome:'unknown'}],
  history:[{at:new Date().toISOString(),actor:'Sistema',message:'Envio iniciado.'}]}];
 w.jobs=[{} as Workspace['jobs'][number]];
 await continueAutomaticCycle('alice:live');
 expect(mocks.research).toHaveBeenCalledExactlyOnceWith('alice:live');
 expect(w.applications[0]).toMatchObject({status:'Resultado desconhecido',receipt:null,attempts:[{outcome:'unknown'}]});
 expect(w.routine.progress).toMatchObject({sent:0,remaining:4,state:'researching'});
});
it("expõe falta de oferta/cota da IA em vez de declarar cinco enviadas", async () => {
  w.applications = [sent("1")];
  w.runs = [
    {
      errors: ["A cota diária de busca com IA foi esgotada."],
    } as Workspace["runs"][number],
  ];
  await continueAutomaticCycle("alice:live");
  expect(w.routine.progress).toMatchObject({
    sent: 1,
    remaining: 4,
    state: "waiting",
  });
  expect(w.routine.progress?.message).toContain("cota do provedor");
  expect(mocks.research).not.toHaveBeenCalled();
});
it("respeita pausa e limite real do plano", async () => {
  w.routine.enabled = false;
  await continueAutomaticCycle("alice:live");
  expect(mocks.queue).not.toHaveBeenCalled();
  w.routine.enabled = true;
  mocks.plan.mockResolvedValue({ dailyLimit: 1 });
  w.applications = [sent("1")];
  await continueAutomaticCycle("alice:live");
  expect(w.routine.progress).toMatchObject({ target: 1, state: "complete" });
});
it("preparações e marcações manuais sem recibo não viram envios confirmados", () => {
  w.applications = [{ ...sent("1"), receipt: null }];
  expect(automaticProgress(w, 5, "waiting", "Sem recibo")).toMatchObject({
    sent: 0,
    remaining: 5,
  });
});
it("um recibo individual ou legado continua no histórico, mas não comprova a meta automática",()=>{
  w.applications=[{...sent("individual"),execution:{correlationId:"individual",origin:"individual_user_submission"},attempts:[]},{...sent("legacy"),execution:undefined,attempts:undefined}];
  expect(automaticProgress(w,5,"waiting","Sem novos envios automáticos",2)).toMatchObject({sent:0,usedToday:2,remaining:3,state:"waiting"});
});
it("expõe bloqueios de formulário e cota de pesquisa sem alegar ausência de destinos", async () => {
  mocks.allowance.mockReturnValue(0);
  w.applications = [
    {
      ...sent("captcha"),
      receipt: null,
      submittedAt: undefined,
      status: "Requer ação manual",
      history: [
        {
          at: new Date().toISOString(),
          actor: "Sistema",
          message:
            "Preparação antes do envio: Este formulário exige verificação humana para liberar a submissão.",
        },
      ],
    },
  ];
  await continueAutomaticCycle("alice:live");
  expect(w.routine.progress).toMatchObject({
    sent: 0,
    remaining: 5,
    state: "waiting",
  });
  expect(w.routine.progress?.message).toContain(
    "1 candidatura(s) bloqueada(s) por verificação humana",
  );
  expect(w.routine.progress?.message).toContain(
    "destinos disponíveis foram verificados",
  );
  expect(w.routine.progress?.message).not.toContain("faltam oportunidades");
});

it("continua a pesquisa após vinte verificações se houver vagas novas e saldo", async () => {
  w.applications = [sent("1")];
  w.jobs = [{} as Workspace["jobs"][number]];
  mocks.allowance.mockReturnValue(25);
  await continueAutomaticCycle("alice:live");
  expect(mocks.research).toHaveBeenCalledExactlyOnceWith("alice:live");
  expect(w.routine.progress?.state).toBe("researching");
});
it("respeita o consumo persistente mesmo após apagar o histórico", async () => {
  mocks.count.mockResolvedValue(5);
  w.jobs = [{} as Workspace["jobs"][number]];
  await continueAutomaticCycle("alice:live");
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.research).not.toHaveBeenCalled();
  expect(w.routine.progress).toMatchObject({
    sent: 0,
    usedToday: 5,
    remaining: 0,
    state: "waiting",
  });
});
it("desconta envios apagados ao repor a fila e mostrar o saldo", async () => {
  w.applications = [sent("1")];
  mocks.count.mockResolvedValue(2);
  await continueAutomaticCycle("alice:live");
  expect(mocks.queue).toHaveBeenCalledWith(w, [], 4);
  expect(w.routine.progress).toMatchObject({
    sent: 1,
    usedToday: 2,
    remaining: 3,
  });
});
it("retoma a descoberta a partir do checkpoint com orçamento finito e origem preservada",async()=>{
  w.routine.discoveryCheckpoints={abler:{cursor:"page:120",pending:true}};
  w.runs=[{id:"scheduled",origin:"scheduled_automation",status:"completed",errors:[],at:new Date().toISOString(),discovered:0,processed:0,message:"Scheduled run"}];
  mocks.allowance.mockReturnValue(0);
  for(let i=0;i<5;i++)await continueAutomaticCycle("alice:live");
  expect(mocks.discovery).toHaveBeenCalledTimes(4);
  expect(mocks.discovery).toHaveBeenCalledWith("alice:live","scheduled_automation",true);
  expect(w.routine.discoveryContinuation?.batches).toBe(4);
});
