import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";
import type { FastifyInstance } from "fastify";
import type { Job, Resume } from "../shared/types";
import { createWorkspace } from "../server/workspace";
import { eq } from "drizzle-orm";
import { confirmCandidateDetails } from "./fixtures/candidate-details";

let app: FastifyInstance,
  directory = "",
  cookie = "",
  workspaceId = "",
  resume: Resume;
let database: typeof import("../server/db"),
  operations: typeof import("../server/operations"),
  native: typeof import("../server/portal-sessions");
const bytes = Buffer.from(
  zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Objetivo: Desenvolvedor .NET. Competências C# .NET Git. Primeiro emprego. Ensino médio completo.</w:t></w:r></w:p></w:body></w:document>',
    ),
  }),
);
function job(id: string, portal = "gupy"): Job {
  const url =
    portal === "gupy"
      ? `https://empresa.gupy.io/jobs/${id}`
      : `https://www.infojobs.com.br/vaga-de-desenvolvedor__${id}.aspx`;
  return {
    id,
    title: "Desenvolvedor .NET",
    company: "Empresa",
    source: portal,
    url,
    description: "Desenvolvimento de APIs com C# .NET e Git.",
    location: "Brasil",
    modality: "Remoto",
    level: "Júnior",
    contract: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: ["C#", ".NET", "Git"],
    requiredSkills: [],
    requiredYears: null,
    publishedAt: null,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    origins: [{ source: "portal", url, id: `${portal}:${id}` }],
    match: {} as Job["match"],
    demo: false,
  };
}
const prepare = async (jobs: Job[], waiting = true) =>
  database.mutateWorkspace(workspaceId, (w) => {
    w.jobs.push(...jobs);
    const prepared = jobs.map((job) => operations.prepare(w, job.id));
    if (waiting) prepared.forEach((a) => (a.status = "Aguardando aprovação"));
    w.applications = [
      ...prepared,
      ...w.applications.filter((a) => !prepared.includes(a)),
    ];
    return prepared.map((a) => a.id);
  });
const sender = () =>
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          status: "sent",
          receipt: "controlled-test-receipt",
        }),
      ),
  );
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-send-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  database = await import("../server/db");
  operations = await import("../server/operations");
  native = await import("../server/portal-sessions");
  app = await (await import("../server/app")).buildApp();
  const headers = { "x-orbita-request": "1", origin: "http://127.0.0.1:5173" };
  const account = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers,
    payload: {
      name: "Pessoa candidata",
      email: "sending@example.test",
      password: "Sending-password-123",
    },
  });
  expect(account.statusCode).toBe(200);
  cookie = String(account.headers["set-cookie"]).split(";")[0];
  workspaceId = `${account.json().id}:live`;
  const uploaded = await app.inject({
    method: "POST",
    url: "/api/resumes",
    headers: {
      ...headers,
      cookie,
      "content-type": "multipart/form-data; boundary=resume",
    },
    payload: Buffer.concat([
      Buffer.from(
        '--resume\r\nContent-Disposition: form-data; name="file"; filename="curriculo.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n',
      ),
      bytes,
      Buffer.from("\r\n--resume--\r\n"),
    ]),
  });
  expect(uploaded.statusCode).toBe(200);
  resume = structuredClone(
    (await database.readWorkspace(workspaceId))!.resumes[0],
  );
}, 30000);
beforeEach(async () => {
  const { applicationUsage } = await import("../server/schema");
  await database.db
    .delete(applicationUsage)
    .where(eq(applicationUsage.userId, workspaceId.split(":")[0]));
  vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "true");
  vi.stubEnv(
    "APPLICATION_WEBHOOK_URL",
    "https://sender.example.test/applications",
  );
  vi.stubEnv("APPLICATION_WEBHOOK_TOKEN", "private-test-token");
  vi.stubEnv("APPLICATION_WEBHOOK_PORTALS", "gupy");
  vi.stubEnv("PORTAL_BROWSER_AUTHORIZED", "");
  vi.spyOn(native, "connectedPortals").mockResolvedValue([]);
  await database.mutateWorkspace(workspaceId, (w) => {
    Object.assign(
      w,
      createWorkspace("Pessoa candidata", "sending@example.test"),
    );
    w.resumes = [
      { ...structuredClone(resume), approved: true, targetsConfirmed: false },
    ];
    w.profile.confirmed = true;
    confirmCandidateDetails(w);
    w.profile.headline = "Desenvolvedor .NET";
    w.profile.skills = ["C#", ".NET", "Git"];
    w.filters.titles = ["Desenvolvedor .NET"];
    w.routine.enabled = true;
    w.routine.mode = "automatic";
    w.routine.minScore = 0;
    w.routine.dailyLimit = 1;
    w.sources = ["gupy", "infojobs"].map((board) => ({
      id: board,
      type: "portal",
      board,
      company: board,
      enabled: true,
      discovery: true,
      application: true,
      status: "",
    }));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  await database?.closeDb();
  if (directory.startsWith(join(tmpdir(), "empregatos-send-")))
    await rm(directory, { recursive: true, force: true });
});
describe("Encaminhamento real de candidaturas, sem serviços externos no teste", () => {
  it('persists the Quickin rejection diagnostic on the attempt and refuses another transmission',async()=>{
    vi.stubEnv('APPLICATION_WEBHOOK_AUTHORIZED','false');
    vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','controlled-snapshot');
    vi.stubEnv('ATS_BROWSER_AUTHORIZED','quickin:globalti');
    const ats=await import('../server/ats-execution');
    const vacancy=job('quickin-rejection');
    vacancy.url='https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0';
    vacancy.destinations=[{id:'quickin',platform:'quickin',company:vacancy.company,url:`${vacancy.url}/apply`,publicationUrl:vacancy.url,state:'verified',method:'browser',formFound:true,confidence:100,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidence:['Fixture']}];
    const [id]=await prepare([vacancy]);
    const diagnostic={provider:'quickin' as const,phase:'application_response' as const,httpStatus:400,providerCode:'ValidationError' as const,fieldNames:['email'],responseSha256:'a'.repeat(64)};
    const send=vi.spyOn(ats,'sendAtsApplication')
      .mockResolvedValueOnce({status:'action_required',preflightReady:true,message:'Pronto'})
      .mockResolvedValueOnce({status:'unknown',diagnostic,message:'A Quickin não confirmou o recebimento (HTTP 400; ValidationError). Confira antes de repetir.'});
    const result=await operations.automaticSend(workspaceId,id);
    expect(result).toMatchObject({status:'Resultado desconhecido',receipt:null,attempts:[{outcome:'unknown',diagnostic}]});
    expect((await database.readWorkspace(workspaceId))!.applications.find(a=>a.id===id)?.attempts?.[0].diagnostic).toEqual(diagnostic);
    await expect(operations.automaticSend(workspaceId,id)).rejects.toThrow();
    await database.mutateWorkspace(workspaceId,w=>{expect(operations.queuePreparedApplications(w,[])).toBe(0);});
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("responde novas perguntas após a preparação e conclui o formulário sem outra ação do usuário",async()=>{
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED","false");
    vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","controlled-snapshot");
    vi.stubEnv("ATS_BROWSER_AUTHORIZED","lever:empresa");
    const ats=await import("../server/ats-execution");
    const vacancy=job("dynamic-questions");
    vacancy.destinations=[{id:"dynamic",platform:"lever",company:vacancy.company,url:"https://jobs.lever.co/empresa/96ec1808-6b61-4fda-832b-58d7c104edd9/apply",publicationUrl:vacancy.url,state:"verified",method:"browser",formFound:true,confidence:100,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidence:["Fixture"]}];
    await database.mutateWorkspace(workspaceId,w=>{w.profile.answerPolicy={enabled:true,missing:"no",confirmedAt:new Date().toISOString()};});
    const [id]=await prepare([vacancy]);
    const send=vi.spyOn(ats,"sendAtsApplication")
      .mockResolvedValueOnce({status:"action_required",preflightReady:true,message:"Pronto"})
      .mockResolvedValueOnce({status:"action_required",retryable:true,message:"Nova pergunta",missingQuestions:["Qual o seu gênero?"],questionOptions:{"Qual o seu gênero?":["Masculino","Feminino","Prefiro não informar"]}})
      .mockResolvedValueOnce({status:"sent",receipt:"dynamic-receipt",message:"Recebido",answersUsed:[{question:"Qual o seu gênero?",value:"Prefiro não informar"}]});
    const result=await operations.automaticSend(workspaceId,id);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0].profile.approvedAnswers).toEqual(expect.arrayContaining([expect.objectContaining({value:"Prefiro não informar",destinationUrl:vacancy.destinations[0].url})]));
    expect(result).toMatchObject({status:"Enviada",receipt:"dynamic-receipt"});
    expect(result.answersUsed?.[0]).toMatchObject({source:"default_no",value:"Prefiro não informar"});
  });
  it("não recria candidatura enviada após apagar o histórico",async()=>{
    const {clearApplicationHistory}=await import("../server/clear-application-history");
    const vacancy=job("erased-sent");
    const [id]=await prepare([vacancy]);
    await database.mutateWorkspace(workspaceId,w=>{
      const application=w.applications.find(a=>a.id===id)!;
      application.status="Enviada";application.receipt="receipt";
      clearApplicationHistory(w);
      w.jobs.push(vacancy);
      expect(()=>operations.prepare(w,vacancy.id)).toThrow("antes da limpeza");
      expect(operations.queuePreparedApplications(w,[])).toBe(0);
    });
  });
  it("prepares, sends and records negative answers without per-vacancy confirmation under the user's policy",async()=>{
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED","false");
    vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","controlled-snapshot");
    vi.stubEnv("ATS_BROWSER_AUTHORIZED","lever:empresa");
    const ats=await import("../server/ats-execution");
    const questions=["Como ficou sabendo da nossa vaga?","Possui familiar na empresa?","Você precisa de acessibilidade?"];
    const vacancy=job("automatic-policy");vacancy.source="LinkedIn";
    vacancy.destinations=[{id:"auto-destination",platform:"lever",company:vacancy.company,url:"https://jobs.lever.co/empresa/96ec1808-6b61-4fda-832b-58d7c104edd9/apply",publicationUrl:vacancy.url,state:"verified",method:"browser",formFound:true,confidence:100,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidence:["Fixture"]}];
    await database.mutateWorkspace(workspaceId,w=>{w.profile.answerPolicy={enabled:true,missing:"no",confirmedAt:new Date().toISOString()};});
    const [id]=await prepare([vacancy]);
    const send=vi.spyOn(ats,"sendAtsApplication").mockResolvedValueOnce({status:"action_required",retryable:true,message:"Perguntas",missingQuestions:questions,questionOptions:{[questions[0]]:["LinkedIn","Outro"],[questions[1]]:["Sim","Não"],[questions[2]]:["Sim","Não"]}})
      .mockResolvedValueOnce({status:"action_required",preflightReady:true,message:"Pronto"})
      .mockResolvedValueOnce({status:"sent",receipt:"controlled-automatic-policy-receipt",message:"Recebido",answersUsed:questions.map((question,i)=>({question,value:i===0?"LinkedIn":"Não"}))});
    const result=await operations.automaticSend(workspaceId,id);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1][0].inspectOnly).toBe(true);
    expect(send.mock.calls[1][0].profile.approvedAnswers?.map(a=>a.value)).toEqual(["LinkedIn","Não","Não"]);
    expect(send.mock.calls[2][0].resume.file).toBeDefined();
    expect(result.status).toBe("Enviada");
    expect(result.automaticAnswers?.map(a=>a.source)).toEqual(["job_source","default_no","default_no"]);
    expect(result.answersUsed?.map(a=>[a.question,a.value,a.source])).toEqual(questions.map((q,i)=>[q,i===0?"LinkedIn":"Não",i===0?"job_source":"default_no"]));
    expect((await database.readWorkspace(workspaceId))!.profile.approvedAnswers).toBeUndefined();
  });
  it("prepara perguntas antes de reservar cota ou iniciar envio e não reencaminha pendências", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID", "controlled-snapshot");
    vi.stubEnv("ATS_BROWSER_AUTHORIZED", "lever:empresa");
    const ats = await import("../server/ats-execution");
    const inspect = vi.spyOn(ats, "sendAtsApplication").mockResolvedValue({
      status:"action_required", retryable:true, message:"Responda nas Preferências.",
      missingQuestions:["Qual é seu nível de inglês?"], questionOptions:{"Qual é seu nível de inglês?":["Básico","Avançado"]},
    });
    const vacancy = job("9400");
    vacancy.destinations = [{id:"controlled-lever", platform:"lever", company:vacancy.company,
      url:"https://jobs.lever.co/empresa/96ec1808-6b61-4fda-832b-58d7c104edd9/apply",
      publicationUrl:vacancy.url, state:"verified", method:"browser", formFound:true, confidence:100,
      verifiedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+60000).toISOString(), evidence:["Controlled fixture"]}];
    const [applicationId] = await prepare([vacancy]);
    const result = await operations.automaticSend(workspaceId, applicationId);
    expect(inspect).toHaveBeenCalledOnce();
    expect(inspect.mock.calls[0][0].inspectOnly).toBe(true);
    expect(inspect.mock.calls[0][0].resume.file).toBeUndefined();
    expect(result.status).toBe("Requer ação manual");
    expect(result.missingQuestions).toEqual(["Qual é seu nível de inglês?"]);
    expect(result.history.some(e => e.message.startsWith("Envio iniciado."))).toBe(false);
    const { applicationUsage } = await import("../server/schema");
    expect(await database.db.select().from(applicationUsage).where(eq(applicationUsage.applicationId,applicationId))).toHaveLength(0);
    await database.mutateWorkspace(workspaceId,w => expect(operations.queuePreparedApplications(w,[])).toBe(0));
    const saved = await app.inject({method:"PUT", url:`/api/applications/${applicationId}/answers`,
      headers:{cookie,"x-orbita-request":"1",origin:"http://127.0.0.1:5173"},
      payload:{confirmation:true,answers:[{question:"Qual é seu nível de inglês?",value:"Básico",reuse:false}]}});
    expect(saved.statusCode).toBe(200);
    expect((await database.readWorkspace(workspaceId))!.applications.find(a=>a.id===applicationId)?.status).toBe("Aguardando aprovação");
    inspect.mockResolvedValueOnce({status:"action_required",preflightReady:true,message:"Preparação completa."})
      .mockResolvedValueOnce({status:"sent",receipt:"controlled-preflight-receipt",message:"Recebido no teste controlado."});
    const sent = await operations.automaticSend(workspaceId, applicationId);
    expect(sent.status).toBe("Enviada");
    expect(inspect.mock.calls[1][0].inspectOnly).toBe(true);
    expect(inspect.mock.calls[2][0].inspectOnly).toBeUndefined();
    expect(inspect.mock.calls[2][0].resume.file).toBeDefined();
    expect(await database.db.select().from(applicationUsage).where(eq(applicationUsage.applicationId,applicationId))).toHaveLength(1);
  });
  it("retoma respostas completas mesmo com cota reservada e outras vagas pendentes", async () => {
    const vacancy=job("9500");
    const [applicationId]=await prepare([vacancy],false);
    await database.mutateWorkspace(workspaceId,w=>{
      const a=w.applications.find(a=>a.id===applicationId)!;
      a.missingQuestions=[];
      a.resumeState={kind:"ats",resumeId:a.resumeId!,destinationUrl:vacancy.url,targetUrl:vacancy.url,recordedAt:new Date().toISOString()};
      a.history.push({at:new Date().toISOString(),actor:"Sistema",message:"Envio iniciado."});
      w.applications.push({...structuredClone(a),id:"other-pending",jobId:"other",status:"Aguardando aprovação"});
      expect(operations.queuePreparedApplications(w,[])).toBe(1);
      expect(a.status).toBe("Aguardando aprovação");
      expect(operations.queuePreparedApplications(w,[])).toBe(0);
    });
  });
  it("queues cached eligible vacancies without discovery and respects pending quota and duplicates", async () => {
    await database.mutateWorkspace(workspaceId,w=>{
      w.jobs=[job("9300","infojobs"),job("9301"),job("9302")];
      w.jobs[1].contract="Não especificado";
      w.filters.contracts=["CLT","PJ"];
      expect(operations.queuePreparedApplications(w,[])).toBe(1);
      expect(w.applications).toHaveLength(1);
      expect(w.applications[0].jobId).toBe("9301");
      expect(w.applications[0].status).toBe("Aguardando aprovação");
      expect(operations.queuePreparedApplications(w,[])).toBe(0);
      w.routine.mode="approval";
      w.routine.dailyLimit=5;
      expect(operations.queuePreparedApplications(w,[])).toBe(0);
      w.routine.mode="automatic";
      w.routine.enabled=false;
      expect(operations.queuePreparedApplications(w,[])).toBe(0);
      w.routine.enabled=true;
      expect(operations.queuePreparedApplications(w,[],1)).toBe(0);
    });
  });
  it('não repete um formulário bloqueado sem alteração dos dados confirmados',async()=>{
    const {preparationFingerprint}=await import('../server/submission-preparation');
    const vacancy=job('9501');const [id]=await prepare([vacancy],false);
    await database.mutateWorkspace(workspaceId,w=>{
      const a=w.applications.find(a=>a.id===id)!;a.automaticBlockedFingerprint=preparationFingerprint(w,a);
      expect(operations.queuePreparedApplications(w,[])).toBe(0);
      w.profile.phone='11988887777';
      expect(operations.queuePreparedApplications(w,[])).toBe(1);
    });
  });
  it.each([false, true])("worker Gmail confirms acceptance (individual exception: %s)", async (exception) => {
    vi.stubEnv("GOOGLE_CLIENT_ID","fixture.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET","fixture-secret");
    vi.stubEnv("APP_ORIGIN","http://127.0.0.1:5173");
    vi.stubEnv("GOOGLE_REDIRECT_URI","http://127.0.0.1:5173/api/auth/google/callback");
    const gmail=await import("../server/gmail-connection");
    const email=await import("../server/email-application");
    vi.spyOn(gmail,"gmailConnection").mockResolvedValue({configured:true,connected:true,email:"sending@example.test",permission:"send_only"});
    const deliver=vi.spyOn(email,"sendEmailApplication").mockResolvedValue({status:"sent",receipt:"Gmail message ID: controlled-worker-message",message:"Gmail confirmou aceitação; não confirma entrega."});
    const candidate=job("email-job");candidate.url="https://employer.example/careers/dotnet";
    candidate.contract="Não especificado";
    await database.mutateWorkspace(workspaceId,w=>{w.filters.contracts=["CLT","PJ"];});
    candidate.emailDestination={email:"talentos@employer.example",publicationUrl:candidate.url,employerUrl:"https://employer.example/",verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
    const [id]=await prepare([candidate]);
    if (exception) {
      const {missingDataFingerprint}=await import("../server/missing-data-consent");
      await database.mutateWorkspace(workspaceId,w=>{
        const j=w.jobs.find(item=>item.id===candidate.id)!;
        j.skills=[];j.requiredSkills=[];j.description="Candidatura por e-mail";j.title="Desenvolvedor";j.contract="Não especificado";
        w.filters.titles=["Desenvolvedor"];w.filters.contracts=["CLT"];w.filters.dateKnownOnly=true;
        w.routine.mode="approval";
        const a=w.applications.find(item=>item.id===id)!;
        a.missingDataConsent={fingerprint:missingDataFingerprint(j),resumeId:a.resumeId!,confirmedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString()};
        a.singleSubmission={resumeId:a.resumeId!,destinationUrl:`mailto:${j.emailDestination!.email}`,method:"email",confirmedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString()};
      });
    }
    if (exception) {
      deliver.mockResolvedValueOnce({status:"action_required",message:"O Gmail recusou o envio. [GMAIL_REJECTED HTTP 403: PERMISSION_DENIED] Confira a conexao."});
      const refused=await operations.automaticSend(workspaceId,id);
      expect(refused.status).toBe("Requer a\u00e7\u00e3o manual");
      await database.mutateWorkspace(workspaceId,w=>{
        const a=w.applications.find(item=>item.id===id)!;
        a.missingDataConsent!.expiresAt=new Date(Date.now()-1).toISOString();
        const renewed=operations.prepare(w,candidate.id,a.resumeId!,true);
        expect(renewed.id).toBe(id);
        expect(Date.parse(renewed.missingDataConsent!.expiresAt)).toBeGreaterThan(Date.now());
        expect(w.applications.filter(item=>item.id===id)).toHaveLength(1);
      });
      await database.mutateWorkspace(workspaceId,w=>{
        const a=w.applications.find(item=>item.id===id)!;
        a.status="Aguardando aprova\u00e7\u00e3o";
        a.singleSubmission!.confirmedAt=new Date().toISOString();
        a.history.push({at:new Date().toISOString(),actor:"Usu\u00e1rio",message:"Autorizou somente esta candidatura novamente."});
      });
    }
    const result=await operations.automaticSend(workspaceId,id);
    expect(result.status).toBe("Enviada");
    expect(result.destinationUrl).toBe("mailto:talentos@employer.example");
    expect(result.verification?.method).toBe("email_provider_acceptance");
    expect(result.history.at(-1)?.message).toContain("não confirma entrega");
    expect(deliver).toHaveBeenCalledTimes(exception ? 2 : 1);
    expect(deliver.mock.calls[0][1].resume.file?.data).toBe(bytes.toString("base64"));
    await expect(operations.automaticSend(workspaceId,id)).rejects.toThrow();
    expect(deliver).toHaveBeenCalledTimes(exception ? 2 : 1);
  });
  it("process endpoint queues existing vacancies immediately and rejects paused automation", async () => {
    await database.mutateWorkspace(workspaceId,w=>{w.jobs=[job("9400"),job("9401")];});
    const request = () => app.inject({method:"POST",url:"/api/routine/process",headers:{cookie,origin:"http://127.0.0.1:5173","x-orbita-request":"1"},payload:{jobId:"9401"}});
    const response = await request();
    expect(response.statusCode).toBe(200);
    expect(response.json().queued).toBe(1);
    expect((await database.readWorkspace(workspaceId))!.applications.map(a=>a.jobId)).toEqual(["9401"]);
    expect((await request()).json().queued).toBe(0);
    await database.mutateWorkspace(workspaceId,w=>{w.routine.enabled=false;});
    expect((await request()).statusCode).toBe(400);
  });
  it("recovery requires an explicit no-submission review, then resumes only the pinned ATS destination", async()=>{
    const candidate=job("9501");
    const [id]=await prepare([candidate]);
    const target="https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply";
    await database.mutateWorkspace(workspaceId,w=>{
      const a=w.applications.find(a=>a.id===id)!;
      a.status="Resultado desconhecido";a.destinationUrl=target;
      a.history.push({at:new Date().toISOString(),actor:"Sistema",message:"Envio iniciado."});
      w.jobs[0].destinations=[{id:"ats",platform:"lever",state:"verified",formFound:true,url:target,publicationUrl:candidate.url,company:candidate.company,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),confidence:100,evidence:[],method:"browser"}];
    });
    const request=(confirmation:boolean)=>app.inject({method:"POST",url:`/api/applications/${id}/confirm-not-submitted`,headers:{cookie,origin:"http://127.0.0.1:5173","x-orbita-request":"1"},payload:{confirmation,reason:"Confirmed infrastructure rejection before browser creation."}});
    expect((await request(false)).statusCode).toBe(400);
    expect((await database.readWorkspace(workspaceId))!.applications[0].status).toBe("Resultado desconhecido");
    expect((await request(true)).statusCode).toBe(200);
    const a=(await database.readWorkspace(workspaceId))!.applications[0];
    expect(a.status).toBe("Requer ação manual");
    expect(a.resumeState).toMatchObject({kind:"ats",targetUrl:target,destinationUrl:candidate.url});
    expect(a.receipt).toBeNull();
    expect(a.history.at(-1)?.message).toContain("Confirmou após verificação");
  });
  it("retoma uma pausa Gupy após respostas aprovadas sem reservar ou consumir outra candidatura", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    vi.stubEnv("PORTAL_BROWSER_AUTHORIZED", "gupy");
    vi.mocked(native.connectedPortals).mockResolvedValue(["gupy"]);
    vi.spyOn(native, "readyPortals").mockResolvedValue(["gupy"]);
    const question = "Qual é sua certificação profissional?";
    const nativeSend = vi
      .spyOn(native, "sendNativeApplication")
      .mockResolvedValueOnce({
        status: "action_required",
        message: "Responda à pergunta",
        retryable: true,
        missingQuestions: [question],
      })
      .mockResolvedValueOnce({
        status: "sent",
        message: "Candidatura finalizada!",
        receipt: "gupy-resumed-verified",
        continuationUrl: "https://empresa.gupy.io/candidates/applications/777",
      });
    const sourceJob = job("resumable");
    sourceJob.url = "https://empresa.gupy.io/jobs/12345";
    sourceJob.origins = [
      { source: "portal", url: sourceJob.url, id: "gupy:12345" },
    ];
    sourceJob.resolution = {
      state: "partial",
      checkedAt: new Date().toISOString(),
      retryAt: new Date(Date.now() + 3600000).toISOString(),
      complete: false,
      consulted: [],
      matches: [],
      message: "Controlled destination check",
    };
    const [id] = await prepare([sourceJob]);
    const paused = await operations.automaticSend(workspaceId, id);
    expect(paused.status).toBe("Requer ação manual");
    expect(paused.resumeState?.destinationUrl).toBe(sourceJob.url);
    expect(
      (await apiRequest("GET", `/api/applications/${id}/readiness`)).json()
        .ready,
    ).toBe(false);
    const answer = await apiRequest("PUT", `/api/applications/${id}/answers`, {
      confirmation: true,
      answers: [{ question, value: "Não possuo certificação", reuse: false }],
    });
    expect(answer.statusCode).toBe(200);
    await database.mutateWorkspace(workspaceId, (w) => {
      w.routine.enabled = false;
    });
    const readiness = (
      await apiRequest("GET", `/api/applications/${id}/readiness`)
    ).json();
    expect(readiness.ready).toBe(true);
    const authorized = await apiRequest(
      "POST",
      `/api/applications/${id}/send`,
      {
        confirmation: true,
        resumeId: readiness.resumeId,
        destinationUrl: readiness.destinationUrl,
        method: readiness.method,
      },
    );
    expect(authorized.statusCode).toBe(200);
    await operations.processAutomaticApplications(workspaceId);
    const w = (await database.readWorkspace(workspaceId))!;
    const sent = w.applications.find((a) => a.id === id)!;
    expect(sent.status).toBe("Enviada");
    expect(sent.resumeState).toBeUndefined();
    expect(sent.verification?.destinationUrl).toContain(
      "/candidates/applications/777",
    );
    expect(w.routine.enabled).toBe(false);
    const { applicationUsage } = await import("../server/schema");
    const usage = await database.db
      .select()
      .from(applicationUsage)
      .where(eq(applicationUsage.applicationId, id));
    expect(usage).toHaveLength(1);
    expect(nativeSend).toHaveBeenCalledTimes(2);
  });
  it("não envia uma vaga PJ quando a pessoa declarou que não aceita PJ", async () => {
    const send = sender();
    const vacancy = job("pj-declined");
    vacancy.contract = "PJ";
    const [id] = await prepare([vacancy]);
    await database.mutateWorkspace(workspaceId, (w) => {
      w.profile.acceptsPj = false;
    });
    expect(
      (await apiRequest("GET", `/api/applications/${id}/readiness`)).json()
        .ready,
    ).toBe(false);
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("coleta dados pelo endpoint autenticado e impede envio com dados básicos incompletos", async () => {
    const send = sender();
    const [id] = await prepare([job("1300")]);
    await database.mutateWorkspace(workspaceId, (w) => {
      delete w.profile.candidateDetailsConfirmedAt;
      w.profile.phone = "";
      w.profile.location = "";
      w.profile.years = null;
    });
    const preview = (
      await apiRequest("GET", `/api/applications/${id}/readiness`)
    ).json();
    expect(preview.ready).toBe(false);
    expect(preview.blockers.join(" ")).toContain("dados para candidatura");
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow(
      "dados para candidatura",
    );
    expect(send).not.toHaveBeenCalled();
    const endpoint = (payload: Record<string, unknown>) =>
      app.inject({
        method: "PUT",
        url: "/api/candidate-details",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "x-orbita-request": "1",
        },
        payload,
      });
    const details = {
      phone: "11999990000",
      location: "São Paulo, SP",
      years: 1,
      salaryDesired: 3000,
      acceptsPj: true,
      compensationDisclosure: "prefer_not_to_say",
      confirmation: true,
    };
    expect(
      (await endpoint({ ...details, confirmation: false })).statusCode,
    ).toBe(400);
    expect((await endpoint({ ...details, phone: "123" })).statusCode).toBe(400);
    expect((await endpoint(details)).statusCode).toBe(200);
    const after = (await database.readWorkspace(workspaceId))!;
    expect(after.profile.salaryDesired).toBe(3000);
    expect(after.profile.years).toBe(1);
    expect(
      (await apiRequest("GET", "/api/workspace")).json().infrastructure
        .candidateDetailsRequired,
    ).toBe(false);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/candidate-details",
          headers: { origin: "http://127.0.0.1:5173", "x-orbita-request": "1" },
          payload: details,
        })
      ).statusCode,
    ).toBe(401);
  });
  const apiRequest = (
    method: "GET" | "POST" | "DELETE" | "PUT",
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "x-orbita-request": "1",
      },
    });
  const authorize = async (id: string) => {
    const preview = (
      await apiRequest("GET", `/api/applications/${id}/readiness`)
    ).json();
    expect(preview.ready, JSON.stringify(preview)).toBe(true);
    return apiRequest("POST", `/api/applications/${id}/send`, {
      confirmation: true,
      resumeId: preview.resumeId,
      destinationUrl: preview.destinationUrl,
      method: preview.method,
    });
  };
  it("autoriza só a candidatura revisada e envia com a rotina pausada sem liberar as demais", async () => {
    const send = sender();
    const [chosen, other] = await prepare([job("1201"), job("1202")], false);
    await database.mutateWorkspace(workspaceId, (w) => {
      w.routine.enabled = false;
      w.routine.mode = "approval";
    });
    const before = (await database.readWorkspace(workspaceId))!.routine;
    const authorized = await authorize(chosen);
    expect(authorized.statusCode).toBe(200);
    const again = await authorize(chosen);
    expect(again.statusCode).toBe(200);
    expect(await database.store.pendingSingleSubmissionWorkspaceIds()).toEqual([
      { id: workspaceId },
    ]);
    expect((await database.store.submissionState(workspaceId))?.next?.id).toBe(
      chosen,
    );
    await operations.processAutomaticApplications(workspaceId);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.routine).toEqual(before);
    expect(w.applications.find((a) => a.id === chosen)?.status).toBe("Enviada");
    expect(w.applications.find((a) => a.id === chosen)?.mode).toBe("single");
    expect(w.applications.find((a) => a.id === other)?.status).toBe(
      "Requer ação manual",
    );
    expect(send).toHaveBeenCalledOnce();
    expect(await database.store.pendingSingleSubmissionWorkspaceIds()).toEqual(
      [],
    );
    expect((await authorizeAfterAttempt(chosen)).statusCode).toBe(400);
    await operations.processAutomaticApplications(workspaceId);
    expect(send).toHaveBeenCalledOnce();
  });
  const authorizeAfterAttempt = async (id: string) =>
    apiRequest("POST", `/api/applications/${id}/send`, {
      confirmation: true,
      resumeId: resume.id,
      destinationUrl: job("1201").url,
      method: "webhook",
    });
  it("exige confirmação e recusa currículo ou destino divergente da revisão", async () => {
    const send = sender();
    const [id] = await prepare([job("1203")], false);
    const payload = {
      confirmation: true,
      resumeId: resume.id,
      destinationUrl: job("1203").url,
      method: "webhook",
    };
    expect(
      (
        await apiRequest("POST", `/api/applications/${id}/send`, {
          ...payload,
          confirmation: false,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await apiRequest("POST", `/api/applications/${id}/send`, {
          ...payload,
          destinationUrl: "https://other.example.test/job",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await apiRequest("POST", `/api/applications/${id}/send`, {
          ...payload,
          resumeId: "another-resume",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await database.readWorkspace(workspaceId))!.applications[0]
        .singleSubmission,
    ).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
  it("duas entregas concorrentes da autorização individual produzem uma única tentativa", async () => {
    const send = sender();
    const [id] = await prepare([job("1207")], false);
    await database.mutateWorkspace(workspaceId, (w) => {
      w.routine.enabled = false;
    });
    expect((await authorize(id)).statusCode).toBe(200);
    const deliveries = await Promise.allSettled([
      operations.automaticSend(workspaceId, id),
      operations.automaticSend(workspaceId, id),
    ]);
    expect(
      deliveries.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(send).toHaveBeenCalledOnce();
    expect(
      (await apiRequest("DELETE", `/api/applications/${id}/send`)).statusCode,
    ).toBe(400);
  });
  it("a autorização individual não permite ultrapassar a cota consumida antes do processamento", async () => {
    const send = sender();
    const [id, previous] = await prepare([job("1208"), job("1209")], false);
    expect((await authorize(id)).statusCode).toBe(200);
    await database.mutateWorkspace(workspaceId, (w) => {
      const other = w.applications.find((a) => a.id === previous)!;
      other.status = "Resultado desconhecido";
      other.history.push({
        at: new Date().toISOString(),
        actor: "Sistema",
        message: "Envio iniciado. Resultado não confirmado.",
      });
    });
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow(
      /limite/i,
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("uma segunda conta não pode revisar ou autorizar a candidatura de outra pessoa", async () => {
    const [id] = await prepare([job("1210")], false);
    const account = await apiRequest("POST", "/api/auth/register", {
      name: "Outra pessoa",
      email: "other-sending@example.test",
      password: "Other-password-123",
    });
    expect(account.statusCode).toBe(200);
    const otherCookie = String(account.headers["set-cookie"]).split(";")[0];
    const result = await app.inject({
      method: "GET",
      url: `/api/applications/${id}/readiness`,
      headers: { cookie: otherCookie },
    });
    expect(result.statusCode).toBe(400);
    expect(result.json()).not.toHaveProperty("resumeName");
    const sent = await app.inject({
      method: "POST",
      url: `/api/applications/${id}/send`,
      headers: {
        cookie: otherCookie,
        origin: "http://127.0.0.1:5173",
        "x-orbita-request": "1",
      },
      payload: {
        confirmation: true,
        resumeId: resume.id,
        destinationUrl: job("1210").url,
        method: "webhook",
      },
    });
    expect(sent.statusCode).toBe(400);
    expect(
      (await database.readWorkspace(workspaceId))!.applications[0]
        .singleSubmission,
    ).toBeUndefined();
  });
  it("cancelamento impede a fila automática de recuperar o envio individual", async () => {
    const send = sender();
    const [id] = await prepare([job("1204")], false);
    expect((await authorize(id)).statusCode).toBe(200);
    expect(
      (await apiRequest("DELETE", `/api/applications/${id}/send`)).statusCode,
    ).toBe(200);
    await database.mutateWorkspace(workspaceId, (w) => {
      expect(operations.queuePreparedApplications(w, [])).toBe(0);
    });
    await operations.processAutomaticApplications(workspaceId);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await database.readWorkspace(workspaceId))!.applications[0].status,
    ).toBe("Requer ação manual");
  });
  it("revalida o destino e a autorização antes de transmitir dados", async () => {
    const send = sender();
    const [id] = await prepare([job("1205")], false);
    expect((await authorize(id)).statusCode).toBe(200);
    await database.mutateWorkspace(workspaceId, (w) => {
      w.jobs[0].url = job("1299").url;
    });
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow(
      "destino de envio mudou",
    );
    await database.mutateWorkspace(workspaceId, (w) => {
      w.applications[0].singleSubmission!.expiresAt = new Date(
        Date.now() - 1,
      ).toISOString();
    });
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow(
      "expirou",
    );
    await operations.processAutomaticApplications(workspaceId);
    expect(
      (await database.readWorkspace(workspaceId))!.applications[0].status,
    ).toBe("Requer ação manual");
    expect(send).not.toHaveBeenCalled();
  });
  it("expõe bloqueios de integração e perfil sem registrar autorização", async () => {
    const [id] = await prepare([job("1206")], false);
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    await database.mutateWorkspace(workspaceId, (w) => {
      w.profile.confirmed = false;
    });
    const preview = (
      await apiRequest("GET", `/api/applications/${id}/readiness`)
    ).json();
    expect(preview.ready).toBe(false);
    expect(preview.blockers.join(" ")).toMatch(/Confirme seus dados/);
    expect(preview.blockers.join(" ")).toMatch(/destino verificado/);
    expect((await authorizeAfterAttempt(id)).statusCode).toBe(400);
    expect(
      (await app.inject(`/api/applications/${id}/readiness`)).statusCode,
    ).toBe(401);
  });
  it("prioriza API configurada sobre navegador e envia arquivo original e chave idempotente", async () => {
    vi.mocked(native.connectedPortals).mockResolvedValue(["gupy"]);
    const browser = vi.spyOn(native, "sendNativeApplication");
    const send = sender();
    const [id] = await prepare([job("101")]);
    const result = await operations.automaticSend(workspaceId, id);
    expect(result.status).toBe("Enviada");
    expect(browser).not.toHaveBeenCalled();
    const request = send.mock.calls[0];
    const body = JSON.parse(String(request[1]?.body));
    expect(Buffer.from(body.resume.file.data, "base64")).toEqual(bytes);
    expect(body.resume.file.mimeType).toContain("wordprocessingml");
    expect(
      (request[1]?.headers as Record<string, string>)["Idempotency-Key"],
    ).toBe(id);
    expect(body).not.toHaveProperty("delivery");
  });
  it("também transmite o PDF/DOCX original a uma fonte autorizada por empresa", async () => {
    const send = sender();
    await database.mutateWorkspace(workspaceId, (w) => {
      w.sources = [
        {
          id: "company",
          type: "authorized",
          company: "Empresa",
          board: "sender",
          enabled: true,
          discovery: false,
          application: true,
          status: "",
        },
      ];
    });
    const [id] = await prepare([
      { ...job("102"), url: "https://empresa.example.test/jobs/102" },
    ]);
    expect((await operations.automaticSend(workspaceId, id)).status).toBe(
      "Enviada",
    );
    const body = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(body.portal).toBeNull();
    expect(Buffer.from(body.resume.file.data, "base64")).toEqual(bytes);
  });
  it("uma vaga sem envio disponível na frente da fila não impede uma candidatura elegível", async () => {
    const send = sender();
    const [manual, automatic] = await prepare([
      job("103", "infojobs"),
      job("104"),
    ]);
    await operations.processAutomaticApplications(workspaceId);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.applications.find((a) => a.id === manual)?.status).toBe(
      "Requer ação manual",
    );
    expect(w.applications.find((a) => a.id === automatic)?.status).toBe(
      "Enviada",
    );
    expect(send).toHaveBeenCalledOnce();
  });
  it("preparações sem integração não consomem a cota diária da busca automática", async () => {
    const portal = await import("../server/portal-discovery");
    await prepare([job("105", "infojobs")]);
    vi.spyOn(portal, "discoverPortal").mockImplementation(async (source) => ({
      jobs: source.board === "gupy" ? [job("106")] : [],
      checkedAt: new Date().toISOString(),
      cached: false,
      method: "controlled-test",
    }));
    await operations.discover(workspaceId);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.applications.find((a) => a.jobId === "106")?.status).toBe(
      "Aguardando aprovação",
    );
  });
  it("arquivo ausente é recusado antes de registrar ou transmitir uma tentativa", async () => {
    const send = sender();
    await database.mutateWorkspace(workspaceId, (w) => {
      w.resumes[0].id = "missing-original";
      delete w.resumes[0].storedFile;
    });
    const [id] = await prepare([job("107")]);
    await expect(operations.automaticSend(workspaceId, id)).rejects.toThrow(
      "arquivo original",
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      (await database.readWorkspace(workspaceId))!.applications[0].status,
    ).toBe("Aguardando aprovação");
  });
  it("usa o currículo confirmado do portal quando o arquivo antigo não está disponível", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    vi.mocked(native.connectedPortals).mockResolvedValue(["gupy"]);
    vi.spyOn(native, "readyPortals").mockResolvedValue(["gupy"]);
    const browser = vi
      .spyOn(native, "sendNativeApplication")
      .mockResolvedValue({
        status: "sent",
        receipt: "fixture-portal-receipt",
        message: "Confirmada pelo portal",
      });
    await database.mutateWorkspace(workspaceId, (w) => {
      w.resumes[0].id = "missing-original";
      delete w.resumes[0].storedFile;
    });
    const sourceJob = job("117");
    sourceJob.resolution = {
      state: "partial",
      checkedAt: new Date().toISOString(),
      retryAt: new Date(Date.now() + 3600000).toISOString(),
      complete: false,
      consulted: [
        {
          source: "controlled-catalog",
          outcome: "Nenhum destino independente neste cenário controlado.",
          count: 0,
        },
      ],
      matches: [],
      message:
        "Busca cruzada controlada concluída para o cenário de currículo do portal.",
    };
    const [id] = await prepare([sourceJob]);
    expect((await operations.automaticSend(workspaceId, id)).status).toBe(
      "Enviada",
    );
    expect(browser).toHaveBeenCalledOnce();
    expect(browser.mock.calls[0][3].resume.file).toBeUndefined();
  });
  it("ativação automática recupera preparações locais e preserva tentativas que exigem intervenção", async () => {
    const [fresh, attempted] = await prepare([job("108"), job("109")], false);
    await database.mutateWorkspace(workspaceId, (w) =>
      w.applications[1].history.push({
        at: new Date(Date.now() - 86400000).toISOString(),
        actor: "Sistema",
        message: "Envio iniciado. Pergunta adicional do portal.",
      }),
    );
    const result = await app.inject({
      method: "PUT",
      url: "/api/routine",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "x-orbita-request": "1",
      },
      payload: {
        enabled: true,
        mode: "automatic",
        time: "08:00",
        minScore: 0,
        dailyLimit: 1,
      },
    });
    expect(result.statusCode).toBe(200);
    const w = (await database.readWorkspace(workspaceId))!;
    expect(w.applications.find((a) => a.id === fresh)?.status).toBe(
      "Aguardando aprovação",
    );
    expect(w.applications.find((a) => a.id === attempted)?.status).toBe(
      "Requer ação manual",
    );
  });
  it("resultado desconhecido ocupa a cota e nunca é reenviado automaticamente", async () => {
    const send = sender();
    const [unknown, pending] = await prepare([job("110"), job("111")]);
    await database.mutateWorkspace(workspaceId, (w) => {
      const a = w.applications.find((a) => a.id === unknown)!;
      a.status = "Resultado desconhecido";
      a.history.push({
        at: new Date().toISOString(),
        actor: "Sistema",
        message: "Envio iniciado. Sem resposta.",
      });
    });
    await operations.processAutomaticApplications(workspaceId);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await database.readWorkspace(workspaceId))!.applications.find(
        (a) => a.id === pending,
      )?.status,
    ).toBe("Aguardando aprovação");
  });
  it("expõe bloqueio por site e não promete envio quando nenhum provedor está configurado", async () => {
    vi.stubEnv("APPLICATION_WEBHOOK_AUTHORIZED", "false");
    const sites = (
      await app.inject({ url: "/api/automation/sites", headers: { cookie } })
    ).json();
    expect(
      sites.every(
        (site: any) =>
          !site.automatic &&
          site.applicationBlocker ===
            (site.id === "linkedin"
              ? "integration_missing"
              : "external_login_only"),
      ),
    ).toBe(true);
    expect(
      (await app.inject({ url: "/api/workspace", headers: { cookie } })).json()
        .infrastructure.automatic,
    ).toBe(false);
  });
  it("não recebe credenciais dos portais no fluxo de login oficial, mesmo com navegador habilitado", async () => {
    vi.stubEnv("PORTAL_BROWSER_AUTHORIZED", "gupy,infojobs,glassdoor");
    const open = vi
      .spyOn(native, "startPortalLogin")
      .mockRejectedValue(new Error("Unexpected remote login"));
    const action = vi
      .spyOn(native, "portalLoginAction")
      .mockRejectedValue(new Error("Unexpected remote action"));
    const confirm = vi
      .spyOn(native, "finishPortalLogin")
      .mockRejectedValue(new Error("Unexpected remote confirmation"));
    for (const portal of ["gupy", "infojobs", "glassdoor"]) {
      for (const operation of ["open", "action", "confirm"]) {
        const response = await app.inject({
          method: "POST",
          url: `/api/connections/${portal}/${operation}`,
          headers: {
            cookie,
            origin: "http://127.0.0.1:5173",
            "x-orbita-request": "1",
          },
          payload:
            operation === "action"
              ? {
                  type: "submit",
                  fields: [{ index: 0, value: "synthetic@example.test" }],
                }
              : {},
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toContain("site oficial");
      }
    }
    expect(open).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});
