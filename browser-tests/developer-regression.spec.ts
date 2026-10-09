import { test, expect } from "@playwright/test";
import "./live-health";
import { requestHeaders as headers } from "./request-headers";
test("desenvolvedor encontra anúncio real e prepara apresentação sem registrar envio", async ({
  page,
}) => {
  test.setTimeout(120000);
  const password = "Developer-simple-QA-123";
  let registered = false;
  try {
    expect(
      (
        await page.request.post("/api/auth/register", {
          headers,
          data: {
            name: "Pessoa QA",
            email: "dev-simple-" + Date.now() + "@example.test",
            password,
          },
        })
      ).status(),
    ).toBe(200);
    registered = true;
    const build = await page.request.post("/api/resumes/build", {
      headers,
      data: {
        name: "Pessoa QA",
        headline: "Desenvolvedor .NET",
        education: "Ensino superior completo em Sistemas de Informação",
        experience:
          "Desenvolvedor full stack com C#, .NET e Angular.\nArquitetura: Repository Pattern.\nSistema com perfis de professor e recepção.",
        skills: [
          "C#",
          ".NET",
          "ASP.NET Core",
          "Angular",
          "SQL Server",
          "Entity Framework",
          "TypeScript",
          "JavaScript",
          "APIs REST",
          "Docker",
          "Git",
          "Azure",
        ],
      },
    });
    expect(build.status()).toBe(200);
    const { resumeId } = await build.json();
    const answers = {
      resumeId,
      titles: ["Desenvolvedor .NET"],
      modalities: [],
      city: "",
      sameCityOnly: false,
      salaryMin: 0,
      salaryMax: 0,
      includeUnknownSalary: true,
      ageDays: 365,
      contracts: [],
      sites: ["gupy"],
      dailyLimit: 5,
    };
    answers.modalities = ["Remoto", "Presencial", "Híbrido"] as never[];
    expect(
      (
        await page.request.put("/api/interview", {
          headers,
          data: { step: 5, complete: true, start: "save", answers },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await page.request.post("/api/discover", { headers })).status(),
    ).toBe(200);
    await expect
      .poll(
        async () => {
          const r = await page.request.get("/api/workspace");
          return r.ok() ? (await r.json()).runs[0]?.status : "waiting";
        },
        { timeout: 60000 },
      )
      .toBe("completed");
    const list = await (
      await page.request.get("/api/jobs?pageSize=100")
    ).json();
    const job = list.items.find(
      (item: any) =>
        !item.match.blockers.length && item.skills.includes(".NET"),
    );
    expect(job).toBeDefined();
    expect(job.demo).toBe(false);
    await page.goto("/app?vaga=" + job.id + "#vagas");
    await page
      .getByRole("button", { name: "Preparar candidatura", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Candidaturas", exact: true }),
    ).toBeVisible();
    await page.getByRole("row").filter({ hasText: job.title }).click();
    await expect(
      page.getByRole("heading", { name: "Conclua sua candidatura" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Apresentação para copiar e enviar"),
    ).toHaveValue(/Tenho interesse na vaga/);
    await expect(
      page.getByRole("link", { name: "Baixar currículo desta candidatura" }),
    ).toBeVisible();
    const w = await (await page.request.get("/api/workspace")).json();
    expect(w.applications[0]).toMatchObject({
      jobId: job.id,
      status: "Requer ação manual",
      receipt: null,
    });
    expect(w.applications[0].submittedAt).toBeFalsy();
  } finally {
    if (registered)
      await page.request.delete("/api/account", {
        headers,
        data: { password },
      });
  }
});
