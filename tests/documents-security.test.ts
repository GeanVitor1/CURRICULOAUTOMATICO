import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractDocx } from "../server/documents";

const docx = (text: string, level: 0 | 9 = 9) =>
  Buffer.from(
    zipSync(
      {
        "word/document.xml": strToU8(
          `<w:document><w:p><w:t>${text}</w:t></w:p></w:document>`,
        ),
      },
      { level },
    ),
  );
const central = (file: Buffer) =>
  file.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

it.each([0, 9] as const)(
  "extracts valid ZIP32 documents (compression=%s)",
  (level) => {
    expect(
      extractDocx(docx("Currículo &amp; experiência &#x1F600;", level)),
    ).toBe("Currículo & experiência 😀");
  },
);
it("rejects forged sizes instead of inflating data past the declared bound", () => {
  const file = docx("A".repeat(2 * 1024 * 1024));
  file.writeUInt32LE(10, central(file) + 24);
  expect(() => extractDocx(file)).toThrow();
});
it("rejects actual and declared oversized documents", () => {
  const file = docx("A".repeat(31 * 1024 * 1024));
  expect(file.length).toBeLessThan(5 * 1024 * 1024);
  expect(() => extractDocx(file)).toThrow();
});
it("rejects truncation, missing document, invalid offsets and encrypted entries", () => {
  const offset = docx("Texto");
  offset.writeUInt32LE(0xffffffff, central(offset) + 42);
  const encrypted = docx("Texto");
  encrypted.writeUInt16LE(1, central(encrypted) + 8);
  const count = docx("Texto");
  count.writeUInt16LE(501, count.length - 12);
  for (const file of [
    docx("Texto").subarray(0, -5),
    Buffer.from(zipSync({ "other.xml": strToU8("Texto") })),
    offset,
    encrypted,
    count,
  ])
    expect(() => extractDocx(file)).toThrow();
});
it("handles invalid XML character references without crashing", () => {
  expect(extractDocx(docx("Texto &#999999999999; &#xD800;"))).toBe("Texto � �");
});
