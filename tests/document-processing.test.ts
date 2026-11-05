import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseResumeDocument, parserMemoryBytes } from "../server/document-processing";
import { resumePdf } from "./pdf-fixture";
it("extracts a real PDF in a separate process with no service environment",async()=>{
  const text=await parseResumeDocument(resumePdf(),".pdf");expect(text).toContain("Verified projects");
},20000);
it("reads DOCX in the bounded child process and rejects corrupt files",async()=>{
  const bytes=Buffer.from(zipSync({"word/document.xml":strToU8("<w:p><w:t>Synthetic private candidate resume</w:t></w:p>")}));
  expect(await parseResumeDocument(bytes,".docx")).toContain("Synthetic private");
  await expect(parseResumeDocument(Buffer.from("invalid"),".docx")).rejects.toThrow("Não foi possível ler");
},20000);
it("bounds inputs before creating a child and measures real process RSS",async()=>{
  await expect(parseResumeDocument(Buffer.alloc(5*1024*1024+1),".pdf")).rejects.toThrow("5 MB");
  expect(await parserMemoryBytes(process.pid)).toBeGreaterThan(1024*1024);
});
