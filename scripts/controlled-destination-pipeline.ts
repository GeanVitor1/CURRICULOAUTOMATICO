import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { store, mutateWorkspace, readWorkspace, closeDb } from "../server/db";
import { createWorkspace } from "../server/workspace";
import { connectors } from "../server/connectors";
import { archiveResumeFile } from "../server/resume-storage";
import { resumePdf } from "../tests/pdf-fixture";
import {
  enqueueDiscovery,
  processNextDiscoveryTask,
} from "../server/discovery-queue";
import { processResolutionTask } from "../server/resolution-queue";
import { automaticSend } from "../server/operations";
import { confirmedAutomaticApplication } from "../server/automation-trace";
import { applyCandidateDetails } from "../server/candidate-details";
import { companyOpportunities } from "../server/opportunity-catalog";
import { eq } from "../server/storage-types";
import type { Job, Source } from "../shared/types";

const origin = process.env.CONTROLLED_ORIGIN;
if (
  !origin?.startsWith("https://") ||
  !new URL(origin).hostname.endsWith(".vercel.run")
)
  throw new Error("Exige a URL HTTPS do Sandbox QA dedicado.");
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_PROVIDER === "firestore"
)
  throw new Error("Exige banco temporário e ambiente de teste isolado.");
const secret = randomUUID(),
  userId = randomUUID(),
  secondUser = randomUUID(),
  resumeId = randomUUID();
const listingUrl = `${origin}/listing/${secret}`,
  applyUrl = `${origin}/apply/${secret}`;
const description =
  "Desenvolvedor React júnior para criar aplicações web com TypeScript, Git e APIs REST. A equipe mantém componentes acessíveis, escreve testes automatizados, revisa alterações, documenta funcionalidades e acompanha requisitos com profissionais de produto. Ensino médio completo e projetos práticos são aceitos nesta oportunidade de teste controlado.";
const job: Job = {
  id: randomUUID(),
  title: "Desenvolvedor React",
  company: "EmpreGatos QA Controlado",
  source: "Fonte QA controlada",
  url: listingUrl,
  description,
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
  saved: false,
  discarded: false,
  origins: [{ source: "controlled", url: listingUrl, id: "controlled:1" }],
  match: {
    score: 0,
    strengths: [],
    gaps: [],
    blockers: [],
    matchedSkills: [],
    missingSkills: [],
    radar: false,
    explanation: "",
  },
  companyDomain: origin,
  applicationUrls: [{ url: applyUrl, source: "Feed público QA controlado" }],
  demo: false,
};
const original = resumePdf();
const targetCount = Math.max(1, Math.min(5,Number(process.env.CONTROLLED_COUNT)||1));
const jobs = Array.from({length:targetCount+1},(_,index)=>({...structuredClone(job),
  id:randomUUID(),company:`${job.company} ${index}`,url:`${listingUrl}/${index}`,
  origins:[{source:"controlled",url:`${listingUrl}/${index}`,id:`controlled:${index}`}],
  applicationUrls:[{url:`${applyUrl}/${index}`,source:"Feed público QA controlado"}],
}));
const native = process.env.CONTROLLED_ADAPTER === "company_wp_jobs";
if(native)for(const item of jobs)item.destinations=[{
  id:randomUUID(),url:item.applicationUrls[0].url,publicationUrl:item.url,platform:"company",company:item.company,
  state:"verified",formFound:true,method:"browser",confidence:100,
  verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),evidence:["Formulário WP Jobs Board verificado."],
}];
const receiverCounts:Record<string,number>={};
let receipts = 0,
  receivedCorrectFile = false,
  receivedCorrectCandidate = false;
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === `/feed/${secret}`) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(jobs));
    return;
  }
  const candidate=jobs.find(item=>new URL(item.url).pathname===req.url || new URL(item.applicationUrls[0].url).pathname===req.url);
  if (!candidate) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === new URL(candidate.applicationUrls[0].url).pathname) {
    const parts: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > 100000) {
        res.writeHead(413);
        res.end();
        return;
      }
      parts.push(Buffer.from(part));
    }
    const bytes = Buffer.concat(parts);
    receivedCorrectFile = bytes.includes(original);
    receivedCorrectCandidate = bytes.includes(
      Buffer.from("pipeline-qa@example.test"),
    );
    if (!receivedCorrectFile || !receivedCorrectCandidate) {
      res.writeHead(422);
      res.end("Dados incorretos.");
      return;
    }
    receipts++;
    receiverCounts[candidate.id]=(receiverCounts[candidate.id]||0)+1;
    res.end(
      "<div data-application-confirmation>Your application has been received.</div>",
    );
    return;
  }
  const structured = {
    "@type": "JobPosting",
    title: candidate.title,
    description,
    hiringOrganization: { name: candidate.company, sameAs: origin },
    jobLocation: { address: { addressCountry: "Brasil" } },
    jobLocationType: "TELECOMMUTE",
  };
  let form =
    req.url === new URL(candidate.applicationUrls[0].url).pathname
      ? `${candidate===jobs.at(-1)?'<p>Verify you are human</p>':''}<form data-application-form action="${candidate.applicationUrls[0].url}" method="POST" enctype="multipart/form-data"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Resume<input name="resume" type="file" required></label><button>Submit application</button></form>`
      : `<a href="${candidate.applicationUrls[0].url}">Apply</a>`;
  if(native && req.url===new URL(candidate.applicationUrls[0].url).pathname)
    form=`<div class="wpjb-apply-form"><form method="post" enctype="multipart/form-data">
    <input name="candidate-name"><input name="candidate-email" type="email"><input name="candidate-cv" type="file">
    <textarea name="candidate-message"></textarea><input type="hidden" name="action" value="apply-for-job">
    ${candidate===jobs.at(-1)?'<div class="h-captcha" data-sitekey="controlled-block"></div>':''}<button>Enviar</button></form></div>`;
  res.end(
    `<script type="application/ld+json">${JSON.stringify(structured)}</script><h1>${candidate.title}</h1><p>${candidate.company}</p><p>${description}</p>${form}`,
  );
});
await new Promise<void>((resolve) => server.listen(3005, "0.0.0.0", resolve));
try {
  for (const [id, email] of [
    [userId, "pipeline-qa@example.test"],
    [secondUser, "isolated-qa@example.test"],
  ]) {
    await store.insert("users", { id, email, name: "Pessoa QA Fictícia" });
    const workspace = createWorkspace("Pessoa QA Fictícia", email);
    if (id === userId) {
      applyCandidateDetails(workspace, {
        phone: "11999990000",
        location: "São Paulo, SP",
        years: 0,
        salaryDesired: 3000,
        acceptsPj: true,
        compensationDisclosure: "prefer_not_to_say",
        confirmation: true,
      });
      workspace.profile = {
        ...workspace.profile,
        headline: job.title,
        skills: job.skills,
        years: 0,
        level: "Júnior",
        education: "Ensino médio completo",
        confirmed: true,
      };
      workspace.filters.titles = [job.title];
      workspace.routine = {
        ...workspace.routine,
        enabled: true,
        mode: "automatic",
        minScore: 0,
        dailyLimit: 5,
      };
      workspace.sources = [
        {
          id: "qa-feed",
          type: "controlled" as Source["type"],
          company: job.company,
          board: `qa-${secret}`,
          enabled: true,
          discovery: true,
          application: false,
          status: "Fonte controlada",
        },
      ];
      workspace.resumes = [
        {
          id: resumeId,
          name: "qa.pdf",
          uploadedAt: new Date().toISOString(),
          text: "React TypeScript Git. Ensino médio completo.",
          skills: job.skills,
          approved: true,
          analysis: "Currículo fictício QA",
          targetsConfirmed: true,
          targetTitles: [job.title],
          storedFile: archiveResumeFile(original, ".pdf"),
        },
      ];
    }
    await store.insert("workspaces", {
      id: `${id}:live`,
      userId: id,
      data: workspace,
    });
    await mutateWorkspace(`${id}:live`, () => {});
  }
  connectors.controlled = {
    discovery: true,
    application: false,
    discover: async () => {
      const response = await fetch(`${origin}/feed/${secret}`);
      if (!response.ok) throw new Error("Feed QA indisponível");
      return (await response.json()) as Job[];
    },
  };
  const task = await enqueueDiscovery(`${userId}:live`);
  await processNextDiscoveryTask(task.id);
  const queued = await store.select("resolutionTasks", {
    where: eq("workspaceId", `${userId}:live`),
  });
  if (!queued.length)
    throw new Error("A descoberta não criou a resolução de destino.");
  for(let pass=0;pass<10;pass++) {
    const [task]=await store.select("resolutionTasks",{where:eq("status","queued"),limit:1});
    if(!task)break;
    await processResolutionTask(task.id);
  }
  const final = (await readWorkspace(`${userId}:live`))!;
  const application = final.applications[0];
  if (
    application?.status !== "Enviada" ||
    !application.receipt ||
    receipts !== targetCount ||
    final.applications.filter(confirmedAutomaticApplication).length !== targetCount ||
    !receivedCorrectFile ||
    !receivedCorrectCandidate
  )
    throw new Error(
      `Não comprovado: ${application?.status || "sem candidatura"}; ${application?.history.at(-1)?.message || "sem histórico"}; ${JSON.stringify(final.jobs[0]?.resolution)}`,
    );
  let duplicateRejected = false;
  try {
    await automaticSend(`${userId}:live`, application.id);
  } catch {
    duplicateRejected = true;
  }
  const isolated = (await readWorkspace(`${secondUser}:live`))!;
  const publicRecords = await companyOpportunities(job.company);
  const report = {
    at: new Date().toISOString(),
    environment:
      "Vercel Sandbox Linux real; banco PGlite temporário; filas persistidas processadas pelos consumidores do projeto",
    candidate: "Perfil e PDF fictícios QA",
    adapter:native?"company_wp_jobs":"ats_browser",
    discovery: final.runs[0].status,
    resolution: final.jobs[0].resolution?.state,
    destinations: final.jobs[0].destinations?.length,
    databaseStatus: application.status,
    receipt: application.receipt,
    receiverCount: receipts,
    expectedCount:targetCount,
    distinctReceivers:Object.keys(receiverCounts).length,
    noDuplicateReceivers:Object.values(receiverCounts).every(count=>count===1),
    blockedReceiverUntouched:!receiverCounts[jobs.at(-1)!.id],
    confirmedApplications:final.applications.filter(confirmedAutomaticApplication).map(a=>({id:a.id,execution:a.execution,attempts:a.attempts,receipt:a.receipt})),
    blockedDestinations:final.jobs.filter(j=>j.destinations?.some(d=>d.state==="blocked")).length,
    preflightBlocked:final.applications.filter(a=>a.status==="Requer ação manual"&&!a.receipt&&!a.history.some(e=>e.message.startsWith("Envio iniciado."))).length,
    receivedCorrectFile,
    receivedCorrectCandidate,
    duplicateRejected,
    isolated:
      isolated.applications.length === 0 &&
      isolated.resumes.length === 0 &&
      publicRecords.every(
        (record) => !record.application && record.match.score === 0,
      ),
    actualVercelQueueTransport: false,
    realEmployerSubmissions: 0,
  };
  if (!report.duplicateRejected || !report.isolated || receipts !== targetCount || !report.noDuplicateReceivers || !report.blockedReceiverUntouched)
    throw new Error("Falha na idempotência ou isolamento.");
  await writeFile(
    "/vercel/sandbox/controlled-pipeline-result.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
}
