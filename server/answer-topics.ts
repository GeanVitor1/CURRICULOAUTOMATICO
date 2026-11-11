/**
 * Server entry point for answer topics and memory (logic lives in shared/ so the UI can group pending questions).
 * AI topic suggestion: intentionally not enabled. If added, it may only SUGGEST a topic (never a value),
 * must be cached by normalized question text and stay behind a feature flag.
 */
import type { Job, Profile } from "../shared/types";
import { classifyQuestion, effectiveAnswerMemory, resolveMemoryAnswer } from "../shared/answer-topics";
import { salaryOption } from "./salary-options";
export * from "../shared/answer-topics";

export function memoryAnswer(question: string, profile: Profile, job: Pick<Job, "location" | "modality" | "title">, options?: string[]) {
  if (!profile.confirmed) return undefined;
  const match = classifyQuestion(question, options);
  if (!match) return undefined;
  return resolveMemoryAnswer(question, match, effectiveAnswerMemory(profile), { location: job.location, modality: job.modality, title: job.title }, options, salaryOption);
}
