import { expect, it, vi } from "vitest";
vi.mock("pdf-parse/worker", () => {
  throw new Error("Missing dependency for test");
});
import { extractPdfText, PdfReaderUnavailableError } from "../server/pdf-text";
import { resumePdf } from "./pdf-fixture";

it("classifies a missing reader dependency as a server failure rather than an invalid document", async () => {
  const error = await extractPdfText(resumePdf()).catch((error) => error);
  expect(error).toBeInstanceOf(PdfReaderUnavailableError);
  expect(error.statusCode).toBe(503);
  expect(error.code).toBe("PDF_READER_UNAVAILABLE");
  expect(error.message).not.toContain("Missing dependency");
});
