import { describe, expect, it } from "vitest";
import { createWorkspace } from "../server/workspace";
import {
  gettingStarted,
  needsCandidateDetailsPage,
} from "../shared/getting-started";
import { confirmCandidateDetails } from "./fixtures/candidate-details";
function workspace() {
  return createWorkspace("Pessoa", "demo@example.test");
}
function withResume() {
  const w = workspace();
  w.resumes = [{ id: "resume", approved: false } as any];
  return w;
}
describe("Guidance based on the saved account", () => {
  it("welcomes a new account with a resume first, without forcing the full data form", () => {
    const w = workspace();
    w.infrastructure.candidateDetailsRequired = true;
    expect(gettingStarted(w)).toMatchObject({
      completed: 0,
      current: 0,
      configured: false,
      next: { id: "curriculo" },
    });
    for (const page of ["automacao", "curriculo", "conta", "candidaturas"])
      expect(needsCandidateDetailsPage(w, page)).toBe(false);
  });
  it("keeps the required data check before preferences after a resume is imported", () => {
    const w = withResume();
    expect(gettingStarted(w).next.id).toBe("dados");
    expect(needsCandidateDetailsPage(w, "preferencias")).toBe(true);
    expect(needsCandidateDetailsPage(w, "curriculo")).toBe(false);
  });
  it("resumes the next real step after confirmed details without approving the resume itself", () => {
    const w = withResume();
    confirmCandidateDetails(w);
    expect(gettingStarted(w)).toMatchObject({
      completed: 2,
      next: { id: "preferencias" },
      configured: false,
    });
    expect(w.resumes[0].approved).toBe(false);
    expect(needsCandidateDetailsPage(w, "preferencias")).toBe(false);
  });
  it("does not turn guide flags or a LinkedIn observation into setup or automatic submission authorization", () => {
    const w = workspace();
    w.guide = { step: 5, completed: true, dismissed: true, active: false };
    w.onboarding!.completed = true;
    w.infrastructure.localPortalLogins = {
      linkedin: {
        observedAt: new Date().toISOString(),
        expiresAt: Date.now() + 900000,
        extensionVersion: "2.0.8",
      },
    };
    const before = JSON.stringify(w);
    expect(gettingStarted(w).completed).toBe(0);
    expect(gettingStarted(w).configured).toBe(false);
    expect(JSON.stringify(w)).toBe(before);
  });
  it("requires approval and preferences bound to the current resume", () => {
    const w = withResume();
    confirmCandidateDetails(w);
    w.profile.confirmed = true;
    w.resumes[0].approved = true;
    w.interview = {
      completed: true,
      step: 5,
      answers: { resumeId: "older-resume" },
    } as any;
    expect(gettingStarted(w).configured).toBe(false);
    w.interview!.answers.resumeId = "resume";
    expect(gettingStarted(w).configured).toBe(true);
    expect(gettingStarted(w).completed).toBe(3);
    w.routine.enabled = true;
    expect(gettingStarted(w).completed).toBe(4);
    w.routine.enabled = false;
    expect(gettingStarted(w).configured).toBe(true);
  });
  it("keeps twenty accounts with different setup stages independent", () => {
    const accounts = Array.from({ length: 20 }, (_, i) =>
      i % 2 ? withResume() : workspace(),
    );
    const before = JSON.stringify(accounts);
    accounts.forEach((w, i) =>
      expect(gettingStarted(w).next.id).toBe(i % 2 ? "dados" : "curriculo"),
    );
    expect(JSON.stringify(accounts)).toBe(before);
  });
});
