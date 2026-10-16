import { expect, it } from "vitest";
import { providerLoginIssue } from "../server/portal-login-issue";
import { liveInputSchema } from "../shared/portal-live";

it.each([
  "Não foi possível fazer o login. Esse navegador ou app pode não ser seguro.",
  "Não foi possível fazer login",
  "Este navegador ou app pode não ser seguro",
  "This browser or app may not be secure",
])("reconhece a recusa sem depender da variante de idioma: %s", (text) => {
  expect(
    providerLoginIssue("https://accounts.google.com/signin", text),
  ).toContain("Google recusou");
});
it("reconhece a rota de recusa mesmo sem texto e não confunde a página normal", () => {
  expect(
    providerLoginIssue("https://accounts.google.com/v3/signin/rejected", ""),
  ).toContain("Google recusou");
  expect(
    providerLoginIssue(
      "https://accounts.google.com/signin",
      "Faça login com sua conta Google",
    ),
  ).toBe("");
  expect(
    providerLoginIssue(
      "https://login.gupy.io/",
      "Não foi possível fazer o login",
    ),
  ).toBe("");
});
it("aceita a área maior de login e limita redimensionamentos arbitrários", () => {
  expect(
    liveInputSchema.safeParse({ type: "click", x: 1500, y: 990 }).success,
  ).toBe(true);
  expect(
    liveInputSchema.safeParse({ type: "resize", width: 1600, height: 1000 })
      .success,
  ).toBe(true);
  expect(
    liveInputSchema.safeParse({ type: "resize", width: 100000, height: 100000 })
      .success,
  ).toBe(false);
});
