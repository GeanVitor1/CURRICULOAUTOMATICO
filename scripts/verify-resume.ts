import { writeFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { createResumePdf } from "../server/resume-pdf";
// Explicit visual QA fixture. No account is read and this is never served as a user's resume.
const data = {
  name: "Pessoa de validação",
  email: "validacao@example.test",
  location: "Recife, PE",
  headline: "Primeiro emprego em atendimento ao cliente",
  education:
    "Ensino médio completo — Escola municipal, 2025.\nCurso de atendimento ao público, 2026.",
  experience:
    "Experiência informal na loja da família: atendimento a clientes e organização de mercadorias, entre 2024 e 2025.",
  skills: ["Atendimento ao público", "Organização de estoque", "Planilhas"],
  languages: "Português",
};
const buffer = await createResumePdf(data);
await writeFile("artifacts/resume-qa.pdf", buffer);
const parser = new PDFParse({ data: buffer });
try {
  const result = await parser.getScreenshot({ desiredWidth: 900 });
  for (const page of result.pages)
    await writeFile(`artifacts/resume-qa-${page.pageNumber}.png`, page.data);
  console.log(
    JSON.stringify({ pages: result.pages.length, syntheticFixture: true }),
  );
} finally {
  await parser.destroy();
}
