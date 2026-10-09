import { test, expect } from "@playwright/test";
import "./live-health";
import { requestHeaders as headers } from "./request-headers";
import { mkdir, writeFile } from "node:fs/promises";

test("Gupy real: busca pela fila, persistência, filtros e deduplicação sem enviar candidaturas", async ({
  page,
}) => {
  test.setTimeout(120000);
  const password = "Live-search-redesign-123";
  let registered = false;
  try {
    const registration = await page.request.post("/api/auth/register", {
      headers,
      data: {
        name: "Teste de busca",
        email: `redesign-live-${Date.now()}@example.test`,
        password,
      },
    });
    expect(registration.status()).toBe(200);
    registered = true;
    const source = await page.request.post("/api/sources", {
      headers,
      data: { type: "portal", company: "Gupy", board: "gupy", enabled: true },
    });
    expect(source.status()).toBe(200);
    const initial = await (await page.request.get("/api/workspace")).json();
    expect(
      (
        await page.request.put("/api/filters", {
          headers,
          data: {
            ...initial.filters,
            titles: ["Auxiliar administrativo"],
            ageDays: 365,
            dateKnownOnly: false,
          },
        })
      ).status(),
    ).toBe(200);
    const started = await page.request.post("/api/discover", { headers });
    expect(started.status()).toBe(200);
    const repeated = await page.request.post("/api/discover", { headers });
    expect((await repeated.json()).id).toBe((await started.json()).id);
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).runs[0]
            ?.status,
        { timeout: 60000, intervals: [500, 1500] },
      )
      .toMatch(/completed|partial|failed/);
    const w = await (await page.request.get("/api/workspace")).json();
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/redesign-live-workflow.json",
      JSON.stringify(
        {
          source: "Gupy",
          status: w.runs[0].status,
          errors: w.runs[0].errors,
          discovered: w.jobs.length,
          applications: w.applications.length,
          checkedAt: new Date().toISOString(),
          sample: w.jobs
            .slice(0, 3)
            .map((j: any) => ({
              title: j.title,
              company: j.company,
              url: j.url,
            })),
        },
        null,
        2,
      ),
    );
    expect(w.runs[0].status, w.runs[0].errors.join(" ")).toBe("completed");
    expect(w.jobs.length).toBeGreaterThan(0);
    expect(w.applications).toEqual([]);
    expect(new Set(w.jobs.map((j: any) => j.url)).size).toBe(w.jobs.length);
    expect(
      w.jobs.every(
        (j: any) =>
          j.source === "Gupy" && !j.demo && j.url.startsWith("https://"),
      ),
    ).toBe(true);
    await page.goto("/app#vagas");
    await expect(page.locator(".job-card").first()).toBeVisible();
    await page
      .getByLabel("Modalidade", { exact: true })
      .selectOption("Presencial");
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/workspace")).json()).filters
            .modalities,
      )
      .toEqual(["Presencial"]);
    const jobs = await (
      await page.request.get("/api/jobs?pageSize=100")
    ).json();
    expect(jobs.total).toBeGreaterThan(0);
    expect(jobs.items.every((j: any) => j.modality === "Presencial")).toBe(
      true,
    );
    await page
      .getByLabel("Buscar vagas", { exact: true })
      .fill(w.jobs[0].company);
    await expect
      .poll(async () =>
        Number(
          (await page.locator(".count-caption").innerText()).split(" ")[0],
        ),
      )
      .toBeGreaterThan(0);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/redesign-live-jobs-${width}.png`,
        fullPage: true,
      });
    }
    await page.reload();
    await expect(page.locator(".job-card").first()).toBeVisible();
  } finally {
    if (registered)
      expect(
        (
          await page.request.delete("/api/account", {
            headers,
            data: { password },
          })
        ).status(),
      ).toBe(200);
  }
});
