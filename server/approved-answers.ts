import type { Profile } from "../shared/types";
import { candidateAnswer } from "./candidate-answers";
import { normalized } from "./job-identity";
export const identityQuestion=(question:string)=>/\bcpf\b|documento de identidade|identification number|social security|passport number|numero do passaporte/.test(normalized(question));
export const sensitiveQuestion = (question: string) =>
  identityQuestion(question)||/consent|agree|privacy|privacidade|declaro|autoriz|legally|legal|visa|patrocin|sponsor|disability|deficien|genero|gender|race|raca|criminal|work permit|familiar|parentesco|relative|pessoa proxima|amigo intimo/i.test(
    normalized(question),
  );

export function approvedFieldAnswer(
  question: string,
  profile: Profile,
  destinationUrl: string,
) {
  if (!profile.confirmed) return undefined;
  const origin = new URL(destinationUrl).origin;
  const key = normalized(question).replace(/\s*\*$/, "");
  const sensitive = sensitiveQuestion(key);
  const answer = profile.approvedAnswers?.find(
    (a) =>
      !!a.confirmedAt &&
      [a.question, ...a.aliases].some((q) => normalized(q) === key) &&
      (!a.destinationOrigin || a.destinationOrigin === origin) &&
      (!a.destinationUrl || a.destinationUrl === destinationUrl) &&
      (!sensitive || a.destinationUrl === destinationUrl),
  );
  return answer?.value ?? candidateAnswer(question, profile);
}
