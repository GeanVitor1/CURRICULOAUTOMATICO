import type { Job, Workspace } from "../shared/types";
import { isJobUrl, isPortalId } from "../shared/portals";
import { automaticPortals, supportsAutomatic } from "./connectors";

export function submissionRoute(w: Workspace, job: Job, nativeSites: string[]) {
  const portalMatches = (
    source: Workspace["sources"][number],
    sites: string[],
  ) =>
    source.enabled &&
    source.type === "portal" &&
    sites.includes(source.board) &&
    isPortalId(source.board) &&
    isJobUrl(source.board, job.url) &&
    (!w.interview?.completed ||
      w.interview.answers.sites.some((site) => site === source.board));
  // A configured API takes precedence over a browser session that may need human verification.
  const gateway =
    supportsAutomatic() &&
    w.sources.find(
      (source) =>
        (source.enabled &&
          source.type === "authorized" &&
          source.application &&
          source.company === job.company) ||
        portalMatches(source, automaticPortals()),
    );
  if (gateway) return { source: gateway, method: "webhook" as const };
  const native = w.sources.find((source) => portalMatches(source, nativeSites));
  return native ? { source: native, method: "browser" as const } : null;
}
export { dailySubmissionAttempts } from "./submission-attempts";
