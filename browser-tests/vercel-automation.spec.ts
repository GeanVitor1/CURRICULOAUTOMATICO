import { expect, test } from "@playwright/test";
import { createWorkspace } from "../server/workspace";

test("preferences start a search and explain the daily schedule without promising submissions", async ({
  page,
}) => {
  const w = createWorkspace("Pessoa fictícia", "automation@example.test");
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: true, dismissed: true, active: false };
  w.infrastructure = {
    database: "PostgreSQL",
    queue: "Vercel Queues + PostgreSQL",
    worker: true,
    automatic: false,
    scheduleWindow: "Todos os dias, entre 8h e 9h (horário de Brasília).",
  };
  w.resumes = [
    {
      id: "fictitious-resume",
      name: "Currículo fictício.pdf",
      uploadedAt: new Date().toISOString(),
      skills: ["C#"],
      text: "Objetivo: Desenvolvedor .NET",
      approved: false,
      analysis: "",
    },
  ];
  w.interview = {
    step: 5,
    completed: false,
    answers: {
      resumeId: w.resumes[0].id,
      titles: ["Desenvolvedor .NET"],
      modalities: ["Remoto"],
      city: "",
      sameCityOnly: false,
      salaryMin: 0,
      salaryMax: 0,
      includeUnknownSalary: true,
      ageDays: 365,
      contracts: [],
      sites: ["gupy"],
      dailyLimit: 5,
    },
  };
  let starts = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          id: "fictitious-user",
          name: w.profile.name,
          email: w.profile.email,
        },
      });
    if (path === "/api/workspace") return route.fulfill({ json: w });
    if (path === "/api/automation/sites")
      return route.fulfill({
        json: [
          {
            id: "gupy",
            name: "Gupy",
            discovery: true,
            automatic: false,
            connected: false,
          },
        ],
      });
    if (path === "/api/billing")
      return route.fulfill({
        json: { name: "Grátis", dailyLimit: 5, remainingToday: 5 },
      });
    if (path === "/api/interview") {
      const body = route.request().postDataJSON();
      expect(body.start).toBe("prepare");
      expect(body.complete).toBe(true);
      starts++;
      w.interview!.completed = true;
      w.resumes[0].approved = true;
      w.profile.confirmed = true;
      w.routine.enabled = true;
      w.routine.mode = "approval";
      w.routine.nextRun = new Date(Date.now() + 86400000).toISOString();
      w.runs = [
        {
          id: "queued-search",
          at: new Date().toISOString(),
          status: "queued",
          discovered: 0,
          processed: 0,
          errors: [],
          message: "Busca na fila.",
        },
      ];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/app#preferencias");
  await expect(page.getByText(/A primeira busca começa agora/)).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar busca e preparação", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sua automação", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Busca diária ativa · envio pelo site",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(w.infrastructure.scheduleWindow!, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscando…", exact: true }),
  ).toBeDisabled();
  expect(starts).toBe(1);
  expect(errors).toEqual([]);
});
