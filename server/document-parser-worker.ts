import { extractDocx } from "./documents";
import { extractPdfText } from "./pdf-text";

const chunks: Buffer[] = [];
let size = 0;
try {
  for await (const part of process.stdin) {
    size += part.length;
    if (size > 5 * 1024 * 1024) throw Error("Input limit");
    chunks.push(part);
  }
  const bytes = Buffer.concat(chunks);
  const extension = process.argv[2];
  if (!bytes.length || ![".pdf", ".docx"].includes(extension)) throw Error("Invalid document");
  const text = extension === ".pdf" ? await extractPdfText(bytes) : extractDocx(bytes);
  process.stdout.write(JSON.stringify({ text: text.slice(0, 100000) }));
} catch (error) {
  const safe = error as {code?:string;statusCode?:number};
  process.stdout.write(JSON.stringify({error:safe.code === "PDF_READER_UNAVAILABLE" ? "PDF_READER_UNAVAILABLE" : "DOCUMENT_INVALID"}));
}
