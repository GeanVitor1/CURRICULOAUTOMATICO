import { describe, expect, it } from "vitest";
import { scryptSync } from "node:crypto";
import { passwordHash, verifyPassword } from "../server/auth-password";

describe("Senhas compatíveis e autenticação sem bloquear a API", () => {
  it("valida contas existentes com o mesmo formato scrypt", async () => {
    const salt = "12".repeat(16);
    const legacy = `${salt}:${scryptSync("Existing-password-123", salt, 64).toString("hex")}`;
    expect(await verifyPassword("Existing-password-123", legacy)).toBe(true);
    expect(await verifyPassword("Wrong-password-123", legacy)).toBe(false);
  });

  it("gera salts diferentes e verifica novas senhas", async () => {
    const [first, second] = await Promise.all([
      passwordHash("Private-password-123"),
      passwordHash("Private-password-123"),
    ]);
    expect(first).not.toBe(second);
    expect(await verifyPassword("Private-password-123", first)).toBe(true);
  });

  it("contas ausentes ou hashes danificados falham sem exceções", async () => {
    for (const hash of [
      undefined,
      "disabled",
      "abc:def",
      "00:" + "0".repeat(128),
    ])
      expect(await verifyPassword("Private-password-123", hash)).toBe(false);
  });

  it("permite ao event loop atender outras tarefas durante o cálculo", async () => {
    let completed = false;
    const work = passwordHash("Private-password-123").then(() => {
      completed = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);
    await work;
  });
});
