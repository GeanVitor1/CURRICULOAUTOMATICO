import type { ApplicationDestination, Job, Source } from "../shared/types";
import { WP_JOBS_EVIDENCE } from "./company-board";
export type AtsPlatform = ApplicationDestination["platform"];
export function detectAts(
  value: string,
): { platform: AtsPlatform; board?: string; postingId?: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const segments = url.pathname.split("/").filter(Boolean),
    host = url.hostname.toLowerCase();
  if(host==='jobs.quickin.io' && /^[a-z0-9_-]{1,100}$/i.test(segments[0]||'') && segments[1]==='jobs' && /^[a-f0-9]{24}$/.test(segments[2]||'') && (segments.length===3 || (segments.length===4&&segments[3]==='apply')))
    return {platform:'quickin',board:segments[0],postingId:segments[2]};
  if (/^[a-z0-9-]+\.gupy\.io$/.test(host) && segments[0] === 'job' && segments[1]?.length < 500) {
    try {
      const data=JSON.parse(Buffer.from(decodeURIComponent(segments[1]),'base64').toString('utf8'));
      const id=String(data.jobId);
      if(/^\d{1,14}$/.test(id))return {platform:'gupy',board:host.split('.')[0],postingId:id};
    }catch{/* Only explicit numeric publisher IDs are recognized. */}
  }
  if (
    /^[a-z0-9-]+\.pandape\.infojobs\.com\.br$/.test(host) &&
    segments[0]?.toLowerCase() === "detail" &&
    /^\d+$/.test(segments[1] || "")
  )
    return {
      platform: "pandape",
      board: host.split(".")[0],
      postingId: segments[1],
    };
  if (
    [
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "boards.eu.greenhouse.io",
      "job-boards.eu.greenhouse.io",
    ].includes(host) &&
    segments[1] === "jobs" &&
    /^\d+$/.test(segments[2] || "")
  )
    return {
      platform: "greenhouse",
      board: segments[0],
      postingId: segments[2],
    };
  if (
    ["jobs.lever.co", "jobs.eu.lever.co"].includes(host) &&
    /^[a-f0-9-]{36}$/.test(segments[1] || "")
  )
    return { platform: "lever", board: segments[0], postingId: segments[1] };
  if (host === "jobs.ashbyhq.com" && /^[a-f0-9-]{36}$/.test(segments[1] || ""))
    return { platform: "ashby", board: segments[0], postingId: segments[1] };
  if (
    /^[a-z0-9-]+\.gupy\.io$/.test(host) &&
    segments[0] === "jobs" &&
    /^\d+$/.test(segments[1] || "")
  )
    return {
      platform: "gupy",
      board: host.split(".")[0],
      postingId: segments[1],
    };
  if (host === "jobs.smartrecruiters.com" && segments.length >= 2)
    return {
      platform: "smartrecruiters",
      board: segments[0],
      postingId: segments[1].split("-")[0],
    };
  if (
    /^[a-z0-9-]+\.[a-z0-9-]+\.myworkdayjobs\.com$/.test(host) &&
    /\/job\//.test(url.pathname)
  )
    return { platform: "workday" };
  return null;
}
const publicFormPlatforms = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
] as const;
/** Operator opt-in for supported public forms; never grants private API access. */
export function enabledPublicFormPlatforms() {
  const configured = (process.env.ATS_PUBLIC_FORM_PLATFORMS || "")
    .split(",")
    .map((value) => value.trim());
  return publicFormPlatforms.filter((platform) =>
    configured.includes(platform),
  );
}
/** Custom company forms still require an exact board/domain grant. */
export function destinationBrowserAllowed(
  destination: Pick<ApplicationDestination, "url" | "platform">,
) {
  if (
    !["greenhouse", "lever", "ashby", "smartrecruiters", "quickin", "company"].includes(
      destination.platform,
    )
  )
    return false;
  const detected = detectAts(destination.url);
  let url: URL;
  try {
    url = new URL(destination.url);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return false;
  // A caller cannot label an unrelated host as a supported ATS.
  if (
    detected
      ? detected.platform !== destination.platform
      : destination.platform !== "company"
  )
    return false;
  const key = detected?.board
    ? `${detected.platform}:${detected.board}`
    : `company:${url.hostname}`;
  const boardAllowed = (process.env.ATS_BROWSER_AUTHORIZED || "")
    .split(",")
    .map((v) => v.trim())
    .includes(key);
  const nativeCompanyAllowed = destination.platform === 'company' &&
    (process.env.COMPANY_FORM_AUTHORIZED || '').split(',').map(value=>value.trim()).includes(url.hostname);
  return (
    boardAllowed || nativeCompanyAllowed ||
    (!!detected &&
      enabledPublicFormPlatforms().some(
        (platform) => platform === detected.platform,
      ))
  );
}
export function independentExecutionAvailable() {
  if(process.env.COMPANY_FORM_AUTHORIZED?.trim())return true;
  return (
    (!!process.env.ATS_BROWSER_AUTHORIZED?.trim() ||
      enabledPublicFormPlatforms().length > 0) &&
    ((process.env.ATS_EXECUTION_LOCAL === "true" && !process.env.VERCEL) ||
      !!process.env.PORTAL_CLOUD_SNAPSHOT_ID)
  );
}
/** A native company adapter does not supply a browser to unrelated ATS forms. */
export function destinationExecutionAvailable(destination: ApplicationDestination) {
  if (!destinationBrowserAllowed(destination)) return false;
  if (destination.platform === "company" && destination.evidence.includes(WP_JOBS_EVIDENCE)) return true;
  return (process.env.ATS_EXECUTION_LOCAL === "true" && !process.env.VERCEL) ||
    (!!process.env.PORTAL_CLOUD_SNAPSHOT_ID && process.env.PORTAL_CLOUD_SNAPSHOT_ID !== "[SENSITIVE]");
}
export function configuredAtsSources(): Source[] {
  try {
    const values: unknown = JSON.parse(
      process.env.DISCOVERY_ATS_BOARDS || "[]",
    );
    if (!Array.isArray(values)) return [];
    return values.slice(0, 30).flatMap((entry) => {
      if (
        !entry ||
        !["greenhouse", "lever", "ashby", "smartrecruiters"].includes(
          entry.type,
        ) ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.board || "") ||
        typeof entry.company !== "string" ||
        entry.company.length > 200
      )
        return [];
      return [
        {
          id: `catalog:${entry.type}:${entry.board}`,
          type: entry.type,
          board: entry.board,
          company: entry.company,
          enabled: true,
          discovery: true,
          application: false,
          status: "Catálogo público",
        } as Source,
      ];
    });
  } catch {
    return [];
  }
}
export function publicJob(job: Job): Job {
  const { application: _application, automation: _automation, ...copy } = structuredClone(job);
  return {
    ...copy,
    saved: false,
    discarded: false,
    match: {
      score: 0,
      strengths: [],
      gaps: [],
      blockers: [],
      matchedSkills: [],
      missingSkills: [],
      radar: false,
      explanation: "",
    },
  };
}
