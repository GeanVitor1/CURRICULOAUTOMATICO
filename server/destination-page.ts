import { createHash } from "node:crypto";
import type { ApplicationDestination, Job } from "../shared/types";
import { decode } from "./html";
import { detectAts } from "./ats-registry";
import { comparePublications } from "./job-identity";
import type { PublicPage } from "./public-web";
import { load } from "cheerio";
import { classify } from "./engine";
import { companyIdentity } from "./job-identity";
import {WP_JOBS_EVIDENCE,wpJobsForm} from './company-board';

export function structuredJobs(html: string): Record<string, any>[] {
  const found: Record<string, any>[] = [];
  const visit = (value: any, depth = 0) => {
    if (depth > 10 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((v) => visit(v, depth + 1));
      return;
    }
    if ([value["@type"]].flat().includes("JobPosting")) found.push(value);
    if (value["@graph"]) visit(value["@graph"], depth + 1);
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      /* Malformed publisher markup is not evidence. */
    }
  }
  return found.slice(0, 20);
}
export function applicationLinks(page: PublicPage, title?: string) {
  const $ = load(page.html),
    links: { url: string; priority: number }[] = [];
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const wanted = title ? normalize(title) : "";
  for (const node of $("a[href]").toArray()) {
    const label = normalize($(node).text());
    const sameTitle = !!wanted && label.includes(wanted);
    if (
      !sameTitle &&
      !/^(apply(?: now| for this (?:job|position))?|candidat(?:e se|ar me|ar se)(?: agora)?|inscrev(?:a se|er se)|carreiras|careers|ver vagas|nossas vagas)$/.test(
        label,
      )
    )
      continue;
    try {
      const url = new URL($(node).attr("href")!, page.url);
      if (
        /\/Account\/|\/login(?:[/.?]|$)|\/entrevistas|\/candidates?\//i.test(
          url.pathname,
        ) ||
        /^(login|accounts|auth)\./.test(url.hostname)
      )
        continue;
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.hash
      )
        links.push({ url: url.href, priority: sameTitle ? 0 : 1 });
    } catch {
      /* Ignore broken links. */
    }
  }
  return [
    ...new Set(
      links.sort((a, b) => a.priority - b.priority).map((item) => item.url),
    ),
  ].slice(0, 8);
}
/** Follow only published employer/profile links, never a guessed career URL. */
export function employerCareerLinks(page: PublicPage, job: Job) {
  const url = new URL(page.url);
  if (url.hostname !== "www.infojobs.com.br") return [];
  const $ = load(page.html),
    links: string[] = [],
    company = companyIdentity(job.company);
  if (/__\d+\.aspx/.test(url.pathname)) {
    $('#detailContainer a[href*="empresa-"]').each((_index, node) => {
      if (
        companyIdentity($(node).text().replace(/\s+/g, " ").trim()) === company
      ) {
        const href = $(node).attr("href");
        if (href) links.push(new URL(href, page.url).href);
      }
    });
  }
  if (
    /^\/empresa-/.test(url.pathname) &&
    companyIdentity($("h1").first().text()) === company
  ) {
    $("a[href]").each((_index, node) => {
      if (
        /^site oficial(?: no infojobs)?$/i.test(
          $(node).text().replace(/\s+/g, " ").trim(),
        )
      ) {
        const href = $(node).attr("href");
        if (href) {
          const target = new URL(href, page.url);
          if (target.protocol === "https:") links.push(target.href);
        }
      }
    });
  }
  return [...new Set(links)].slice(0, 3);
}
export function publicationFromStructured(
  original: Job,
  data: Record<string, any>,
  pageUrl: string,
): Job | null {
  const company = data.hiringOrganization?.name;
  if (
    typeof data.title !== "string" ||
    typeof company !== "string" ||
    typeof data.description !== "string"
  )
    return null;
  const locations = [data.jobLocation]
    .flat()
    .filter(Boolean)
    .map((v) =>
      [
        v.address?.addressLocality,
        v.address?.addressRegion,
        v.address?.addressCountry,
      ]
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean);
  const ats = detectAts(pageUrl);
  return {
    ...original,
    title: decode(data.title),
    company: decode(company),
    url: pageUrl,
    description: decode(data.description),
    location:
      locations.join("; ") ||
      [data.applicantLocationRequirements]
        .flat()
        .filter(Boolean)
        .map((value) => (typeof value.name === "string" ? value.name : ""))
        .filter(Boolean)
        .join("; ") ||
      "Não informado",
    ...classify(`${data.title} ${data.description}`),
    modality:
      data.jobLocationType === "TELECOMMUTE" ? "Remoto" : "Não informado",
    requisitionId:
      typeof data.identifier?.value === "string"
        ? data.identifier.value
        : undefined,
    companyDomain:
      typeof data.hiringOrganization?.sameAs === "string"
        ? data.hiringOrganization.sameAs
        : undefined,
    department: undefined,
    applicationUrls: [],
    availability:
      data.validThrough && Date.parse(data.validThrough) < Date.now()
        ? "closed"
        : "active",
    origins: ats?.postingId
      ? [
          {
            source: ats.platform,
            url: pageUrl,
            id: `${ats.board}:${ats.postingId}`,
          },
        ]
      : [{ source: "company", url: pageUrl, id: pageUrl }],
    destinations: [],
    resolution: undefined,
  };
}
/** Enrich a supplied InfoJobs publication from its actual public detail page. No login. */
export function enrichOriginFromPage(
  original: Job,
  page: PublicPage,
): Job | null {
  if (
    new URL(page.url).hostname !== "www.infojobs.com.br" ||
    !/__\d+\.aspx/.test(new URL(page.url).pathname)
  )
    return null;
  const $ = load(page.html);
  const title = $(".js_vacancyHeaderTitle").first().text().trim();
  const description = $("#detailContainer p.white-space-pre-line")
    .first()
    .text()
    .trim();
  const company = $('#detailContainer a[href*="empresa-"]')
    .toArray()
    .map((node) => $(node).text().replace(/\s+/g, " ").trim())
    .find((value) => /[a-z]/i.test(value));
  if (
    !title ||
    !description ||
    !company ||
    companyIdentity(company) !== companyIdentity(original.company)
  )
    return null;
  const content = $("#detailContainer").text();
  const location = /Todo Brasil/i.test(content) ? "Brasil" : original.location;
  return {
    ...original,
    title,
    description,
    company,
    location,
    ...classify(`${title} ${description}`),
    modality: /Home office/i.test(content) ? "Remoto" : original.modality,
  };
}
export function destinationFromPage(
  original: Job,
  candidate: Job,
  page: PublicPage,
  linkedByPublication = false,
): ApplicationDestination | null {
  const match = comparePublications(original, candidate);
  if (!match.verified || [404, 410].includes(page.status) || page.status >= 400)
    return null;
  const ats = detectAts(page.url);
  const permittedCompanyDomain =
    original.companyDomain &&
    (() => {
      try {
        return (
          new URL(original.companyDomain).hostname ===
          new URL(page.url).hostname
        );
      } catch {
        return false;
      }
    })();
  if (!ats && !permittedCompanyDomain) return null;
  const blocked =
    /captcha|verify you are human|access denied|humans only/i.test(
      decode(page.html),
    );
  const login =
    /type\s*=\s*["']password["']/i.test(page.html) &&
    !/<input\b[^>]*type\s*=\s*["']file["']/i.test(page.html);
  const formFound =
    /<form\b/i.test(page.html) &&
    /type\s*=\s*["']file["']|resume|curr[ií]culo/i.test(page.html);
  const at = Date.now();
  return {
    id: createHash("sha256").update(page.url).digest("hex").slice(0, 24),
    url: page.url,
    platform: ats?.platform || "company",
    publicationUrl: candidate.url,
    verifiedAt: new Date(at).toISOString(),
    expiresAt: new Date(at + 24 * 3600000).toISOString(),
    confidence: match.confidence,
    evidence: [
      ...match.evidence,
      "Publicação lida no destino público.",
      ...(!ats && permittedCompanyDomain && wpJobsForm(page) ? [WP_JOBS_EVIDENCE] : []),
      ...(linkedByPublication
        ? ["Link de candidatura encontrado na publicação."]
        : []),
    ],
    company: candidate.company,
    requisitionId: candidate.requisitionId,
    state: blocked ? "blocked" : login ? "login_required" : "verified",
    formFound,
    method: "assisted",
  };
}
