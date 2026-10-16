import type { Workspace } from "../shared/types";
import { dailySubmissionAttempts } from "./submission-attempts";
export type SubmissionState = {
  userId: string;
  demo: boolean;
  routine: Workspace["routine"];
  sending: boolean;
  day: string;
  attempts: number;
  next: { id: string; resumeId: string | null; historyLength: number } | null;
};
export function submissionState(w: Workspace, userId: string): SubmissionState {
  const next = w.applications.find((a) => a.status === "Aguardando aprovação");
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
        }
      : null,
  };
}
