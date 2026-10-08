import type { Source } from "../shared/types";
import { portals } from "../shared/portals";
export type VerifiedOrganization = {
  type: Source["type"];
  company: string;
  board: string;
  sector: string;
  country: string;
  referenceUrl: string;
  coverage: string;
};
export const VERIFIED_SOURCES: VerifiedOrganization[] = Object.entries(
  portals,
).map(([board, portal]) => ({
  type: "portal",
  company: portal.name,
  board,
  sector: "Portal de empregos",
  country: "br",
  referenceUrl: portal.url,
  coverage: portal.coverage,
}));
