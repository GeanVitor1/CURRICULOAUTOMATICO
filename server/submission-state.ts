import type { Workspace } from "../shared/types";
import { dailySubmissionAttempts } from "./submission-attempts";
import { singleSubmissionAuthorized, emailExplicitlyRejected } from "./submission-consent";
import { resumableSubmission } from "./submission-resume";
export type SubmissionState = {
  userId: string;
  demo: boolean;
  routine: Workspace["routine"];
  sending: boolean;
  day: string;
  attempts: number;
  next: {
    id: string;
    resumeId: string | null;
    historyLength: number;
    single?: boolean;
    resuming?: boolean;
  } | null;
};
export function submissionState(w: Workspace, userId: string): SubmissionState {
  const candidates = w.applications.filter(
    (a) =>
      a.status === "Aguardando aprovação" &&
      (a.singleSubmission
        ? singleSubmissionAuthorized(a)
        : w.routine.enabled && w.routine.mode === "automatic"),
  );
  const next = candidates.find(a=>a.resumeState?.kind==="ats" && !a.missingQuestions?.length && resumableSubmission(a,a.resumeState.destinationUrl)) || candidates[0];
  return {
    userId,
    demo: w.demo,
    routine: w.routine,
    sending: w.applications.some((a) => a.status === "Enviando"),
    day: new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    }),
    attempts: dailySubmissionAttempts(w),
    next: next
      ? {
          id: next.id,
          resumeId: next.resumeId,
          historyLength: next.history.length,
          single: !!next.singleSubmission,
          resuming:
            emailExplicitlyRejected(next) || (!!next.resumeState &&
            resumableSubmission(next, next.resumeState.destinationUrl)),
        }
      : null,
  };
}
