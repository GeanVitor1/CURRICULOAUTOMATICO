import PDFDocument from "pdfkit";

export type ResumeInput = {
  name: string;
  email: string;
  location: string;
  headline: string;
  experience: string;
  education: string;
  skills: string[];
  languages: string;
};
export function resumeText(data: ResumeInput) {
  return [
    data.name,
    data.email,
    data.location,
    data.headline,
    data.experience && `Experiência: ${data.experience}`,
    data.education && `Formação: ${data.education}`,
    data.skills.length && `Competências: ${data.skills.join(", ")}`,
    data.languages && `Idiomas: ${data.languages}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export async function createResumePdf(data: ResumeInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 54,
    info: { Title: `Currículo · ${data.name}`, Author: data.name },
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fillColor("#17201A").font("Helvetica-Bold").fontSize(24).text(data.name);
  doc
    .moveDown(0.4)
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#657269")
    .text([data.email, data.location].filter(Boolean).join("  ·  "));
  doc
    .moveDown(1)
    .strokeColor("#E2E7DF")
    .moveTo(54, doc.y)
    .lineTo(541, doc.y)
    .stroke();
  doc.moveDown(1.4);
  for (const [title, text] of [
    ["Objetivo", data.headline],
    ["Experiências formais e informais", data.experience],
    ["Formação", data.education],
    ["Competências", data.skills.join(", ")],
    ["Idiomas", data.languages],
  ]) {
    if (!text?.trim()) continue;
    if (doc.y > 700) doc.addPage();
    doc.fillColor("#427F50").font("Helvetica-Bold").fontSize(11).text(title);
    doc
      .moveDown(0.5)
      .fillColor("#17201A")
      .font("Helvetica")
      .fontSize(11)
      .text(text, { lineGap: 4 });
    doc.moveDown(1.4);
  }
  doc.end();
  return result;
}
