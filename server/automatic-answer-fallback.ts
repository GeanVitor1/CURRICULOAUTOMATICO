import { normalized } from "./job-identity";
import { sensitiveQuestion } from "./approved-answers";

export const personalQuestion = (question: string) =>
  /genero|gender|raca|race|etnia|ethnic|orientacao|sexual|religia|religion|estado civil|marital|nascimento|birth|idade|\bage\b|remuneracao atual|current salary|compensation|deficien|disability|pcd|acessibilidade|accessibility|accommodations|familiar|parentesco|relative/.test(
    normalized(question),
  );

const declineOption = (option: string) =>
  /prefiro nao (?:informar|responder|declarar)|prefer not to (?:say|disclose|answer)|decline to (?:answer|self.identify)|nao desejo (?:informar|declarar)/.test(
    normalized(option),
  );

/**
 * Missing information is never turned into "No", "None" or "0".
 * The only automatic choice for an unknown answer is an explicit
 * "prefer not to say" option of a sensitive/personal question, when the form offers it.
 * Anything else returns undefined and stays pending for the user.
 */
export function automaticFallback(question: string, options?: string[]) {
  if (!options?.length) return undefined;
  if (!personalQuestion(question) && !sensitiveQuestion(question)) return undefined;
  return options.find(declineOption);
}
