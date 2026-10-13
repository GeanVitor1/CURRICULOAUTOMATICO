import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "dotenv";
const execute = promisify(execFile),
  script = resolve("scripts/configure-vm.mjs");
let directory = "";
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "empregatos-vm-config-"));
});
afterAll(async () => {
  if (directory.startsWith(join(tmpdir(), "empregatos-vm-config-")))
    await rm(directory, { recursive: true, force: true });
});
describe("Ambiente privado da VM", () => {
  it("preserva credenciais, gera segredos fortes uma vez e nunca os imprime", async () => {
    await writeFile(
      join(directory, ".env"),
      'STRIPE_SECRET_KEY="sk_test_private-fixture"\nGEMINI_API_KEY="private-ai-fixture"\nAPP_ORIGIN="http://127.0.0.1:5173"\n',
    );
    const result = await execute(
      process.execPath,
      [script, "--hostname", "api.example.test"],
      { cwd: directory },
    );
    const initial = parse(
      await readFile(join(directory, ".env.production.local"), "utf8"),
    );
    expect(initial).toMatchObject({
      APP_ORIGIN: "https://curriculoautomatico.vercel.app",
      STRIPE_SECRET_KEY: "sk_test_private-fixture",
      GEMINI_API_KEY: "private-ai-fixture",
      BACKEND_HOSTNAME: "api.example.test",
    });
    expect(Buffer.from(initial.ENCRYPTION_KEY, "base64")).toHaveLength(32);
    expect(initial.API_PROXY_SECRET).toHaveLength(64);
    expect(initial.POSTGRES_PASSWORD).toHaveLength(64);
    const repeated = await execute(process.execPath, [script], {
      cwd: directory,
    });
    expect(
      parse(await readFile(join(directory, ".env.production.local"), "utf8")),
    ).toEqual(initial);
    for (const secret of [
      initial.ENCRYPTION_KEY,
      initial.API_PROXY_SECRET,
      initial.POSTGRES_PASSWORD,
      initial.STRIPE_SECRET_KEY,
      initial.GEMINI_API_KEY,
    ])
      expect(result.stdout + repeated.stdout).not.toContain(secret);
  });
  it("hostname inválido não altera o arquivo privado", async () => {
    const path = join(directory, ".env.production.local"),
      original = await readFile(path, "utf8");
    await expect(
      execute(
        process.execPath,
        [script, "--hostname", "https://user:secret@attacker.example/path"],
        { cwd: directory },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("hostname público"),
    });
    expect(await readFile(path, "utf8")).toBe(original);
  });
});
