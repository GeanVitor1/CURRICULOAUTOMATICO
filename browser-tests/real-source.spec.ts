import { test, expect } from "@playwright/test";
const headers = { "X-Orbita-Request": "1", Origin: "http://127.0.0.1:5173" };
test("portal selecionado faz uma consulta real e mostra anúncios verificáveis ou a limitação", async ({
  page,
}) => {
  test.setTimeout(120000);
  const password = "Browser-portal-test-123";
  let registered = false;
  try {
    const registration = await page.request.post("/api/auth/register", {
      headers,
      data: {
        name: "Validação de portal",
        email: "portal-" + Date.now() + "@example.test",
        password,
      },
    });
    expect(registration.status()).toBe(200);
    registered = true;
    await page.request.put("/api/onboarding", {
      headers,
      data: {
        step: 5,
        complete: true,
        answers: {
          goal: "Auxiliar administrativo",
          location: "São Paulo",
          resumeChoice: "later",
          experience: "",
          modalities: [],
          contracts: [],
          salaryMin: 0,
        },
      },
    });
    await page.request.put("/api/guide", {
      headers,
      data: { step: 0, active: false, completed: false, dismissed: true },
    });
    await page.goto("/app#configuracoes");
    const cards = page.locator(".registry-card");
    await expect(cards).toHaveCount(4);
    await expect(cards).toContainText([
      "LinkedIn",
      "InfoJobs",
      "Indeed",
      "Gupy",
    ]);
    await expect(page.getByLabel("Quais cargos você procura?")).toHaveValue(
      "Auxiliar administrativo",
    );
    await page.screenshot({
      path: "artifacts/settings-empregatos-portals.png",
      fullPage: true,
    });
    await cards
      .filter({ hasText: "InfoJobs" })
      .getByRole("button", { name: "Adicionar e pesquisar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Explorar vagas", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).runs[0]
            ?.status,
        { timeout: 90000, intervals: [1000, 2000] },
      )
      .toMatch(/completed|partial|failed/);
    const w = await (await page.request.get("/api/workspace")).json();
    expect(w.sources[0]).toMatchObject({
      type: "portal",
      board: "infojobs",
      discovery: true,
      application: false,
    });
    expect(w.applications).toEqual([]);
    if (w.runs[0].status === "failed") {
      expect(w.jobs).toEqual([]);
      expect(w.runs[0].errors.length).toBeGreaterThan(0);
      await expect(page.locator(".discovery-status")).toContainText(
        "Nenhuma fonte pôde ser consultada",
      );
    } else {
      expect(
        w.jobs.every(
          (job: any) =>
            job.source === "InfoJobs" &&
            job.url.startsWith("https://") &&
            !job.demo &&
            job.availability === "unknown",
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole("link", { name: "Buscar no InfoJobs", exact: true }),
    ).toBeVisible();
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "artifacts/portal-search-" + width + ".png",
        fullPage: true,
      });
    }
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});

test("currículo mostra cargos e evidências e a confirmação atualiza a busca", async ({
  page,
}) => {
  const password = "Browser-resume-targets-123";
  let registered = false;
  try {
    const registration = await page.request.post("/api/auth/register", {
      headers,
      data: {
        name: "Pessoa sintética",
        email: "targets-" + Date.now() + "@example.test",
        password,
      },
    });
    expect(registration.status()).toBe(200);
    registered = true;
    await page.request.put("/api/onboarding", {
      headers,
      data: {
        step: 5,
        complete: true,
        answers: {
          goal: "Atendente",
          location: "Recife",
          resumeChoice: "later",
          experience: "",
          modalities: [],
          contracts: [],
          salaryMin: 0,
        },
      },
    });
    await page.request.put("/api/guide", {
      headers,
      data: { step: 0, active: false, completed: false, dismissed: true },
    });
    const built = await page.request.post("/api/resumes/build", {
      headers,
      data: {
        name: "Pessoa sintética",
        headline: "Atendente",
        experience: "Experiência: atendimento ao público e operação de caixa.",
        education: "Ensino médio completo",
        skills: ["Atendimento ao público", "Operação de caixa"],
      },
    });
    expect(built.status()).toBe(200);
    await page.goto("/app#curriculo");
    await expect(
      page.getByRole("heading", {
        name: "Para quais vagas este currículo faz sentido?",
      }),
    ).toBeVisible();
    await expect(page.locator(".resume-targets")).toContainText(
      "Operador de caixa",
    );
    await page
      .getByRole("button", { name: "Confirmar cargos para minha busca" })
      .click();
    await expect(page.locator(".resume-targets")).toContainText(
      "Cargos confirmados na busca:",
    );
    const w = await (await page.request.get("/api/workspace")).json();
    expect(w.filters.titles).toContain("Operador de caixa");
    expect(w.resumes[0].targetsConfirmed).toBe(true);
    expect(w.resumes[0].approved).toBe(false);
    for (const width of [1440, 375]) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "artifacts/resume-targets-" + width + ".png",
        fullPage: true,
      });
    }
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});
