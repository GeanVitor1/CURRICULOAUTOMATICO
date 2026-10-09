import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "empregatos-precompress-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "assets"));
  return directory;
}
const compress = (directory: string) =>
  execFileAsync(
    process.execPath,
    [resolve("scripts/precompress.mjs"), directory],
    {
      windowsHide: true,
    },
  );

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    const target = resolve(directory);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !basename(target).startsWith("empregatos-precompress-")
    )
      throw new Error("Diretório temporário inesperado.");
    await rm(target, { recursive: true, force: true });
  }
});

describe("Pré-compressão de assets em produção", () => {
  it("gera HTML, JS e CSS negociáveis sem modificar os originais ou comprimir mídia", async () => {
    const directory = await fixture();
    const text = Buffer.from(
      "const mensagem = 'Olá, mundo. Currículos e vagas reais.';\n".repeat(500),
    );
    const paths = [
      "index.html",
      "assets/main-A1b2C3d4.js",
      "assets/main-A1b2C3d4.css",
    ];
    for (const path of paths) await writeFile(join(directory, path), text);
    const media = join(directory, "assets/mascot-A1b2C3d4.gif");
    await writeFile(media, text);
    const result = await compress(directory);
    expect(JSON.parse(result.stdout).precompressed.generatedVariants).toBe(6);
    for (const path of paths) {
      const original = join(directory, path);
      const gz = await readFile(original + ".gz");
      const br = await readFile(original + ".br");
      expect(gunzipSync(gz)).toEqual(text);
      expect(brotliDecompressSync(br)).toEqual(text);
      expect(await readFile(original)).toEqual(text);
      expect(gz.length).toBeLessThan(text.length);
      expect(br.length).toBeLessThan(text.length);
    }
    await expect(stat(media + ".gz")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(media + ".br")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("remove variantes antigas quando uma nova versão pequena não beneficia de compressão", async () => {
    const directory = await fixture();
    const file = join(directory, "assets/main-A1b2C3d4.js");
    await writeFile(file, "const value = 12345;\n".repeat(500));
    await compress(directory);
    await writeFile(file, "0");
    const result = await compress(directory);
    expect(JSON.parse(result.stdout).precompressed.generatedVariants).toBe(0);
    expect(await readFile(file, "utf8")).toBe("0");
    await expect(stat(file + ".gz")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(file + ".br")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
