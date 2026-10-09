import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright";

export const loginInputs =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea';

export async function readLoginField(field: Locator, index: number) {
  const meta = await field.evaluate((node: HTMLInputElement) => {
    const label = (
      node.labels?.[0]?.textContent ||
      node.getAttribute("aria-label") ||
      node.placeholder ||
      node.name ||
      "Campo do site"
    ).trim();
    const code =
      node.autocomplete === "one-time-code" ||
      /c[oó]digo|verification code|security code|token|otp/i.test(
        label + " " + node.name,
      );
    const type =
      node.type === "password"
        ? "password"
        : node.type === "email"
          ? "email"
          : "text";
    return {
      label,
      type,
      autocomplete: code
        ? "one-time-code"
        : node.autocomplete ||
          (type === "password"
            ? "current-password"
            : type === "email"
              ? "username"
              : "off"),
      inputMode: code
        ? "numeric"
        : node.inputMode || (type === "email" ? "email" : "text"),
      required: node.required,
      hasValue: !!node.value,
      identity: [
        node.id,
        node.name,
        node.type,
        label,
        node.form?.id || "",
      ].join("|"),
    };
  });
  const { identity, ...publicMeta } = meta;
  return {
    index,
    key: createHash("sha256").update(`${index}|${identity}`).digest("hex"),
    ...publicMeta,
  };
}

export async function submitLoginForm(last: Locator) {
  const form = last.locator("xpath=ancestor::form[1]");
  if (await form.count()) {
    const buttons = form.getByRole("button", {
      name: /^(Entrar|Acessar conta|Continuar|Sign in|Log in|Login|Continue|Verificar|Confirmar|Verify|Next|Avançar|Validar código)$/i,
    });
    for (let i = 0; i < (await buttons.count()); i++) {
      const button = buttons.nth(i);
      if ((await button.isVisible()) && (await button.isEnabled())) {
        await button.click();
        return;
      }
    }
  }
  await last.press("Enter");
}

export async function editableLoginFields(page: Page) {
  const inputs = page.locator(loginInputs);
  const fields = [];
  for (let index = 0; index < (await inputs.count()); index++) {
    const field = inputs.nth(index);
    if ((await field.isVisible()) && (await field.isEditable()))
      fields.push(await readLoginField(field, index));
  }
  return fields;
}
