import type { Workspace } from "../../shared/types";
import { applyCandidateDetails } from "../../server/candidate-details";

export function confirmCandidateDetails(w: Workspace) {
  applyCandidateDetails(w, {
    phone: "11999990000",
    location: "São Paulo, SP",
    years: 2,
    salaryDesired: 3500,
    acceptsPj: true,
    compensationDisclosure: "prefer_not_to_say",
    confirmation: true,
  });
}
