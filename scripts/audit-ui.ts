import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { createWorkspace } from "../server/workspace";
import type { Workspace } from "../shared/types";

// Dados controlados no navegador; não cria contas nem usa portais reais.
const w: Workspace = createWorkspace("Pessoa QA", "qa@example.test");
w.routine.enabled = true;
w.routine.mode = "automatic";
w.routine.nextRun = new Date(Date.now() + 86400000).toISOString();
w.resumes = [
  {
    id: "new-resume",
    name: "novo.docx",
    text: "Ensino médio e atendimento ao público.",
    analysis: "",
    skills: [],
    approved: false,
    uploadedAt: new Date().toISOString(),
  },
];
w.interview = {
  step: 5,
  completed: true,
  answers: {
    resumeId: "old-resume",
    titles: ["Auxiliar administrativo"],
    modalities: ["Remoto"],
    city: "",
    sameCityOnly: true,
    salaryMin: 0,
    salaryMax: 0,
    includeUnknownSalary: true,
    ageDays: 365,
    contracts: [],
    sites: ["gupy"],
    dailyLimit: 5,
  },
};
w.intelligence = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  enabled: true,
  keyConfigured: true,
  consent: true,
  geminiConfigured: true,
  privacyUrl: "https://example.test/privacy",
};
const findings: { id: string; fixed: boolean; evidence: unknown }[] = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 375, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      return route.abort();
    if (url.pathname === "/api/auth/me")
      return route.fulfill({
        json: { id: "audit-user", name: "Pessoa QA", email: "qa@example.test" },
      });
    if (url.pathname === "/api/workspace") return route.fulfill({ json: w });
    if (url.pathname === "/api/automation/sites")
      return route.fulfill({
        json: [
          {
            id: "gupy",
            name: "Gupy",
            automatic: false,
            discovery: true,
            connectable: false,
          },
        ],
      });
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 404,
        json: { error: "API não utilizada nesta auditoria visual" },
      });
    return route.continue();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/app#automacao");
  await page
    .getByRole("heading", { name: "Vamos conhecer suas preferências" })
    .waitFor();
  const pause = await page
    .getByRole("button", { name: "Pausar", exact: true })
    .count();
  await page.screenshot({
    path: "artifacts/qa-fixed-automation-375.png",
    fullPage: true,
  });
  findings.push({
    id: "QA-04-UI",
    fixed: w.routine.enabled && pause === 1,
    evidence: { routineEnabled: w.routine.enabled, pauseButtons: pause },
  });
  await page.goto("http://127.0.0.1:5173/app#curriculo");
  await page
    .getByRole("heading", { name: "Seu currículo", exact: true })
    .waitFor();
  const consent = await page.getByRole("checkbox").count();
  await page.screenshot({
    path: "artifacts/qa-fixed-ai-resume-375.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/qa-fixed-ai-resume-1440.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:5173/app#configuracoes");
  await page
    .getByRole("heading", { name: "Minha conta", exact: true })
    .waitFor();
  findings.push({
    id: "QA-07",
    fixed: consent === 1 && (await page.getByRole("checkbox").count()) === 1,
    evidence: {
      enabled: w.intelligence.enabled,
      resumeConsentControls: consent,
      legacySettingsOpens: "Minha conta",
    },
  });
  await page.goto("http://127.0.0.1:5173/login");
  // A public auth form requires the controlled session to be unauthenticated.
  await context.route("**/api/auth/me?*", (route) =>
    route.fulfill({ status: 401, json: { error: "Sem sessão QA" } }),
  );
  await page.reload();
  await page.getByRole("heading", { name: "Bom ter você de volta." }).waitFor();
  await page.getByText("E-mail", { exact: true }).click();
  const focused = await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .evaluate((input) => document.activeElement === input);
  findings.push({
    id: "QA-08",
    fixed: focused,
    evidence: { clickOnEmailLabelFocusesInput: focused },
  });
  console.log(JSON.stringify({ findings, pageErrors: errors }, null, 2));
  await writeFile(
    "artifacts/qa-fixed-ui.json",
    JSON.stringify({ findings, pageErrors: errors }, null, 2) + "\n",
    "utf8",
  );
  if (errors.length || findings.some((finding) => !finding.fixed))
    process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
}
