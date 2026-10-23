import { expect, test } from "@playwright/test";
import { createWorkspace } from "../server/workspace";
import type { Job } from "../shared/types";

test("an assisted candidate can review the draft and open the real application, with confirmation required for a sent status", async ({
  page,
}) => {
  const w = createWorkspace("Pessoa fictícia", "assisted@example.test");
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: true, dismissed: true, active: false };
  w.resumes = [
    {
      id: "resume",
      name: "Currículo fictício.pdf",
      text: "C# e .NET",
      skills: ["C#", ".NET"],
      approved: true,
      uploadedAt: new Date().toISOString(),
      analysis: "",
      originalFileAvailable: false,
    },
  ];
  w.jobs = [
    {
      id: "job",
      title: "Desenvolvedor .NET",
      company: "Empresa fictícia",
      url: "https://empresa.gupy.io/jobs/123",
      source: "Gupy",
      description: "Desenvolvimento C# e .NET.",
      location: "Brasil",
      modality: "Remoto",
      contract: "CLT",
      level: "Júnior",
      skills: ["C#", ".NET"],
      requiredSkills: [],
      requiredYears: null,
      currency: "",
      salaryMin: null,
      salaryMax: null,
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      origins: [],
      demo: false,
      saved: false,
      discarded: false,
      match: {
        score: 90,
        strengths: [],
        gaps: [],
        blockers: [],
        matchedSkills: ["C#"],
        missingSkills: [],
        radar: false,
        explanation: "Competências citadas",
      },
    } as Job,
  ];
  w.applications = [
    {
      id: "application",
      jobId: "job",
      resumeId: "resume",
      status: "Requer ação manual",
      mode: "assisted",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      receipt: null,
      note: "",
      draft:
        "Tenho interesse na vaga de Desenvolvedor .NET. C# e .NET constam no meu currículo.",
      history: [],
    },
  ];
  let updates = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          id: "synthetic-user",
          name: w.profile.name,
          email: w.profile.email,
        },
      });
    if (path === "/api/workspace") return route.fulfill({ json: w });
    if (path.endsWith("/readiness"))
      return route.fulfill({
        json: {
          ready: false,
          blockers: [
            "Reenvie o arquivo original do currículo para permitir o envio.",
          ],
          resumeId: "resume",
          resumeName: "Currículo fictício.pdf",
          destinationUrl: null,
          method: null,
        },
      });
    if (
      path === "/api/applications/application" &&
      route.request().method() === "PATCH"
    )
      updates++;
    return route.fulfill({ json: {} });
  });
  await page.goto("/app#candidaturas");
  await page.getByRole("row").filter({ hasText: "Desenvolvedor .NET" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Conclua sua candidatura" }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Apresentação para copiar e enviar"),
  ).toHaveValue(w.applications[0].draft!);
  await expect(
    dialog.getByRole("link", { name: "Abrir processo oficial" }),
  ).toHaveAttribute("href", w.jobs[0].url);
  await expect(
    dialog.getByRole("link", { name: "Baixar cópia do texto em PDF" }),
  ).toHaveAttribute("href", "/api/resumes/resume/download?demo=false");
  await expect(
    dialog.getByText(/O arquivo original deste upload antigo/),
  ).toBeVisible();
  await dialog.getByLabel("Próxima etapa").selectOption("Enviada");
  await expect(
    dialog.getByLabel(
      "Confirmo que concluí o envio no processo oficial da empresa.",
    ),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Salvar atualização" }).click();
  expect(updates).toBe(0);
});
