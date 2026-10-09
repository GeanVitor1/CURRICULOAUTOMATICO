import type { Workspace } from "../shared/types";
import {
  localResumeTargets,
  supportsTarget,
  TARGETS_VERSION,
} from "./resume-targets";
import { extractSkills } from "./engine";

/** Repair saved suggestions once, without silently replacing a person's chosen search. */
export function upgradeResumeTargets(w: Workspace) {
  for (const resume of w.resumes) {
    if (resume.targetsVersion === TARGETS_VERSION) continue;
    const old = resume.targets || [];
    const targets =
      resume.targetsMethod === "gemini"
        ? old.filter((target) =>
            supportsTarget(target.title, target.evidence, resume.text),
          )
        : localResumeTargets(resume.text, resume.suggestion || w.profile);
    const retained = (resume.targetTitles || []).filter((title) =>
      targets.some((target) => target.title === title),
    );
    if (
      resume.targetsConfirmed &&
      retained.length !== (resume.targetTitles || []).length
    ) {
      // Remove only titles confirmed from this resume; preserve separately entered preferences.
      const invalid = (resume.targetTitles || []).filter(
        (title) => !retained.includes(title),
      );
      w.filters.titles = w.filters.titles.filter(
        (title) => !invalid.includes(title),
      );
      resume.targetsConfirmed = false;
    }
    resume.targetTitles = retained;
    resume.targets = targets;
    resume.targetsVersion = TARGETS_VERSION;
    if (resume.targetsMethod !== "gemini") {
      resume.targetsMethod = "local";
      const oldSkills = resume.skills;
      resume.skills = extractSkills(resume.text);
      if (resume.suggestion) resume.suggestion.skills = resume.skills;
      // Remove extraction artifacts only when no other resume supports that skill.
      const removed = oldSkills.filter(
        (skill) => !resume.skills.includes(skill),
      );
      w.profile.skills = w.profile.skills.filter(
        (skill) =>
          !removed.includes(skill) ||
          w.resumes.some(
            (r) => r.id !== resume.id && extractSkills(r.text).includes(skill),
          ),
      );
      resume.targetsMessage =
        "Atualizamos a leitura do currículo para considerar sua atuação profissional. Revise e confirme os cargos para a busca.";
    }
  }
}
