import { test, expect, type Page, type Locator } from "@playwright/test";
import { createWorkspace } from "../server/workspace";
import type { Job, Workspace } from "../shared/types";

let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const workspace = () => {
  const w = createWorkspace("Pessoa QA", "mascotes@example.test");
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: false, dismissed: true, active: false };
  return w;
};

async function account(page: Page, w: Workspace, signedIn = true) {
  // All API responses are isolated fixtures. No account, provider or application is changed.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({
        status: signedIn ? 200 : 401,
        json: signedIn
          ? { id: "qa-mascots", name: w.profile.name, email: w.profile.email }
          : { error: "Sessão ausente" },
      });
    } else if (path === "/api/workspace") {
      await route.fulfill({ json: w });
    } else if (path === "/api/jobs") {
      await route.fulfill({
        json: { items: w.jobs, total: w.jobs.length, page: 1, pageSize: 12 },
      });
    } else if (path === "/api/source-registry") {
      await route.fulfill({ json: [] });
    } else {
      await route.fulfill({ json: {} });
    }
  });
}

async function loaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("artes da página pública e autenticação carregam no desktop e celular", async ({
  page,
}, testInfo) => {
  await account(page, workspace(), false);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await loaded(page.locator('.hero-mascot[data-mascot="handing-resume"]'));
    await page.locator(".cta-mascot").scrollIntoViewIfNeeded();
    await loaded(page.locator('.cta-mascot[data-mascot="idea"]'));
    await noOverflow(page);
    await page.locator(".landing-nav").scrollIntoViewIfNeeded();
    await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".hero-visual")).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: testInfo.outputPath(`landing-${width}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/register");
  await loaded(page.locator('.auth-mascot[data-mascot="idea"]'));
  await page.goto("/login");
  await loaded(page.locator('.auth-mascot[data-mascot="writing-to-you"]'));
  await page.setViewportSize({ width: 375, height: 900 });
  await loaded(page.locator('.auth-card-mascot[data-mascot="writing-to-you"]'));
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("login-celular.png"),
    animations: "disabled",
  });
});

test("GIF acompanha a busca, pausa sem interromper a consulta e exibe erro e recuperação", async ({
  page,
}, testInfo) => {
  await account(page, workspace());
  let fail = true;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/jobs?**", async (route) => {
    await pending;
    await route.fulfill(
      fail
        ? { status: 503, json: { error: "Fonte de QA indisponível" } }
        : { json: { items: [], total: 0, page: 1, pageSize: 12 } },
    );
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/app#vagas");
  const image = page.locator('.empty [data-mascot="thinking"]');
  try {
    await loaded(image);
    await expect(image).toHaveAttribute("src", /\.gif$/);
    await page
      .getByRole("button", { name: "Pausar animação do mascote" })
      .click();
    await expect(image).toHaveAttribute("src", /\.jpeg$/);
    await expect(
      page.getByText("Preparando suas oportunidades", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reproduzir animação do mascote" })
      .click();
    await expect(image).toHaveAttribute("src", /\.gif$/);
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("busca-processando.png"),
    });
  } finally {
    release();
  }
  await loaded(page.locator('.empty [data-mascot="surprised"]'));
  await expect(
    page.getByRole("button", { name: "Pausar animação do mascote" }),
  ).toHaveCount(0);
  fail = false;
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await loaded(page.locator('.empty [data-mascot="thinking"]'));
  await expect(page.locator('.empty [data-mascot="thinking"]')).toHaveAttribute(
    "src",
    /\.jpeg$/,
  );
});

test("movimento reduzido usa pose estática e não baixa o GIF durante o processamento", async ({
  page,
}, testInfo) => {
  await account(page, workspace());
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/jobs?**", async (route) => {
    await pending;
    await route.fulfill({
      json: { items: [], total: 0, page: 1, pageSize: 12 },
    });
  });
  const animatedImages: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "image" &&
      /\.gif(?:\?|$)/.test(request.url())
    )
      animatedImages.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/app#vagas");
  try {
    await loaded(page.locator('.empty [data-mascot="thinking"]'));
    await expect(
      page.locator('.empty [data-mascot="thinking"]'),
    ).toHaveAttribute("src", /\.jpeg$/);
    await expect(
      page.getByRole("button", { name: "Pausar animação do mascote" }),
    ).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("busca-celular.png") });
    expect(animatedImages).toEqual([]);
  } finally {
    release();
  }
});

test("poses acompanham as etapas de preferências e preparação do currículo", async ({
  page,
}, testInfo) => {
  const w = workspace();
  w.onboarding!.completed = false;
  await account(page, w);
  await page.setViewportSize({ width: 375, height: 900 });
  const poses = [
    "idea",
    "thinking",
    "handing-resume",
    "writing-to-you",
    "considering",
    "writing-right",
  ];
  for (let step = 0; step < poses.length; step++) {
    w.onboarding!.step = step;
    await page.goto("/app");
    await loaded(page.locator(`.wizard-mascot[data-mascot="${poses[step]}"]`));
    await noOverflow(page);
    if (step === 5)
      await page.screenshot({
        path: testInfo.outputPath("preferencias-celular.png"),
      });
  }
  await page.goto("/app#curriculo");
  await loaded(page.locator('.upload-mascot[data-mascot="handing-resume"]'));
  await loaded(page.locator('.empty-mascot[data-mascot="writing"]'));
  await page
    .getByRole("button", { name: "Ainda não tenho currículo", exact: true })
    .click();
  await loaded(page.locator('.wizard-mascot[data-mascot="writing-to-you"]'));
  await noOverflow(page);
});

test("mascote empregado celebra apenas uma contratação registrada", async ({
  page,
}, testInfo) => {
  const w = workspace();
  const at = "2026-10-08T12:00:00.000Z";
  const job: Job = {
    id: "qa-job",
    title: "Atendimento QA",
    company: "Empresa QA",
    source: "Manual",
    url: "https://example.test/vaga",
    description: "Oportunidade sintética para validação visual.",
    location: "Recife, PE",
    modality: "Presencial",
    level: "Júnior",
    contract: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: [],
    requiredSkills: [],
    requiredYears: null,
    publishedAt: null,
    discoveredAt: at,
    saved: false,
    discarded: false,
    origins: [],
    demo: false,
    match: {
      score: 0,
      strengths: [],
      gaps: [],
      blockers: [],
      matchedSkills: [],
      missingSkills: [],
      radar: false,
      explanation: "QA",
    },
  };
  w.jobs = [job];
  w.applications = [
    {
      id: "qa-application",
      jobId: job.id,
      status: "Enviada",
      createdAt: at,
      updatedAt: at,
      resumeId: null,
      receipt: null,
      note: "",
      history: [],
      mode: "manual",
    },
  ];
  await account(page, w);
  await page.goto("/app#candidaturas");
  await page.getByRole("button", { name: /Atendimento QA/ }).click();
  await expect(page.locator('[data-mascot="employed"]')).toHaveCount(0);
  w.applications[0].status = "Contratada";
  await page.reload();
  await page.getByRole("button", { name: /Atendimento QA/ }).click();
  await loaded(page.locator('.hired-mascot[data-mascot="employed"]'));
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await page.setViewportSize({ width: 375, height: 900 });
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("contratacao-celular.png"),
    animations: "disabled",
  });
});

test("busca em segundo plano troca o GIF pela pose do resultado", async ({
  page,
}) => {
  const w = workspace();
  w.runs = [
    {
      id: "qa-run",
      at: "2026-10-08T12:00:00.000Z",
      status: "running",
      discovered: 0,
      processed: 0,
      errors: [],
      message: "Consultando uma fonte de QA.",
    },
  ];
  await account(page, w);
  await page.goto("/app#vagas");
  const status = page.locator(".discovery-status");
  await loaded(status.locator('[data-mascot="thinking"]'));
  await expect(status.locator("img")).toHaveAttribute("src", /\.gif$/);
  w.runs[0].status = "completed";
  w.runs[0].message = "Consulta terminou sem novos resultados.";
  await expect(
    status.getByText("Busca concluída", { exact: true }),
  ).toBeVisible();
  await loaded(status.locator('[data-mascot="idea"]'));
  await expect(
    status.getByRole("button", { name: "Pausar animação do mascote" }),
  ).toHaveCount(0);
  w.runs[0].status = "failed";
  w.runs[0].errors = ["Fonte de QA indisponível"];
  await page.reload();
  await loaded(status.locator('[data-mascot="surprised"]'));
  await expect(
    status.getByRole("button", { name: "Conferir fontes" }),
  ).toBeVisible();
});
