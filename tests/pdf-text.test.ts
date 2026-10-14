import { describe, expect, it } from "vitest";
import { extractPdfText } from "../server/pdf-text";
import { resumePdf } from "./pdf-fixture";

describe("PDF text extraction with serverless initialization", () => {
  it("extracts real PDF content using the embedded worker and native polyfills", async () => {
    const text = await extractPdfText(resumePdf());
    expect(text).toContain("Verified projects");
    expect(text).toContain("SQL Server");
  });

  it("supports concurrent uploads without sharing documents", async () => {
    const texts = await Promise.all([
      extractPdfText(resumePdf()),
      extractPdfText(resumePdf()),
    ]);
    expect(texts.every((text) => text.includes("Verified projects"))).toBe(
      true,
    );
  });

  it("rejects a corrupt file without returning fabricated resume text", async () => {
    await expect(
      extractPdfText(Buffer.from("%PDF-1.4\nnot a document")),
    ).rejects.toThrow();
  });
});
