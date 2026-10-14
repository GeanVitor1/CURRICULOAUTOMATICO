import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { parseResume } from "../server/engine";
import { generateGemini, geminiModel } from "../server/gemini";
import {
  analysisResponseSchema,
  verifyEvidence,
} from "../server/resume-extraction";
import {
  buildResumeReview,
  verifyCoaching,
  type ResumeCoaching,
} from "../server/resume-review";
import { minimizeResume } from "../server/resume-privacy";
import { localResumeTargets, supportsTarget } from "../server/resume-targets";
import {
  RESUME_ANALYSIS_VERSION,
  RESUME_EXTERNAL_TEXT_LIMIT,
  resumeAnalysisInstructions,
} from "../server/resume-analysis-prompt";
import { resumeAnalysisCases } from "../tests/fixtures/resume-analysis-cases";

const live = process.argv.includes("--live");
const selectedCase = process.argv
  .find((arg) => arg.startsWith("--case="))
  ?.slice(7);
const cases = selectedCase
  ? resumeAnalysisCases.filter((sample) => sample.id === selectedCase)
  : resumeAnalysisCases;
if (!cases.length) throw new Error("Unknown synthetic evaluation case");
const results = [];
for (const sample of cases) {
  try {
    const input = minimizeResume(sample.text, RESUME_EXTERNAL_TEXT_LIMIT);
    let profile = parseResume(sample.text);
    let coaching: ResumeCoaching = [];
    let schemaValid = true;
    if (live) {
      const response = await generateGemini(input, {
        instructions: resumeAnalysisInstructions,
        schema: z.toJSONSchema(analysisResponseSchema),
      });
      const raw = JSON.parse(response.text);
      schemaValid = analysisResponseSchema.safeParse(raw).success;
      const verified = verifyEvidence(raw, input);
      // Evaluate external extraction itself, without hiding misses behind local fallback.
      profile = verified;
      coaching = verifyCoaching(raw.coaching, input);
    }
    const targets = localResumeTargets(sample.text, profile);
    const review = buildResumeReview(sample.text, profile, {
      method: live ? "gemini" : "local",
      analyzedText: input,
      coaching,
    });
    const checks = [
      { check: "response-schema", passed: schemaValid },
      ...sample.expectedSkills.map((skill) => ({
        check: `identified:${skill}`,
        passed: profile.skills?.includes(skill) || false,
      })),
      ...sample.forbiddenSkills.map((skill) => ({
        check: `excluded:${skill}`,
        passed: !profile.skills?.includes(skill),
      })),
      ...sample.expectedTargets.map((title) => ({
        check: `target:${title}`,
        passed: targets.some((target) => target.title === title),
      })),
      ...sample.forbiddenTargets.map((title) => ({
        check: `unrelated-target:${title}`,
        passed:
          !supportsTarget(
            title,
            sample.text
              .split("\n")
              .find((line) => /Competências|Experiência/.test(line)) ||
              sample.text.split("\n")[0],
            sample.text,
          ) && !targets.some((target) => target.title === title),
      })),
      {
        check: "literal-strengths",
        passed: review.strengths.every((item) => input.includes(item.evidence)),
      },
      {
        check: "coaching-evidence",
        passed:
          !coaching || coaching.every((item) => input.includes(item.evidence)),
      },
    ];
    const result = {
      id: sample.id,
      passed: checks.every((check) => check.passed),
      checks,
      coachingItems: coaching?.length || 0,
      skills: profile.skills,
    };
    results.push(result);
    console.log(
      JSON.stringify({
        case: sample.id,
        passed: result.passed,
        failedChecks: checks
          .filter((check) => !check.passed)
          .map((check) => check.check),
        coachingItems: result.coachingItems,
      }),
    );
  } catch (error) {
    results.push({
      id: sample.id,
      passed: false,
      error: error instanceof Error ? error.message : "Evaluation failed",
    });
    console.log(
      JSON.stringify({
        case: sample.id,
        passed: false,
        error: "Provider did not complete this synthetic evaluation",
      }),
    );
  }
  // Keep synthetic batch evaluations below short per-minute provider limits.
  if (live && sample !== cases[cases.length - 1]) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}
const report = {
  version: RESUME_ANALYSIS_VERSION,
  evaluatedAt: new Date().toISOString(),
  mode: live ? "live-gemini" : "local",
  model: live ? geminiModel() : null,
  scope:
    "Small authored synthetic benchmark. Measures specified extraction and validation cases, not real-world hiring outcomes or a percentage improvement.",
  cases: results.length,
  passed: results.filter((result) => result.passed).length,
  results,
};
const path = resolve(
  "artifacts",
  `resume-analysis-evaluation-${live ? "gemini" : "local"}${selectedCase ? `-${selectedCase}` : ""}.json`,
);
await mkdir(resolve("artifacts"), { recursive: true });
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    mode: report.mode,
    cases: report.cases,
    passed: report.passed,
    report: path,
  }),
);
if (report.passed !== report.cases) process.exitCode = 1;
