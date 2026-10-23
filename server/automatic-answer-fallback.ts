import { normalized } from "./job-identity";

export const personalQuestion = (question: string) =>
  /genero|gender|raca|race|etnia|ethnic|orientacao|sexual|religia|religion|estado civil|marital|nascimento|birth|idade|\bage\b|remuneracao atual|current salary|compensation|deficien|disability|pcd|acessibilidade|accessibility|accommodations|familiar|parentesco|relative/.test(
    normalized(question),
  );

export function automaticFallback(question: string, options?: string[]) {
  const decline = options?.find((option) =>
    /prefiro nao (?:informar|responder|declarar)|prefer not to (?:say|disclose|answer)|decline to (?:answer|self.identify)/.test(
      normalized(option),
    ),
  );
  const negative = options?.find((option) =>
    /^(?:nao|no|none|nenhum|nenhuma|never|nunca|not applicable|n\/a)(?:\b|$)|^sem experiencia/.test(
      normalized(option),
    ),
  );
  if (options?.length)
    return personalQuestion(question)
      ? decline || negative
      : negative || decline;
  const english =
    !/[áàâãéêíóôõúç]|voce|qual|como|experiencia|possui|tem |parentesco|familiar|acessibilidade|genero|raca|idade/i.test(
      question,
    );
  if (personalQuestion(question))
    return english ? "Prefer not to disclose" : "Prefiro não informar";
  if (
    /quantos|how many|anos de experiencia|years of experience/.test(
      normalized(question),
    )
  )
    return "0";
  return english ? "No" : "Não";
}
