import { describe, expect, it } from "vitest";
import { extractPdfText } from "../server/pdf-text";
import { resumePdf } from "./pdf-fixture";
import PDFDocument from "pdfkit";

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
  it("rejects a many-page upload before extracting all page content", async () => {
    const pdf = new PDFDocument({autoFirstPage:false});
    const bytes = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdf.on("data", chunk => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject);
    });
    for (let i=0; i<51; i++) pdf.addPage().text("Synthetic resume content");
    pdf.end();
    await expect(extractPdfText(await bytes)).rejects.toThrow("entre 1 e 50 páginas");
  });
});
