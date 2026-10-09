import { test, expect } from "@playwright/test";
import "./live-health";
import { requestHeaders as headers } from "./request-headers";
test("escolha de sites é simples e consulta real informa resultados ou indisponibilidade", async ({
  page,
}) => {
  test.setTimeout(120000);
  const password = "Portal-simple-QA-123";
  let registered = false;
  try {
    expect(
      (
        await page.request.post("/api/auth/register", {
          headers,
          data: {
            name: "Pessoa QA",
            email: "portal-simple-" + Date.now() + "@example.test",
            password,
          },
        })
      ).status(),
    ).toBe(200);
    registered = true;
    const built = await page.request.post("/api/resumes/build", {
      headers,
      data: {
        name: "Pessoa QA",
        headline: "Auxiliar administrativo",
        education: "Ensino médio completo",
        experience: "Experiência: rotinas administrativas",
        skills: ["Excel", "Rotinas administrativas"],
      },
    });
    expect(built.status()).toBe(200);
    const { resumeId } = await built.json();
    const answers = {
      resumeId,
      titles: ["Auxiliar administrativo"],
      modalities: ["Presencial"],
      city: "São Paulo",
      sameCityOnly: true,
      salaryMin: 0,
      salaryMax: 0,
      includeUnknownSalary: true,
      ageDays: 365,
      contracts: [],
      sites: ["infojobs"],
      dailyLimit: 5,
    };
    expect(
      (
        await page.request.put("/api/interview", {
          headers,
          data: { step: 5, complete: true, start: "save", answers },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/app#preferencias");
    await expect(
      page.getByRole("heading", { name: "Suas preferências", exact: true }),
    ).toBeVisible();
    await page.goto("/app#vagas");
    await page
      .getByRole("button", { name: "Buscar vagas", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const r = await page.request.get("/api/workspace");
          return r.ok() ? (await r.json()).runs[0]?.status : "waiting";
        },
        { timeout: 90000, intervals: [1000, 2000] },
      )
      .toMatch(/completed|partial|failed/);
    const w = await (await page.request.get("/api/workspace")).json();
    expect(
      w.sources
        .filter((source: any) => source.enabled)
        .map((source: any) => source.board),
    ).toEqual(["infojobs"]);
    expect(w.applications).toEqual([]);
    if (w.runs[0].status === "failed") {
      expect(w.runs[0].errors.length).toBeGreaterThan(0);
      await expect(page.locator(".discovery-status")).toContainText(
        "Nenhum site pôde ser consultado",
      );
    } else
      expect(
        w.jobs.every(
          (job: any) =>
            job.source === "InfoJobs" &&
            job.url.startsWith("https://") &&
            !job.demo,
        ),
      ).toBe(true);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});
