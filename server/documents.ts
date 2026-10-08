import { unzipSync } from "fflate";
export function extractDocx(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (f) =>
      f.name === "word/document.xml" && f.originalSize < 30 * 1024 * 1024,
  });
  if (!files["word/document.xml"]) throw new Error("Documento inválido.");
  const xml = new TextDecoder().decode(files["word/document.xml"]);
  const text = xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) =>
      String.fromCodePoint(
        n.startsWith("x") ? parseInt(n.slice(1), 16) : Number(n),
      ),
    )
    .trim();
}
