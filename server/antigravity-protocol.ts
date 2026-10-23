import { z } from "zod";

export const antigravityJobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        company: z.string().min(2).max(200),
        url: z.string().url().max(2000),
        citationUrl: z.string().url().max(3000).optional(),
        location: z.string().max(200),
        description: z.string().min(20).max(8000),
      }),
    )
    .max(10),
});

export function isGoogleCitation(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "vertexaisearch.cloud.google.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/grounding-api-redirect\/[A-Za-z0-9_=-]{20,}$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function selectSearchModel(catalog: string) {
  return catalog
    .split(/\r?\n/)
    .map((line) => line.split(/\s/)[0])
    .find((slug) => /^gemini-[\w.-]*flash[\w.-]*-low$/.test(slug));
}

export function authorizationUrl(text: string) {
  for (const match of text.matchAll(
    /https:\/\/accounts\.google\.com\/[^\s"<>]+/g,
  )) {
    try {
      const url = new URL(match[0]);
      if (
        url.pathname === "/o/oauth2/auth" &&
        url.searchParams.get("redirect_uri") ===
          "https://antigravity.google/oauth-callback" &&
        url.searchParams.get("code_challenge") &&
        url.searchParams.get("state")
      )
        return url.href;
    } catch {
      /* Ignore unrelated diagnostics. */
    }
  }
  return null;
}

/** Only actual read/search tool output is evidence. A model's own citations are not. */
export function parseAntigravitySearch(output: string) {
  const verifiedUrls = new Set<string>();
  let result: any;
  let searchPerformed = false;
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.event === "result") result = event.result;
    const step = event.step_update;
    const tool = step?.tool_info;
    if (
      step?.state !== "DONE" ||
      step?.step_type !== "tool" ||
      tool?.error ||
      ![
        "search_web",
        "web_search",
        "google_search",
        "read_url_content",
      ].includes(tool?.name)
    )
      continue;
    searchPerformed = true;
    const evidence =
      typeof tool.output === "string"
        ? tool.output
        : JSON.stringify(tool.output ?? "");
    for (const match of evidence.matchAll(/https:\/\/[^\s"<>\\)\]]+/g)) {
      try {
        verifiedUrls.add(new URL(match[0].replace(/[.,;]+$/, "")).href);
      } catch {
        /* Not a URL. */
      }
    }
  }
  if (result?.status !== "SUCCESS") throw new Error("CLI_SEARCH_FAILED");
  const response =
    result.structured_output ??
    JSON.parse(
      result.response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  const parsed = antigravityJobsSchema.parse(response);
  const googleCitationUrls = new Set<string>();
  // CLI 1.3.5 omits native search output from its event stream. The opaque
  // Google references it returns can instead be verified by resolving them
  // on Google's service. A claimed plain URL remains insufficient evidence.
  if (searchPerformed)
    for (const job of parsed.jobs) {
      for (const url of [job.url, job.citationUrl])
        if (url && isGoogleCitation(url)) googleCitationUrls.add(url);
    }
  return { ...parsed, verifiedUrls, googleCitationUrls, searchPerformed };
}

export const antigravitySettings = {
  useG1Credits: false,
  permissions: {
    allow: [
      "read_url(google.com)",
      "read_url(linkedin.com)",
      "read_url(gupy.io)",
      "read_url(glassdoor.com)",
      "read_url(glassdoor.com.br)",
      "read_url(infojobs.com.br)",
      "read_url(indeed.com)",
      "read_url(indeed.com.br)",
      "read_url(greenhouse.io)",
      "read_url(lever.co)",
      "read_url(ashbyhq.com)",
      "read_url(smartrecruiters.com)",
      "read_url(vertexaisearch.cloud.google.com)",
    ],
    deny: [
      "command(*)",
      "unsandboxed(*)",
      "execute_url(*)",
      "mcp(*)",
      "read_file(*)",
      "write_file(*)",
    ],
    ask: [],
  },
};
