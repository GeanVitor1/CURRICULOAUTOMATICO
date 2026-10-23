import { expect, test } from "@playwright/test";
import { createWorkspace } from "../server/workspace";
import { confirmCandidateDetails } from "../tests/fixtures/candidate-details";
import type { Job } from "../shared/types";

test("reviews one question, preserves edits and saves partial answers on mobile", async ({
  page,
}) => {
  page.on("pageerror", (error) => console.log("PAGE ERROR", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(message.text());
  });
  await page.setViewportSize({ width: 375, height: 900 });
  const w = createWorkspace("Pessoa", "fixture@example.test");
  confirmCandidateDetails(w);
  w.resumes = [{id:"resume",name:"Currículo.pdf",text:"Projeto de API com .NET",skills:[".NET"],approved:true,uploadedAt:new Date().toISOString(),analysis:""}];
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: true, dismissed: true, active: false };
  w.intelligence = { provider: "gemini", enabled: true, consent: true } as any;
  w.jobs = [
    {
      id: "job",
      company: "Empresa Exemplo",
      title: "Desenvolvedor .NET",
    } as Job,
  ];
  w.applications = [
    {
      id: "application",
      jobId: "job",
      resumeId: "resume",
      status: "Requer ação manual",
      mode: "automatic",
      destinationUrl: "https://example.test/apply",
      missingQuestions: [
        "Conte sobre seu projeto",
        "Concordo com a política da empresa",
      ],
      history: [],
      note: "",
      receipt: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  let saved: any;
  let fail = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { id: "user", name: "Pessoa", email: w.profile.email },
      });
    if (path === "/api/workspace") return route.fulfill({ json: w });
    if (path === "/api/answer-policy") { const body=route.request().postDataJSON(); w.profile.answerPolicy={enabled:body.enabled,missing:"no",confirmedAt:new Date().toISOString()}; return route.fulfill({json:{ok:true}}); }
    if (path === "/api/automation/sites") return route.fulfill({ json: [] });
    if (path.endsWith("/questions/draft"))
      return fail
        ? route.fulfill({
            status: 503,
            json: { error: "IA indisponível. Tente novamente." },
          })
        : route.fulfill({
            json: {
              answers: [
                {
                  question: "Conte sobre seu projeto",
                  answer: "Desenvolvi uma API com .NET.",
                  evidence: ["Projeto de API com .NET"],
                  source: "ai",
                },
              ],
              unresolved: [
                {
                  question: "Concordo com a política da empresa",
                  reason: "Sua decisão.",
                },
              ],
              message: "1 sugestão da IA · 1 para você completar.",
            },
          });
    if (path.endsWith("/answers")) {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/app#preferencias");
  const panel = page.getByRole("region", {
    name: "Perguntas das vagas antes do envio",
  });
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await panel.getByRole("button", { name: "Revisar perguntas" }).click();
  await panel
    .getByRole("button", { name: "Preparar respostas com IA", exact: true })
    .click();
  await expect(panel.getByLabel("Conte sobre seu projeto")).toHaveValue(
    "Desenvolvi uma API com .NET.",
  );
  await panel
    .getByLabel("Conte sobre seu projeto")
    .fill("Minha resposta revisada.");
  await panel.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(
    panel.getByLabel("Concordo com a política da empresa"),
  ).toHaveValue("");
  await panel.getByRole("button", { name: "Anterior", exact: true }).click();
  await expect(panel.getByLabel("Conte sobre seu projeto")).toHaveValue(
    "Minha resposta revisada.",
  );
  await panel.getByRole("checkbox").check();
  await panel
    .getByRole("button", { name: "Salvar respostas (1)" })
    .click();
  await expect
    .poll(() => saved?.answers)
    .toEqual([
      {
        question: "Conte sobre seu projeto",
        value: "Minha resposta revisada.",
        reuse: false,
      },
    ]);
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  fail = true;
  await panel
    .getByRole("button", { name: "Preparar respostas com IA", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toHaveText(
    "IA indisponível. Tente novamente.",
  );
  await expect(panel.getByLabel("Conte sobre seu projeto")).toHaveValue(
    "Minha resposta revisada.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/question-review-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/question-review-desktop.png",
    fullPage: true,
  });
  await page.getByRole("region",{name:"Respostas automáticas",exact:true}).getByRole("button",{name:"Autorizar respostas automáticas"}).click();
  await expect(page.getByRole("heading",{name:"A IA cuida das perguntas"})).toBeVisible();
  await expect(page.getByText("Autorizações específicas de empresas")).toBeVisible();
  await expect(panel).not.toBeVisible();
});
