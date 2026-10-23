import type {
  Application,
  AutomaticAnswer,
  Job,
  Profile,
  Resume,
} from "../shared/types";
import { approvedFieldAnswer,identityQuestion } from "./approved-answers";
import { prepareQuestionDrafts } from "./question-drafts";
import { normalized } from "./job-identity";
import { automaticFallback } from "./automatic-answer-fallback";
import { evidencedTechnologyYears, experienceYearsQuestion } from "./answer-evidence";
import { extractSkills } from "./engine";

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
  if (!automaticAnswersEnabled(profile)) return profile;
  const answers = (application.automaticAnswers || []).filter(
    (a) =>
      a.resumeId === application.resumeId &&
      a.destinationUrl === destinationUrl &&
      !legalAcceptance(a.question)&&!identityQuestion(a.question),
  );
  return {
    ...profile,
    approvedAnswers: [
      ...(profile.approvedAnswers || []),
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
      confidence: source === "profile" || source === "job_source" ? "confirmed" : source === "ai" ? "evidenced" : "policy",
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
          ));
    if (match) {
      put(question, match, "profile", "Informação confirmada no perfil.");
      continue;
    }
    if (saved) {
      incompatibleKnown.add(question);
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
  const remaining = eligible.filter(
    (q) => !answers.some((a) => a.question === q) && !incompatibleKnown.has(q),
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
      /* The user-authorized negative fallback does not require an available model. */
    }
  }
  for (const question of remaining.filter(
    (q) => !answers.some((a) => a.question === q),
  )) {
    const value = automaticFallback(question, input.options?.[question]);
    if (value)
      put(
        question,
        value,
        "default_no",
        "Sem informação suficiente. Resposta negativa ou preferência por não informar conforme regra autorizada pelo usuário; não é uma conclusão extraída do currículo.",
      );
  }
  return answers;
}
