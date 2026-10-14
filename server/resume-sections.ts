export type ResumeSection =
  | "objective"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "languages"
  | "projects"
  | "courses";

const headings: [ResumeSection, RegExp][] = [
  [
    "objective",
    /^(?:objetivo(?: profissional)?|cargo desejado|career objective)$/,
  ],
  [
    "summary",
    /^(?:resumo(?: profissional)?|perfil(?: profissional)?|sobre mim|summary|professional summary)$/,
  ],
  [
    "experience",
    /^(?:experiencias?(?: profissionais?| profissional)?|historico profissional|trabalho informal|experiencia informal|work experience|professional experience|employment history)$/,
  ],
  [
    "education",
    /^(?:formacao(?: academica)?|educacao|escolaridade|education|academic background)$/,
  ],
  [
    "skills",
    /^(?:competencias(?: tecnicas)?|habilidades(?: tecnicas)?|conhecimentos(?: tecnicos)?|tecnologias|skills|technical skills)$/,
  ],
  ["languages", /^(?:idiomas|linguas|languages)$/],
  ["projects", /^(?:projetos(?: pessoais| academicos)?|portfolio|projects)$/],
  [
    "courses",
    /^(?:cursos(?: complementares)?|certificacoes|certificados|qualificacoes|certifications|courses)$/,
  ],
];

/** Preserve school/company names and dates after headings, including inline headings. */
export function resumeSections(
  text: string,
): Partial<Record<ResumeSection, string>> {
  const sections: Partial<Record<ResumeSection, string[]>> = {};
  let current: ResumeSection | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    const title = (colon < 0 ? line : line.slice(0, colon))
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^[•●\-\s]+|[.\s]+$/g, "");
    const heading = headings.find(([, pattern]) => pattern.test(title));
    if (heading) {
      current = heading[0];
      const value = colon < 0 ? "" : line.slice(colon + 1).trim();
      sections[current] ||= [];
      if (value) sections[current]!.push(value);
    } else if (current) {
      // Contact or miscellaneous headings end the preceding professional section.
      if (
        /^(?:contato|contact|referencias|references|dados pessoais|informacoes pessoais)\s*:?$/i.test(
          title,
        )
      ) {
        current = undefined;
      } else sections[current]!.push(line);
    }
  }
  return Object.fromEntries(
    Object.entries(sections)
      .filter(([, lines]) => lines.length)
      .map(([section, lines]) => [section, lines.join("\n")]),
  );
}
