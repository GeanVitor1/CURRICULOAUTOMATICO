import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  fillKnown,
  type PortalApplication,
} from "../server/portal-application";
import { createWorkspace } from "../server/workspace";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});
const input = (): PortalApplication => ({
  applicationId: "test",
  job: {
    title: "Developer",
    company: "Fixture",
    url: "https://fixture.example.test/jobs/1",
  },
  profile: createWorkspace("Pessoa", "candidate@example.test").profile,
  resume: { name: "fixture.pdf" },
});

it("preserva o e-mail já cadastrado e interrompe um pedido implícito de troca", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(
      '<h2>Atualize seus dados</h2><label>E-mail<input type="email" value="original@example.test" required></label><button>Atualizar</button>',
    );
    const result = await fillKnown(page, input());
    expect(result).toContain("preservado");
    expect(await page.locator("input").inputValue()).toBe(
      "original@example.test",
    );
  } finally {
    await page.close();
  }
});

it("preenche o e-mail autorizado quando o formulário de candidatura está vazio", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<label>E-mail<input type="email" required></label>');
    expect(await fillKnown(page, input())).toBeUndefined();
    expect(await page.locator("input").inputValue()).toBe(
      "candidate@example.test",
    );
  } finally {
    await page.close();
  }
});
