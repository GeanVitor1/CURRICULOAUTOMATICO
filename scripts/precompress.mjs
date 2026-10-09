import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
const root = resolve(process.argv[2] || "dist");
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile() && /\.(?:html|js|css)$/i.test(entry.name))
      files.push(path);
  }
}

async function saveVariant(path, data, originalBytes) {
  if (data.length < originalBytes) {
    await writeFile(path, data);
    return data.length;
  }
  // A repeated build must not retain a stale compressed copy of a changed file.
  await unlink(path).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  return null;
}

await collect(root);
const report = {
  textFiles: files.length,
  generatedVariants: 0,
  originalBytes: 0,
  gzipBytes: 0,
  brotliBytes: 0,
};
for (const file of files) {
  const data = await readFile(file);
  // Compression runs once at build time; media and fonts retain their originals.
  const [gz, br] = await Promise.all([
    gzipAsync(data, { level: constants.Z_BEST_COMPRESSION }),
    brotliAsync(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
  ]);
  const gzipBytes = await saveVariant(file + ".gz", gz, data.length);
  const brotliBytes = await saveVariant(file + ".br", br, data.length);
  report.originalBytes += data.length;
  report.gzipBytes += gzipBytes ?? data.length;
  report.brotliBytes += brotliBytes ?? data.length;
  report.generatedVariants +=
    Number(gzipBytes !== null) + Number(brotliBytes !== null);
}
console.log(JSON.stringify({ precompressed: report }));
