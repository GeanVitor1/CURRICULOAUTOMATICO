import { inflateRawSync } from "node:zlib";

const MAX_ARCHIVE = 5 * 1024 * 1024;
const MAX_XML = 30 * 1024 * 1024;
const invalid = () =>
  new Error("DOCX inválido ou excessivamente grande após descompactação.");

/** Parse ZIP32 metadata and bound actual decompression, not just claimed sizes. */
function documentXml(buffer: Buffer): string {
  if (buffer.length < 22 || buffer.length > MAX_ARCHIVE) throw invalid();
  let end = buffer.length - 22;
  const earliest = Math.max(0, end - 65535);
  while (
    end >= earliest &&
    (buffer.readUInt32LE(end) !== 0x06054b50 ||
      end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length)
  )
    end--;
  if (end < earliest) throw invalid();
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directory = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6) ||
    count !== buffer.readUInt16LE(end + 8) ||
    !count ||
    count > 500 ||
    directory + directorySize !== end
  )
    throw invalid();
  let cursor = directory,
    total = 0;
  let document:
    | {
        offset: number;
        compressed: number;
        size: number;
        method: number;
        flags: number;
      }
    | undefined;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw invalid();
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20),
      size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const next =
      cursor +
      46 +
      nameLength +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42);
    total += size;
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      buffer.readUInt16LE(cursor + 34) ||
      total > MAX_XML ||
      compressed > MAX_ARCHIVE ||
      offset + 30 > directory
    )
      throw invalid();
    if (
      buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString() ===
      "word/document.xml"
    ) {
      if (document || !size) throw invalid();
      document = { offset, compressed, size, method, flags };
    }
    cursor = next;
  }
  if (cursor !== end || !document) throw invalid();
  const { offset, compressed, size, method, flags } = document;
  if (
    buffer.readUInt32LE(offset) !== 0x04034b50 ||
    buffer.readUInt16LE(offset + 6) !== flags ||
    buffer.readUInt16LE(offset + 8) !== method
  )
    throw invalid();
  const nameLength = buffer.readUInt16LE(offset + 26);
  const start = offset + 30 + nameLength + buffer.readUInt16LE(offset + 28);
  if (
    start + compressed > directory ||
    buffer.subarray(offset + 30, offset + 30 + nameLength).toString() !==
      "word/document.xml"
  )
    throw invalid();
  const data = buffer.subarray(start, start + compressed);
  const xml =
    method === 0
      ? data
      : inflateRawSync(data, { maxOutputLength: Math.min(size, MAX_XML) });
  if (xml.length !== size || xml.length > MAX_XML) throw invalid();
  return new TextDecoder().decode(xml);
}

export function extractDocx(buffer: Buffer): string {
  const xml = documentXml(buffer);
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
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const code = /^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "\uFFFD";
    })
    .trim();
}
