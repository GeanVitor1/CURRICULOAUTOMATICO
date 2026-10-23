import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { zipSync, strToU8 } from "fflate";
import type { Job } from "../shared/types";
import { applyCandidateDetails } from "../server/candidate-details";

// This verification never loads the installation's private env or production database.
const directory = await mkdtemp(join(tmpdir(), "empregatos-single-qa-"));
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: join(directory, ".env"),
  NODE_ENV: "test",
  DATA_DIR: directory,
  DATABASE_PROVIDER: "",
  DATABASE_URL: "",
  REDIS_URL: "",
  VERCEL: "",
  GEMINI_API_KEY: "",
  ANTIGRAVITY_ENABLED: "false",
  STRIPE_SECRET_KEY: "",
  GOOGLE_CLIENT_ID: "",
  LINKEDIN_CLIENT_ID: "",
  PORTAL_CLOUD_ENABLED: "false",
  PORTAL_BROWSER_AUTHORIZED: "",
  ATS_BROWSER_AUTHORIZED: "",
  API_UPSTREAM_ORIGIN: "",
  ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  APPLICATION_WEBHOOK_AUTHORIZED: "true",
  APPLICATION_WEBHOOK_PORTALS: "gupy",
  APPLICATION_WEBHOOK_TOKEN: randomUUID(),
});
const original = Buffer.from(
  zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Objetivo: Desenvolvedor .NET. Competências C# .NET Git. Primeiro emprego. Ensino médio completo.</w:t></w:r></w:p></w:body></w:document>',
    ),
  }),
);
const received: {
  resume: { file: { data: string } };
  applicationId: string;
}[] = [];
const receiver = createServer(async (request, response) => {
  assert.equal(
    request.headers.authorization,
    `Bearer ${process.env.APPLICATION_WEBHOOK_TOKEN}`,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const payload = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(request.headers["idempotency-key"], payload.applicationId);
  received.push(payload);
  response.setHeader("Content-Type", "application/json");
  response.end(
    JSON.stringify({
      status: "sent",
      applicationId: payload.applicationId,
      receipt: "controlled-local-receipt",
    }),
  );
});
receiver.listen(0, "127.0.0.1");
await once(receiver, "listening");
const receiverAddress = receiver.address();
assert(receiverAddress && typeof receiverAddress !== "string");
process.env.APPLICATION_WEBHOOK_URL = `http://127.0.0.1:${receiverAddress.port}/applications`;
const database = await import("../server/db");
const { buildApp } = await import("../server/app");
const { archiveResumeFile } = await import("../server/resume-storage");
const { prepare, processAutomaticApplications } =
  await import("../server/operations");
const app = await buildApp();
const browser = await chromium.launch();
try {
  const origin = await app.listen({ port: 0, host: "127.0.0.1" });
  process.env.APP_ORIGIN = origin;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const registration = await context.request.post(
    `${origin}/api/auth/register`,
    {
      headers: { "x-orbita-request": "1", origin },
      data: {
        name: "Pessoa QA fictícia",
        email: `single-${randomUUID()}@example.test`,
        password: "Controlled-QA-12345",
      },
    },
  );
  assert.equal(registration.status(), 200);
  const workspaceId = `${(await registration.json()).id}:live`;
  const onboarding = await context.newPage();
  const onboardingErrors: string[] = [];
  onboarding.on("pageerror", (error) => onboardingErrors.push(error.message));
  await onboarding.goto(`${origin}/app#automacao`);
  await onboarding
    .getByRole("heading", { name: "Seus dados para candidaturas", exact: true })
    .waitFor();
  await onboarding
    .getByLabel("Cidade e estado onde você mora")
    .fill("São Paulo, SP");
  await onboarding.getByLabel("Telefone com DDD").fill("11999990000");
  await onboarding
    .getByLabel("Anos de experiência na área em que deseja trabalhar")
    .fill("1");
  await onboarding.getByLabel("Pretensão salarial por mês (R$)").fill("3500");
  await onboarding
    .getByLabel("Você aceita contratação PJ?", { exact: true })
    .selectOption("true");
  await onboarding
    .getByLabel("Remuneração atual ou última e benefícios", { exact: true })
    .selectOption("inform");
  await onboarding
    .getByLabel("Sua remuneração atual ou última + benefícios", { exact: true })
    .fill("R$ 2.000 + vale-alimentação (dado fictício)");
  await onboarding
    .getByLabel("Remuneração atual ou última e benefícios", { exact: true })
    .selectOption("prefer_not_to_say");
  assert.equal(
    await onboarding
      .getByLabel("Sua remuneração atual ou última + benefícios", {
        exact: true,
      })
      .count(),
    0,
  );
  await onboarding
    .getByRole("checkbox", {
      name: "Confirmo que estes dados estão corretos e podem ser usados nas minhas candidaturas.",
    })
    .check();
  await mkdir("artifacts", { recursive: true });
  await onboarding.screenshot({
    path: "artifacts/candidate-details-mobile.png",
    fullPage: true,
  });
  await onboarding.getByRole("button", { name: "Salvar e continuar" }).click();
  await onboarding.waitForURL("**/app#curriculo");
  const initial = (await database.readWorkspace(workspaceId))!;
  assert.equal(initial.profile.phone, "11999990000");
  assert.equal(initial.profile.years, 1);
  assert.equal(initial.profile.salaryDesired, 3500);
  assert.equal(initial.profile.acceptsPj, true);
  assert.equal(initial.profile.compensationDisclosure, "prefer_not_to_say");
  assert.equal(initial.profile.currentCompensation, undefined);
  assert.equal(initial.profile.confirmed, false);
  assert.equal(initial.routine.enabled, false);
  assert.equal(initial.resumes.length, 0);
  assert.deepEqual(onboardingErrors, []);
  await onboarding.reload();
  assert.equal(
    await onboarding
      .getByRole("heading", {
        name: "Seus dados para candidaturas",
        exact: true,
      })
      .count(),
    0,
  );
  await onboarding.close();
  let chosenId = "",
    otherId = "";
  await database.mutateWorkspace(workspaceId, (w) => {
    w.onboarding!.completed = true;
    w.guide = { step: 0, completed: true, active: false, dismissed: true };
    w.profile.confirmed = true;
    applyCandidateDetails(w, {
      phone: "11999990000",
      location: "São Paulo, SP",
      years: 2,
      salaryDesired: 3500,
      acceptsPj: true,
      compensationDisclosure: "prefer_not_to_say",
      confirmation: true,
    });
    w.profile.skills = ["C#", ".NET", "Git"];
    w.filters.titles = ["Desenvolvedor .NET"];
    w.routine.enabled = false;
    w.routine.mode = "approval";
    w.routine.minScore = 0;
    w.routine.dailyLimit = 1;
    w.resumes = [
      {
        id: randomUUID(),
        name: "Currículo QA fictício.docx",
        uploadedAt: new Date().toISOString(),
        text: "Desenvolvedor .NET C# Git",
        skills: ["C#", ".NET", "Git"],
        approved: true,
        analysis: "",
        targetsConfirmed: false,
        storedFile: archiveResumeFile(original, ".docx"),
      },
    ];
    w.sources = [
      {
        id: "gupy",
        type: "portal",
        board: "gupy",
        company: "Gupy",
        enabled: true,
        discovery: true,
        application: true,
        status: "QA controlado",
      },
    ];
    for (const number of [91001, 91002]) {
      const url = `https://empresa.gupy.io/jobs/${number}`;
      const job: Job = {
        id: randomUUID(),
        title: "Desenvolvedor .NET",
        company: "Empresa QA fictícia",
        source: "Gupy",
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
        origins: [{ source: "portal", url, id: `gupy:${number}` }],
        match: {} as Job["match"],
        demo: false,
      };
      w.jobs.push(job);
      const application = prepare(w, job.id);
      if (number === 91001) chosenId = application.id;
      else otherId = application.id;
    }
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/app#candidaturas`);
  await page
    .getByRole("row")
    .filter({ hasText: "Desenvolvedor .NET" })
    .last()
    .click();
  const review = page.getByRole("region", { name: "Revisão de envio" });
  const submit = review.getByRole("button", {
    name: "Autorizar envio desta candidatura",
  });
  await submit.waitFor();
  assert.equal(await submit.isDisabled(), true);
  await mkdir("artifacts", { recursive: true });
  await review.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/single-submission-review-mobile.png",
    fullPage: true,
  });
  await review.getByRole("checkbox").check();
  await submit.click();
  await review.getByRole("button", { name: "Cancelar este envio" }).waitFor();
  const authorized = (await database.readWorkspace(workspaceId))!;
  assert.equal(
    authorized.applications.find((a) => a.id === chosenId)!.status,
    "Aguardando aprovação",
  );
  assert.equal(authorized.routine.enabled, false);
  // Use the actual persistent worker consumer; no external portal is contacted.
  await processAutomaticApplications(workspaceId);
  await page
    .getByText("Recibo da integração: controlled-local-receipt", {
      exact: true,
    })
    .waitFor({ timeout: 15000 });
  await page
    .getByText("Recibo da integração: controlled-local-receipt", {
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  assert.equal(received.length, 1);
  assert.equal(received[0].applicationId, chosenId);
  assert.deepEqual(
    Buffer.from(received[0].resume.file.data, "base64"),
    original,
  );
  await processAutomaticApplications(workspaceId);
  const final = (await database.readWorkspace(workspaceId))!;
  assert.equal(received.length, 1);
  assert.equal(final.routine.enabled, false);
  assert.equal(
    final.applications.find((a) => a.id === otherId)!.status,
    "Requer ação manual",
  );
  assert.deepEqual(errors, []);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/single-submission-mobile.png",
    fullPage: true,
  });
  const result = {
    at: new Date().toISOString(),
    environment:
      "Browser → API → PGlite temporário → consumidor → receptor HTTP local controlado → recibo na interface",
    passed: true,
    originalFileMatched: true,
    received: received.length,
    otherApplicationsSent: 0,
    generalRoutineEnabled: final.routine.enabled,
    browserErrors: errors.length,
    realEmployerSubmissions: 0,
    candidateDetailsCollectedThroughBrowser: true,
  };
  await writeFile(
    "artifacts/single-submission-verification.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await app.close();
  await database.closeDb();
  receiver.closeAllConnections();
  await new Promise<void>((done) => receiver.close(() => done()));
  if (directory.startsWith(join(tmpdir(), "empregatos-single-qa-")))
    await rm(directory, { recursive: true, force: true });
}
