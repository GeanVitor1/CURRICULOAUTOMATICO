import { expect, test } from "@playwright/test";
import { createWorkspace } from "../server/workspace";

test("custom job title controls stay compact and add the selected title on desktop and mobile", async ({
  page,
}, testInfo) => {
  const w = createWorkspace("Pessoa fictícia", "layout@example.test");
  w.onboarding!.completed = true;
  w.guide = { step: 0, completed: true, dismissed: true, active: false };
  w.resumes = [
    {
      id: "layout-resume",
      name: "Currículo fictício.pdf",
      uploadedAt: "2026-10-14T12:00:00Z",
      skills: [],
      text: "Objetivo: Assistente administrativo",
      approved: false,
      analysis: "Documento fictício",
      targets: [
        {
          title: "Assistente administrativo",
          evidence: "Assistente administrativo",
          reason: "Objetivo declarado",
          caution: "Conferir requisitos",
        },
      ],
    },
  ];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          id: "layout-user",
          name: "Pessoa fictícia",
          email: "layout@example.test",
        },
      });
    if (path === "/api/workspace") return route.fulfill({ json: w });
    if (path === "/api/automation/sites") return route.fulfill({ json: [] });
    if (path === "/api/billing")
      return route.fulfill({ json: { dailyLimit: 5 } });
    return route.fulfill({ json: {} });
  });
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/app#preferencias");
    await expect(
      page.getByRole("heading", { name: "Quais cargos você quer procurar?" }),
    ).toBeVisible();
    const details = page
      .locator("details")
      .filter({
        has: page.getByText("Quero incluir outro cargo", { exact: true }),
      });
    if ((await details.getAttribute("open")) === null)
      await details.locator("summary").click();
    const input = page.getByLabel("Outro cargo", { exact: true });
    const button = page.getByRole("button", {
      name: "Adicionar cargo",
      exact: true,
    });
    await input.fill("");
    await expect(button).toBeDisabled();
    const fieldBox = (await input.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.height).toBeLessThanOrEqual(48);
    expect(buttonBox.width).toBeLessThanOrEqual(200);
    if (width > 600) {
      expect(
        Math.abs(fieldBox.y + fieldBox.height - buttonBox.y - buttonBox.height),
      ).toBeLessThanOrEqual(1);
      expect(buttonBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width);
    } else {
      expect(buttonBox.y).toBeGreaterThanOrEqual(
        fieldBox.y + fieldBox.height + 8,
      );
    }
    await input.fill("Analista de suporte");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(input).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Analista de suporte", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await details.screenshot({
      path: testInfo.outputPath(`custom-title-${width}.png`),
    });
  }
  expect(errors).toEqual([]);
});
