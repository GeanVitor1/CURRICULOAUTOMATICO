import { test, expect } from "@playwright/test";

for (const path of ["/login", "/register"]) {
  test(`${path} mostra o formulário quando a API está indisponível`, async ({
    page,
  }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "O serviço está temporariamente indisponível." },
      }),
    );
    await page.goto(path);
    await expect(
      page.getByRole("textbox", { name: "E-mail", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: path === "/login" ? "Entrar" : "Criar minha conta",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Não foi possível acessar sua conta agora."),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "O serviço de acesso está temporariamente indisponível. Tente novamente em instantes.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continuar com Google", exact: true }),
    ).toBeDisabled();
  });
}

test("a área privada mantém a tela de indisponibilidade sem mostrar dados", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "O serviço está temporariamente indisponível." },
    }),
  );
  await page.goto("/app");
  await expect(
    page.getByText("Não foi possível acessar sua conta agora."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "E-mail", exact: true }),
  ).toHaveCount(0);
});
