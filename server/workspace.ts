import {
  defaultFilters,
  defaultProfile,
  defaultRoutine,
  type Workspace,
} from "../shared/types";

/** Account initialization contains no sample opportunities or fabricated history. */
export function createWorkspace(
  name: string,
  email: string,
  demo = false,
): Workspace {
  return {
    profile: { ...structuredClone(defaultProfile), name, email },
    filters: structuredClone(defaultFilters),
    routine: { ...defaultRoutine },
    sources: [],
    jobs: [],
    applications: [],
    resumes: [],
    notices: [],
    runs: [],
    demo,
    searchProfiles: [],
    onboarding: {
      step: 0,
      completed: false,
      answers: {
        goal: "",
        location: "",
        resumeChoice: "",
        experience: "",
        modalities: [],
        contracts: [],
        salaryMin: 0,
      },
    },
    infrastructure: {
      database: "",
      queue: "",
      automatic: false,
      worker: false,
    },
  };
}
