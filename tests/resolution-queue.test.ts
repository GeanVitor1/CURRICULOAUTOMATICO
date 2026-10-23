import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../server/workspace";
import { confirmCandidateDetails } from "./fixtures/candidate-details";
import { eq } from "../server/storage-types";
import type { Job } from "../shared/types";
let directory: string,
  database: typeof import("../server/db"),
  queue: typeof import("../server/resolution-queue"),
  catalog: typeof import("../server/opportunity-catalog"),
  resolver: typeof import("../server/destination-resolver");
const job = (): Job => ({
  id: "job",
  company: "Empresa QA de resolução",
  title: "Desenvolvedor React",
  url: "https://www.linkedin.com/jobs/view/900001",
  description:
    "Desenvolvimento React TypeScript Git. Ensino médio completo. Experiência de primeiro emprego aceita.",
  source: "LinkedIn",
  location: "Brasil",
  modality: "Remoto",
  level: "Júnior",
  contract: "CLT",
  salaryMin: null,
  salaryMax: null,
  currency: "BRL",
  skills: ["React", "TypeScript", "Git"],
  requiredSkills: [],
  requiredYears: null,
  publishedAt: null,
  discoveredAt: new Date().toISOString(),
  saved: true,
  discarded: false,
  origins: [
    {
      source: "portal",
      url: "https://www.linkedin.com/jobs/view/900001",
      id: "linkedin:900001",
    },
  ],
  match: {
    score: 90,
    strengths: ["Private match"],
    gaps: [],
    blockers: [],
    matchedSkills: [],
    missingSkills: [],
    radar: false,
    explanation: "Private assessment",
  },
  demo: false,
});
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-resolution-"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DATABASE_PROVIDER", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("REDIS_URL", "");
  database = await import("../server/db");
  queue = await import("../server/resolution-queue");
  catalog = await import("../server/opportunity-catalog");
  resolver = await import("../server/destination-resolver");
  for (const id of ["first", "second"]) {
    const w = createWorkspace(id, `${id}@example.test`);
    w.profile.confirmed = true;
    confirmCandidateDetails(w);
    w.jobs = [job()];
    await database.store.insert("users", {
      id,
      name: id,
      email: `${id}@example.test`,
    });
    await database.store.insert("workspaces", {
      id: `${id}:live`,
      userId: id,
      data: w,
    });
  }
}, 60000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await database?.closeDb();
  if (directory?.startsWith(join(tmpdir(), "empregatos-resolution-")))
    await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("Resolução persistente, catálogo público e isolamento", () => {
  it("limita custo diário da pesquisa automática e mantém o conjunto restante",()=>{
    const w=createWorkspace("Pessoa","qa@example.test");w.routine.enabled=true;w.routine.mode="automatic";w.jobs=[job()];
    const day=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
    w.routine.researchBudget={day,used:199};expect(queue.researchAllowance(w)).toBe(1);
    w.routine.researchBudget.used=200;expect(queue.researchAllowance(w)).toBe(0);
    expect(queue.needsResearch(w.jobs[0],w)).toBe(true);
  });
  it("prioriza uma vaga compatível antes de diversificar para vagas abaixo da pontuação mínima", () => {
    const w=createWorkspace("Pessoa","qa@example.test");
    w.profile.confirmed=true;w.profile.skills=["React","TypeScript","Git"];w.profile.headline="Desenvolvedor React";w.profile.education="Ensino médio completo";
    w.routine.minScore=70;
    w.jobs=[{...job(),id:"researched",resolution:{state:"no_destination",checkedAt:new Date().toISOString(),retryAt:new Date(Date.now()+86400000).toISOString(),complete:true,consulted:[],matches:[],message:"Consultada"}},
      {...job(),id:"compatible",url:"https://www.linkedin.com/jobs/view/900004"},
      {...job(),id:"different",company:"Outra empresa",url:"https://www.linkedin.com/jobs/view/900005",title:"Desenvolvedor Python",description:"Python",skills:["Python"]}];
    expect(queue.selectResearchJobs(w,[],1)[0].id).toBe("compatible");
  });
  it("continua pelas vagas ainda não consultadas depois das primeiras vinte", () => {
    const w=createWorkspace("Pessoa","qa@example.test");
    w.routine.enabled=true;w.routine.mode="automatic";
    w.jobs=Array.from({length:25},(_,index)=>({...job(),id:`pool-${index}`,url:`https://www.linkedin.com/jobs/view/${900100+index}`,
      ...(index<20 ? {resolution:{state:"no_destination" as const,checkedAt:new Date().toISOString(),retryAt:new Date(Date.now()+86400000).toISOString(),complete:true,consulted:[],matches:[],message:"Consultada"}} : {})}));
    expect(queue.researchAllowance(w)).toBe(5);
    expect(queue.selectResearchJobs(w,[],4)).toHaveLength(4);
    for(const vacancy of w.jobs) vacancy.resolution={state:"no_destination",checkedAt:new Date().toISOString(),retryAt:new Date(Date.now()+86400000).toISOString(),complete:true,consulted:[],matches:[],message:"Consultada"};
    expect(queue.researchAllowance(w)).toBe(0);
  });
  it("não pesquisa novamente URLs cujo envio foi preservado após limpeza", async () => {
    const {opportunityKey}=await import("../server/job-identity");
    const w=createWorkspace("Pessoa","qa@example.test");
    w.routine.enabled=true;w.routine.mode="automatic";w.jobs=[job()];
    w.submissionExclusions=[opportunityKey(w.jobs[0])];
    expect(queue.needsResearch(w.jobs[0],w)).toBe(false);
    expect(queue.researchAllowance(w)).toBe(0);
  });
  it("consulta empresas alternativas antes de consumir toda a cota no mesmo quadro", () => {
    const w = createWorkspace("Pessoa", "qa@example.test");
    w.jobs = [
      ...Array.from({length:8}, (_,i) => ({...job(), id:`large-${i}`, company:"Quadro grande", url:`https://jobs.lever.co/large/00000000-0000-4000-8000-${String(i).padStart(12,'0')}`})),
      {...job(),id:"alternative",company:"Outra empresa",url:"https://empresa.gupy.io/jobs/123"},
    ];
    const selected = queue.selectResearchJobs(w, [], 4);
    expect(selected.map(j=>j.id)).toContain("alternative");
    w.jobs[0].resolution = {state:"no_destination",checkedAt:new Date().toISOString(),retryAt:new Date(Date.now()+86400000).toISOString(),complete:true,consulted:[],matches:[],message:"Sem destino"};
    expect(queue.selectResearchJobs(w, [], 1)[0].id).toBe("alternative");
    expect(queue.selectResearchJobs(w, ["large-7"], 1)[0].id).toBe("large-7");
  });
  it("reserva uma única tarefa por conta e rejeita reentrega concorrente", async () => {
    const [a, b] = await Promise.all([
      queue.enqueueResolution("first:live"),
      queue.enqueueResolution("first:live"),
    ]);
    expect(a).toBe(b);
    let release!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    let entered!: () => void;
    const started = new Promise<void>((done) => (entered = done));
    const search = vi
      .spyOn(resolver, "resolveApplicationDestinations")
      .mockImplementation(async (input) => {
        entered();
        await gate;
        return {
          ...input,
          resolution: {
            state: "no_destination",
            checkedAt: new Date().toISOString(),
            retryAt: new Date(Date.now() + 3600000).toISOString(),
            complete: true,
            consulted: [
              {
                source: "controlled",
                count: 0,
                outcome: "Consulta controlada",
              },
            ],
            matches: [],
            message: "Nenhum destino neste teste.",
          },
          destinations: [],
        };
      });
    const first = queue.processResolutionTask(a!);
    await started;
    await expect(queue.processResolutionTask(a!)).rejects.toBeInstanceOf(
      queue.ResolutionBusyError,
    );
    release();
    expect(await first).toBe(true);
    expect(await queue.processResolutionTask(a!)).toBe(false);
    expect(search).toHaveBeenCalledOnce();
    expect(
      (await database.readWorkspace("first:live"))?.jobs[0].resolution?.state,
    ).toBe("no_destination");
  });
  it("uma segunda conta reaproveita a análise pública sem copiar dados pessoais ou refazer a consulta", async () => {
    const search = vi.spyOn(resolver, "resolveApplicationDestinations");
    const taskId = await queue.enqueueResolution("second:live");
    await queue.processResolutionTask(taskId!);
    expect(search).not.toHaveBeenCalled();
    const second = (await database.readWorkspace("second:live"))!;
    expect(second.profile.email).toBe("second@example.test");
    expect(second.applications).toEqual([]);
    const records = await catalog.companyOpportunities(job().company);
    expect(records).toHaveLength(1);
    expect(records[0].saved).toBe(false);
    expect(records[0].match.strengths).toEqual([]);
    expect(records[0].application).toBeUndefined();
  });
  it("atualização de uma fonte preserva resolução recente da mesma publicação", async () => {
    await catalog.publishOpportunities([job()]);
    expect(
      (await catalog.companyOpportunities(job().company))[0].resolution?.state,
    ).toBe("no_destination");
  });
  it("um worker com token antigo não pode sobrescrever a atualização pública", async () => {
    const item = { ...job(), url: "https://www.linkedin.com/jobs/view/900002" };
    const claim = await catalog.claimPublicResolution(item);
    await database.store.update(
      "opportunityCatalog",
      { leaseToken: "another-owner" },
      eq("key", claim.key),
    );
    await expect(
      catalog.finishPublicResolution(claim.key, claim.token!, item),
    ).rejects.toThrow("reserva");
  });
  it("a análise manual prioriza a vaga solicitada mesmo com a rotina pausada", async () => {
    await database.mutateWorkspace("first:live", (w) => {
      w.routine.enabled = false;
      w.jobs = Array.from({ length: 6 }, (_, index) => ({
        ...job(),
        id: `target-${index}`,
        url: `https://www.linkedin.com/jobs/view/target-${index}`,
        match: { ...job().match, score: 100 - index },
      }));
    });
    const resolved = vi
      .spyOn(resolver, "resolveApplicationDestinations")
      .mockImplementation(async (input) => ({
        ...input,
        destinations: [],
        resolution: {
          state: "partial",
          checkedAt: new Date().toISOString(),
          retryAt: new Date(Date.now() + 3600000).toISOString(),
          complete: false,
          consulted: [],
          matches: [],
          message: "Teste de prioridade",
        },
      }));
    const taskId = await queue.enqueueResolution("first:live", ["target-5"]);
    await queue.processResolutionTask(taskId!);
    expect(resolved.mock.calls[0][0].id).toBe("target-5");
    expect(
      (await database.readWorkspace("first:live"))?.jobs.find(
        (item) => item.id === "target-5",
      )?.resolution,
    ).toBeDefined();
  });
});

it("preserva um canal de e-mail validado quando a busca alternativa não encontra outro", async () => {
  const vacancy = {...job(), id:"email-preserved",url:"https://www.linkedin.com/jobs/view/9000999",
    emailDestination:{email:"candidaturas@empresa.example",publicationUrl:"https://www.linkedin.com/jobs/view/9000999",employerUrl:"https://empresa.example",verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}};
  const w=createWorkspace("Email","email-preserved@example.test");w.jobs=[vacancy];
  await database.store.insert("users",{id:"email-preserved",name:"Email",email:"email-preserved@example.test"});
  await database.store.insert("workspaces",{id:"email-preserved:live",userId:"email-preserved",data:w});
  vi.spyOn(resolver,"resolveApplicationDestinations").mockImplementation(async input=>({...input,emailDestination:undefined,destinations:[],resolution:{state:"no_destination",checkedAt:new Date().toISOString(),retryAt:new Date(Date.now()+86400000).toISOString(),complete:true,consulted:[],matches:[],message:"Sem outro destino"}}));
  const task=await queue.enqueueResolution("email-preserved:live",[vacancy.id]);
  await queue.processResolutionTask(task!);
  expect((await database.readWorkspace("email-preserved:live"))!.jobs[0].emailDestination).toEqual(vacancy.emailDestination);
});

it("consulta dois destinos públicos em paralelo sem perder atualizações da conta", async () => {
  const w=createWorkspace("Parallel","parallel@example.test");w.routine.enabled=true;w.routine.mode="automatic";
  w.jobs=[1,2].map(index=>({...job(),id:`parallel-${index}`,company:"Parallel QA",url:`https://www.linkedin.com/jobs/view/900088${index}`}));
  await database.store.insert("users",{id:"parallel",name:"Parallel",email:"parallel@example.test"});
  await database.store.insert("workspaces",{id:"parallel:live",userId:"parallel",data:w});
  let started!:()=>void,release!:()=>void,active=0,maximum=0;
  const both=new Promise<void>(resolve=>{started=resolve});
  const gate=new Promise<void>(resolve=>{release=resolve});
  vi.spyOn(resolver,"resolveApplicationDestinations").mockImplementation(async input=>{
    active++;maximum=Math.max(maximum,active);if(active===2) started();await gate;active--;
    return {...input,destinations:[],resolution:{state:"no_destination",checkedAt:new Date().toISOString(),retryAt:new Date(Date.now()+86400000).toISOString(),complete:true,consulted:[],matches:[],message:"Sem destino"}};
  });
  const task=await queue.enqueueResolution("parallel:live");
  const processing=queue.processResolutionTask(task!);
  await both;release();await processing;
  expect(maximum).toBe(2);
  expect((await database.readWorkspace("parallel:live"))!.jobs.every(j=>j.resolution?.state==="no_destination")).toBe(true);
});
