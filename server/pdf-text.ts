import { RequestError } from "./errors";

export class PdfReaderUnavailableError extends Error {
  readonly code = "PDF_READER_UNAVAILABLE";
  readonly statusCode = 503;
  constructor() {
    super("O leitor de PDF está temporariamente indisponível.");
  }
}

async function loadPdfParser() {
  // This explicit import lets deployment tracing include @napi-rs/canvas and
  // its native bindings. PDF.js loads it through createRequire, which is missed.
  try {
    const { CanvasFactory, getData } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    // The embedded worker is version-matched and does not depend on filesystem
    // paths being preserved by the deployment bundler.
    PDFParse.setWorker(getData());
    return { PDFParse, CanvasFactory };
  } catch {
    // A missing server dependency is not an invalid customer document.
    throw new PdfReaderUnavailableError();
  }
}

/** Load the canvas polyfills and embedded worker before PDF.js in serverless bundles. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse, CanvasFactory } = await loadPdfParser();
  const parser = new PDFParse({
    data: buffer,
    CanvasFactory,
    isEvalSupported: false,
  });
  try {
    const info = await parser.getInfo();
    if (!Number.isInteger(info.total) || info.total < 1 || info.total > 50)
      throw new RequestError("O currículo PDF deve ter entre 1 e 50 páginas.");
    const result = await parser.getText({ first: 50 });
    return result.text;
  } finally {
    await parser.destroy();
  }
}
