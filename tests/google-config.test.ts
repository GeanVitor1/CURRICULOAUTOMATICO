import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "dotenv";
const execute = promisify(execFile);
const script = resolve("scripts/configure-google.mjs");
const callback = "http://127.0.0.1:5173/api/auth/google/callback";
let directory = "";
beforeAll(
  async () =>
    (directory = await mkdtemp(join(tmpdir(), "empregatos-google-config-"))),
);
afterAll(async () => {
  if (directory.startsWith(join(tmpdir(), "empregatos-google-config-")))
    await rm(directory, { recursive: true, force: true });
});
const credentials = (redirects = [callback]) => ({
  web: {
    client_id: "fixture.apps.googleusercontent.com",
    client_secret: "GOCSPX-private-test-secret",
    redirect_uris: redirects,
  },
});
describe("Configuração privada do cliente Google", () => {
  it("importa o cliente Web, preserva outros serviços e restringe o arquivo sem exibir segredos", async () => {
    const source = join(directory, "client.json"),
      target = join(directory, ".env");
    await writeFile(source, JSON.stringify(credentials()));
    await writeFile(
      target,
      'APP_ORIGIN=http://127.0.0.1:5173\nGEMINI_API_KEY="existing-private-key"\n',
    );
    const result = await execute(process.execPath, [
      script,
      source,
      "--output-env",
      target,
    ]);
    const env = parse(await readFile(target, "utf8"));
    expect(env.GOOGLE_CLIENT_SECRET).toBe("GOCSPX-private-test-secret");
    expect(env.GOOGLE_REDIRECT_URI).toBe(callback);
    expect(env.GEMINI_API_KEY).toBe("existing-private-key");
    // Windows uses ACLs; chmod/stat do not represent POSIX private permissions.
    if (process.platform !== "win32")
      expect((await stat(target)).mode & 0o777).toBe(0o600);
    expect(result.stdout + result.stderr).not.toMatch(
      /private-test-secret|existing-private-key/,
    );
  });
  it("recusa callback não cadastrado e preserva o ambiente atual", async () => {
    const source = join(directory, "wrong-client.json"),
      target = join(directory, "existing.env");
    const original =
      "APP_ORIGIN=http://127.0.0.1:5173\nGOOGLE_CLIENT_SECRET=keep-private\n";
    await writeFile(
      source,
      JSON.stringify(credentials(["https://another.example.test/callback"])),
    );
    await writeFile(target, original);
    await expect(
      execute(process.execPath, [script, source, "--output-env", target]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Adicione este URI"),
    });
    expect(await readFile(target, "utf8")).toBe(original);
  });
  it("configura o cliente do domínio público em arquivo separado do desenvolvimento", async () => {
    const source = join(directory, "production-client.json"),
      target = join(directory, "production.env"),
      origin = "https://curriculoautomatico.vercel.app";
    await writeFile(
      source,
      JSON.stringify(credentials([`${origin}/api/auth/google/callback`])),
    );
    const result = await execute(process.execPath, [
      script,
      source,
      "--output-env",
      target,
      "--origin",
      origin,
    ]);
    expect(parse(await readFile(target, "utf8"))).toMatchObject({
      APP_ORIGIN: origin,
      GOOGLE_REDIRECT_URI: `${origin}/api/auth/google/callback`,
    });
    expect(result.stdout + result.stderr).not.toContain("private-test-secret");
  });
  it("não inclui conteúdo do JSON inválido em erros ou cria ambiente com credenciais inválidas", async () => {
    const source = join(directory, "invalid-client.json"),
      target = join(directory, "invalid.env");
    await writeFile(source, '{"client_secret":"private-json-fragment"');
    await expect(
      execute(process.execPath, [script, source, "--output-env", target]),
    ).rejects.toMatchObject({
      stderr: "O arquivo de credenciais não contém JSON válido.\n",
    });
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
