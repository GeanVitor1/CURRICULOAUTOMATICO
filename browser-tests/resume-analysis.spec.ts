import { expect, test } from "@playwright/test";
import { createWorkspace } from "../server/workspace";
import { parseResume } from "../server/engine";
import { buildResumeReview } from "../server/resume-review";
import { localResumeTargets, TARGETS_VERSION } from "../server/resume-targets";

test("detailed resume review, evidence, job suggestions and reanalysis work on desktop and mobile", async ({
  page,
}, testInfo) => {
  const text =
    "Objetivo: Atendente\nExperiência informal: atendimento ao público na loja da família.\nFormação: ensino médio completo.";
  const profile = parseResume(text);
  const w = createWorkspace("Pessoa fictícia", "qa@example.test");
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: true, dismissed: true, active: false };
  w.resumes = [
    {
      id: "synthetic-resume",
      name: "Currículo fictício.pdf",
      text,
      uploadedAt: "2026-10-14T12:00:00Z",
      approved: false,
      skills: profile.skills || [],
      analysis: "Análise fictícia de teste",
      suggestion: profile,
      review: buildResumeReview(text, profile),
      targets: localResumeTargets(text, profile),
      targetsVersion: TARGETS_VERSION,
    },
  ];
  let analyses = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          id: "synthetic-user",
          name: "Pessoa fictícia",
          email: "qa@example.test",
        },
      });
    if (path === "/api/workspace") return route.fulfill({ json: w });
    if (path.endsWith("/analyze")) {
      analyses++;
      w.resumes[0].review = buildResumeReview(text, profile, {
        method: "gemini",
        coaching: [
          {
            category: "experience",
            priority: "high",
            evidence: "atendimento ao público na loja da família",
            action:
              "Descreva as tarefas de atendimento que você realizou na loja.",
            question: "Que resultado real você pode relatar?",
          },
        ],
      });
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/jobs")
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pageSize: 12 },
      });
    return route.fulfill({ json: {} });
  });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/app#curriculo");
    const review = page.getByRole("region", {
      name: "Diagnóstico do currículo",
    });
    await expect(
      review.getByRole("heading", { name: "Sua análise de currículo" }),
    ).toBeVisible();
    await expect(review).toContainText("Complete o contexto das atividades");
    await expect(review).toContainText("Vagas para investigar");
    await expect(review).toContainText("Atendente");
    if (
      (await review.locator(".resume-review-evidence").getAttribute("open")) ===
      null
    ) {
      await review.getByText(/O que já aparece no currículo/).click();
    }
    await expect(
      review.getByText("Atividades descritas no currículo", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Analisar novamente", exact: true })
      .click();
    await expect(review).toContainText("Com apoio de IA");
    await expect(review).toContainText("Que resultado real você pode relatar?");
    expect(w.resumes[0].text).toBe(text);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await review.screenshot({
      path: testInfo.outputPath(`resume-analysis-${width}.png`),
    });
  }
  expect(analyses).toBe(2);
  expect(errors).toEqual([]);
});
