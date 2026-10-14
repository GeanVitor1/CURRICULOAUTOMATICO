import { z } from "zod";
import type { Profile } from "../shared/types";
import { extractSkills, normalize } from "./engine";
import { coachingSchema } from "./resume-review";

const fields = [
  "name",
  "headline",
  "location",
  "languages",
  "education",
  "experience",
  "availability",
  "github",
  "portfolio",
] as const;
const evidence = z.string().max(10000);
export const extractedSchema = z.object({
  fields: z
    .array(
      z.object({
        field: z.enum(fields),
        value: z.string().max(10000),
        evidence,
      }),
    )
    .max(30),
  skills: z.array(z.object({ name: z.string().max(100), evidence })).max(60),
  years: z.number().min(0).max(70).nullable(),
  yearsEvidence: evidence,
});
export const analysisResponseSchema = extractedSchema.extend({
  coaching: coachingSchema.nullable(),
});
export function verifyEvidence(input: unknown, text: string): Partial<Profile> {
  const result = extractedSchema.parse(input),
    original = normalize(text),
    profile: Partial<Profile> = { skills: [], confirmed: false };
  const isQuote = (quote: string) =>
    quote.trim().length >= 2 && original.includes(normalize(quote));
  for (const claim of result.fields)
    if (
      isQuote(claim.evidence) &&
      claim.value.trim() &&
      normalize(claim.evidence).includes(normalize(claim.value))
    ) {
      if (
        ["github", "portfolio"].includes(claim.field) &&
        !/^https?:\/\//.test(claim.value)
      )
        continue;
      const current = profile[claim.field];
      (profile as any)[claim.field] =
        current && ["experience", "education"].includes(claim.field)
          ? `${current}\n${claim.value}`.slice(
              0,
              claim.field === "education" ? 5000 : 10000,
            )
          : claim.value.slice(
              0,
              claim.field === "experience"
                ? 10000
                : claim.field === "education"
                  ? 5000
                  : 200,
            );
    }
  for (const skill of result.skills)
    if (
      isQuote(skill.evidence) &&
      extractSkills(text, [skill.name]).some(
        (name) => normalize(name) === normalize(skill.name),
      ) &&
      (normalize(skill.evidence).includes(normalize(skill.name)) ||
        extractSkills(skill.evidence).some(
          (s) => normalize(s) === normalize(skill.name),
        ))
    )
      profile.skills!.push(
        extractSkills(skill.name).find((name) =>
          extractSkills(skill.evidence).includes(name),
        ) ||
          extractSkills(text).find(
            (name) => normalize(name) === normalize(skill.name),
          ) ||
          skill.name.trim(),
      );
  profile.skills = [...new Set(profile.skills)];
  if (
    result.years !== null &&
    isQuote(result.yearsEvidence) &&
    !/\b(?:nao|sem|menos de|no minimo|requisito|desejavel)\b/.test(
      normalize(result.yearsEvidence),
    ) &&
    new RegExp(
      `(?:^|\\D)${String(result.years).replace(".", "[.,]")}\\s*(?:anos?|years?)`,
    ).test(normalize(result.yearsEvidence))
  )
    profile.years = result.years;
  return profile;
}
