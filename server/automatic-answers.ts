import type {
  Application,
  AutomaticAnswer,
  Job,
  Profile,
  Resume,
} from "../shared/types";
import { approvedFieldAnswer,identityQuestion,sensitiveQuestion } from "./approved-answers";
import { prepareQuestionDrafts } from "./question-drafts";
import { normalized } from "./job-identity";
import { automaticFallback } from "./automatic-answer-fallback";
import { evidencedTechnologyYears, experienceYearsQuestion } from "./answer-evidence";
import { extractSkills } from "./engine";
import {salaryOption} from './salary-options';
import { classifyQuestion } from "../shared/answer-topics";
import { memoryAnswer } from "./answer-topics";
import { personalQuestion } from "./automatic-answer-fallback";

export const automaticAnswersEnabled = (profile: Profile) =>
  !!(
    profile.confirmed &&
    profile.answerPolicy?.enabled &&
    profile.answerPolicy.confirmedAt &&
    profile.answerPolicy.missing === "no"
  );
export const legalAcceptance = (question: string) =>
  /concord|consent|privacidade|privacy|declaro|i agree|accept.*terms|aceit.*termos|autoriz.*dados|li.*compreendi/.test(
    normalized(question),
  );

export function applicationAnswerProfile(
  profile: Profile,
  application: Application,
  destinationUrl: string,
): Profile {
  const origin = new URL(destinationUrl).origin;
  // The executor (including a configured webhook) must never receive answers
  // reviewed for another employer or vacancy, even with automation disabled.
  const approved = (profile.approvedAnswers || []).filter(a =>
    !!a.confirmedAt &&
    (!a.destinationOrigin || a.destinationOrigin === origin) &&
    (!a.destinationUrl || a.destinationUrl === destinationUrl) &&
    (![a.question, ...a.aliases].some(sensitiveQuestion) || a.destinationUrl === destinationUrl),
  );
  const answers = (automaticAnswersEnabled(profile) ? application.automaticAnswers || [] : []).filter(
    (a) =>
      a.resumeId === application.resumeId &&
      a.destinationUrl === destinationUrl &&
      !legalAcceptance(a.question)&&!identityQuestion(a.question),
  );
  return {
    ...profile,
    approvedAnswers: [
      ...approved,
      ...answers.map((a, i) => ({
        id: `automatic-${i}`,
        question: a.question,
        aliases: [],
        value: a.value,
        confirmedAt: a.at,
        destinationOrigin: new URL(destinationUrl).origin,
        destinationUrl,
      })),
    ],
  };
}

export async function prepareAutomaticAnswers(input: {
  profile: Profile;
  resume: Resume;
  job: Job;
  destinationUrl: string;
  questions: string[];
  options?: Record<string, string[]>;
  model?: string;
}): Promise<AutomaticAnswer[]> {
  if (!automaticAnswersEnabled(input.profile)) return [];
  const at = new Date().toISOString();
  const eligible = input.questions
    .slice(0, 60)
    .filter((q) => !legalAcceptance(q)&&!identityQuestion(q));
  const answers: AutomaticAnswer[] = [];
  const incompatibleKnown = new Set<string>();
  const put = (
    question: string,
    value: string,
    source: AutomaticAnswer["source"],
    reason: string,
  ) => {
    answers.push({
      question,
      value,
      source,
      confidence: source === "profile" || source === "job_source" || source === "memory" ? "confirmed" : source === "ai" ? "evidenced" : "policy",
      fillable: true,
      reason,
      at,
      resumeId: input.resume.id,
      destinationUrl: input.destinationUrl,
    });
  };
  for (const question of eligible) {
    const choices = input.options?.[question];
    let saved = approvedFieldAnswer(
      question,
      input.profile,
      input.destinationUrl,
    );
    const preferences = input.profile.applicationPreferences;
    if (
      !saved &&
      preferences?.confirmedAt &&
      /acessibilidade|accessibility|accommodations/.test(
        normalized(question),
      ) &&
      preferences.accessibility
    ) {
      saved = preferences.accessibility;
      if (choices?.length && !choices.includes(saved)) {
        const negative = /^(nao|no|none)/.test(normalized(saved));
        saved = negative
          ? choices.find((c) => /^(nao|no|none)/.test(normalized(c))) || saved
          : choices.find((c) => /^(sim|yes)$/.test(normalized(c))) || saved;
      }
    }
    const match =
      saved &&
      (!choices?.length
        ? saved
        : choices.find(
            (choice) =>
              normalized(choice) === normalized(saved) ||
              normalized(choice).startsWith(`${normalized(saved)} exemplo `),
          ) || salaryOption(question, Number(saved), choices));
    if (match) {
      put(question, match, "profile", "Informação confirmada no perfil.");
      continue;
    }
    if (saved) {
      incompatibleKnown.add(question);
      continue;
    }
    const remembered = memoryAnswer(question, input.profile, input.job, choices);
    if (remembered) {
      put(question, remembered.value, "memory", `Resposta definida por você para o assunto (${remembered.entry.topic}).`);
      continue;
    }
    const experienceEvidence=[input.resume.text,input.profile.experience].join("\n");
    const years=evidencedTechnologyYears(question,experienceEvidence);
    if(years && !choices?.length) {
      put(question,years,"profile","Duração explicitamente declarada no currículo ou experiência confirmada.");
      continue;
    }
    // A technology present without a duration is unknown, never automatically
    // zero years. This also prevents replacing a known qualification with 'No'.
    if(experienceYearsQuestion(question) && extractSkills(question).some(skill=>
      [...input.profile.skills,...extractSkills(experienceEvidence)].includes(skill))) {
      incompatibleKnown.add(question);
      continue;
    }
    if (
      !choices?.length &&
      /pretensao salarial|salary expectation|expected salary/.test(
        normalized(question),
      ) &&
      input.profile.salaryDesired > 0
    ) {
      put(
        question,
        String(input.profile.salaryDesired),
        "profile",
        "Pretensão salarial confirmada no perfil.",
      );
      continue;
    }
    if (
      /como.*(?:sabendo|soube|encontrou)|how did you (?:hear|find)|source of/.test(
        normalized(question),
      )
    ) {
      const source = input.job.source;
      const option =
        choices?.find((option) => normalized(option) === normalized(source)) ||
        choices?.find((option) => /^(outro|other)$/.test(normalized(option)));
      if (!choices?.length || option) {
        put(
          question,
          option || source,
          "job_source",
          `Origem registrada da vaga: ${source}.`,
        );
        continue;
      }
    }
  }
  // Personal facts and preferences are defined only by the user: never drafted by AI.
  const userOnly = (q: string) => {
    const topic = classifyQuestion(q, input.options?.[q])?.topic;
    return personalQuestion(q) || sensitiveQuestion(q) || (!!topic && topic !== "tech_experience_years");
  };
  const remaining = eligible.filter(
    (q) => !answers.some((a) => a.question === q) && !incompatibleKnown.has(q) && !userOnly(q),
  );
  if (input.model && remaining.length) {
    try {
      const drafts = await prepareQuestionDrafts({
        resume: input.resume.text,
        questions: remaining,
        options: input.options,
        title: input.job.title,
        model: input.model,
        confirmedFacts: Object.entries(
          input.profile.applicationPreferences?.confirmedAt
            ? input.profile.applicationPreferences
            : {},
        )
          .filter(
            ([key, value]) =>
              key !== "confirmedAt" &&
              typeof value === "string" &&
              value.trim(),
          )
          .map(([key, value]) => `${key}: ${value}`),
      });
      for (const draft of drafts)
        put(draft.question, draft.answer, "ai", draft.evidence.join("\n"));
    } catch (error) {
      console.error(JSON.stringify({event:"automatic_answers_provider_failed",type:error instanceof Error ? error.name : "UnknownError"}));
      /* Unanswered questions stay pending; nothing is presumed. */
    }
  }
  for (const question of eligible.filter(
    (q) => !answers.some((a) => a.question === q) && !incompatibleKnown.has(q),
  )) {
    const value = automaticFallback(question, input.options?.[question]);
    if (value)
      put(
        question,
        value,
        "decline_option",
        "Pergunta pessoal sem informação confirmada: escolhida a opção do formulário de não informar. Nenhum fato foi presumido.",
      );
  }
  // Everything else stays unanswered: optional fields are left blank and required
  // ones pause only this application as pending for the user.
  return answers;
}
