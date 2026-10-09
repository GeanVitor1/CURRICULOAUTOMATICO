import { defaultProfile, type Resume, type Workspace } from "../shared/types";
import { parseResume } from "./engine";

/** Professional data comes from the selected document; absence clears old evidence. */
export function applyResumeProfile(w: Workspace, resume: Resume) {
  const extracted = { ...parseResume(resume.text), ...resume.suggestion };
  for (const field of [
    "headline",
    "education",
    "experience",
    "github",
    "portfolio",
    "languages",
    "availability",
  ] as const)
    w.profile[field] = extracted[field] ?? defaultProfile[field];
  w.profile.years = extracted.years ?? null;
  w.profile.level = extracted.level || defaultProfile.level;
  w.profile.skills = [...new Set(resume.skills)];
  // Preserve account identity, but use contact explicitly provided in a document.
  if (extracted.name) w.profile.name = extracted.name;
  if (extracted.email) w.profile.email = extracted.email;
}

export function requireResumeReview(w: Workspace) {
  applyResumeProfile(w, w.resumes[0]);
  w.profile.confirmed = false;
  w.routine.enabled = false;
  w.routine.nextRun = null;
  w.resumes.forEach((resume) => {
    resume.targetsConfirmed = false;
  });
  delete w.interviewDraft;
}
