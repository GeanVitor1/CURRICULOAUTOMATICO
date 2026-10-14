import { z } from "zod";
import type {
  Profile,
  ResumeReview,
  ResumeReviewCategory,
} from "../shared/types";
import { extractSkills, normalize } from "./engine";
import { evidenceLines } from "./professional-evidence";
import { minimizeResume } from "./resume-privacy";
import { resumeSections } from "./resume-sections";
import { RESUME_ANALYSIS_VERSION } from "./resume-analysis-prompt";

export const coachingSchema = z
  .array(
    z.object({
      category: z.enum([
        "objective",
        "experience",
        "education",
        "skills",
        "clarity",
      ]),
      priority: z.enum(["high", "medium"]),
      evidence: z.string().min(8).max(600),
      action: z.string().min(12).max(700),
      question: z.string().min(8).max(300),
    }),
  )
  .max(5);
export type ResumeCoaching = z.infer<typeof coachingSchema>;

/** Reject fabricated quotes without discarding otherwise valid profile extraction. */
export function verifyCoaching(input: unknown, text: string): ResumeCoaching {
  const result = coachingSchema.safeParse(input);
  if (!result.success) return [];
  return result.data.filter(
    (item, index, all) =>
      text.includes(item.evidence.trim()) &&
      !/\[(?:contato|documento|telefone|link) removido\]/.test(item.evidence) &&
      all.findIndex(
        (other) =>
          normalize(other.evidence) === normalize(item.evidence) &&
          other.category === item.category,
      ) === index,
  );
}

const labels: Record<ResumeReviewCategory, string> = {
  objective: "Objetivo profissional",
  experience: "Experiências e projetos",
  education: "Formação e cursos",
  skills: "Competências",
  clarity: "Clareza e organização",
};

export function buildResumeReview(
  text: string,
  profile: Partial<Profile>,
  options: {
    method?: string;
    analyzedText?: string;
    coaching?: ResumeCoaching;
  } = {},
): ResumeReview {
  const professional = minimizeResume(text, 100000);
  const sections = resumeSections(professional);
  const firstJob =
    /primeiro emprego|sem experiencia|jovem aprendiz|estagio/.test(
      normalize(professional),
    );
  const quote = (value: string | undefined) => {
    if (!value) return "";
    const line =
      value
        .split(/\r?\n/)
        .find((line) => line.trim().length >= 3)
        ?.trim() || "";
    return professional.includes(line) ? line.slice(0, 350) : "";
  };
  const objective = quote(sections.objective || profile.headline);
  const experience = quote(
    sections.experience || sections.projects || profile.experience,
  );
  const education = quote(
    sections.education || sections.courses || profile.education,
  );
  const positive = evidenceLines(professional).filter((line) => !line.negated);
  const skills = (profile.skills || [])
    .flatMap((skill) => {
      const line = positive.find((line) =>
        extractSkills(line.text, [skill]).includes(skill),
      );
      return line ? [{ label: skill, evidence: line.text.slice(0, 350) }] : [];
    })
    .slice(0, 12);
  const hasPeriod = /\b(?:19|20)\d{2}\b|\b\d+\s*(?:anos?|meses?)\b/.test(
    sections.experience || sections.projects || profile.experience || "",
  );
  const organized = Object.keys(sections).length >= 2;
  const sectionsResult: ResumeReview["sections"] = [
    {
      category: "objective",
      label: labels.objective,
      status: objective ? "identified" : "not_found",
      evidence: objective,
    },
    {
      category: "experience",
      label: labels.experience,
      status: experience
        ? hasPeriod
          ? "identified"
          : "needs_detail"
        : "not_found",
      evidence: experience,
    },
    {
      category: "education",
      label: labels.education,
      status: education ? "identified" : "not_found",
      evidence: education,
    },
    {
      category: "skills",
      label: labels.skills,
      status: skills.length ? "identified" : "not_found",
      evidence: skills[0]?.evidence || "",
    },
    {
      category: "clarity",
      label: labels.clarity,
      status: organized ? "identified" : "needs_detail",
      evidence: "",
    },
  ];
  const improvements: ResumeReview["improvements"] = [];
  const add = (
    category: ResumeReviewCategory,
    title: string,
    action: string,
    question: string,
    evidence = "",
    priority: "high" | "medium" = "high",
  ) =>
    improvements.push({
      id: `local-${category}`,
      category,
      priority,
      title,
      action,
      question,
      evidence,
      source: "local",
    });
  if (!objective)
    add(
      "objective",
      "Deixe claro o que você procura",
      "Informe o cargo ou a área de interesse em uma frase. Seu objetivo será tratado como preferência, sem presumir experiência nesse cargo.",
      "Qual cargo ou área você deseja procurar?",
    );
  if (!experience)
    add(
      "experience",
      firstJob ? "Valorize o que você já fez" : "Descreva suas atividades",
      "Não localizamos uma descrição de atividades. Você pode incluir projetos, trabalhos informais, voluntariado e atividades de estudo que realmente realizou.",
      "Que atividade você realizou e quais tarefas ficaram sob sua responsabilidade?",
    );
  else if (!hasPeriod)
    add(
      "experience",
      "Complete o contexto das atividades",
      "As atividades aparecem no texto, mas o período não foi identificado. Acrescente o período real e diferencie trabalho, projeto e atividade informal.",
      "Quando você realizou essa atividade e em qual contexto?",
      experience,
    );
  if (!education)
    add(
      "education",
      "Informe sua formação atual",
      "Não identificamos a formação no texto. Informe curso ou escolaridade e deixe claro se está em andamento ou concluída.",
      "Qual é sua formação e qual o estado atual do curso?",
    );
  if (!skills.length)
    add(
      "skills",
      "Mostre competências com exemplos",
      "Não identificamos competências com evidência suficiente. Descreva tarefas e ferramentas que você realmente utiliza, sem copiar requisitos de vagas como se já os dominasse.",
      "Quais tarefas ou ferramentas você consegue demonstrar por meio de uma atividade real?",
    );
  if (!organized)
    add(
      "clarity",
      "Organize o conteúdo em seções",
      "Use títulos como Objetivo, Experiências, Formação e Competências. Esta verificação considera o texto extraído; não avalia o desenho do PDF nem prevê a leitura de um ATS.",
      "Quais informações devem entrar em cada seção?",
      "",
      "medium",
    );
  const coaching = verifyCoaching(
    options.coaching,
    options.analyzedText || professional,
  );
  for (const [index, item] of coaching.entries()) {
    improvements.push({
      ...item,
      id: `ai-${index}`,
      title: `Aprofunde: ${labels[item.category].toLowerCase()}`,
      source: "ai",
    });
  }
  const strengths: ResumeReview["strengths"] = [
    ...(experience
      ? [{ label: "Atividades descritas no currículo", evidence: experience }]
      : []),
    ...(education
      ? [{ label: "Formação ou curso descrito", evidence: education }]
      : []),
    ...skills,
  ].slice(0, 8);
  const analyzed = options.analyzedText || professional;
  return {
    version: RESUME_ANALYSIS_VERSION,
    method: options.method || "local",
    generatedAt: new Date().toISOString(),
    summary: firstJob
      ? "Vamos organizar seus estudos, atividades e competências para as oportunidades que você procura, incluindo experiências informais e projetos."
      : "Use os trechos identificados para valorizar sua trajetória e complete os dados pendentes antes de adaptar o currículo às vagas.",
    coverage: {
      analyzedCharacters: analyzed.length,
      truncated: analyzed.length < professional.length,
    },
    sections: sectionsResult,
    strengths,
    improvements: improvements
      .sort(
        (a, b) => Number(b.priority === "high") - Number(a.priority === "high"),
      )
      .slice(0, 8),
  };
}
