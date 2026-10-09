import type { Source } from "../shared/types";
import { portals, candidatePortals } from "../shared/portals";
export type VerifiedOrganization = {
  type: Source["type"];
  company: string;
  board: string;
  sector: string;
  country: string;
  referenceUrl: string;
  coverage: string;
};
export const VERIFIED_SOURCES: VerifiedOrganization[] = candidatePortals.map(
  (board) => ({
    type: "portal",
    company: portals[board].name,
    board,
    sector: "Portal de empregos",
    country: "br",
    referenceUrl: portals[board].url,
    coverage: portals[board].coverage,
  }),
);
