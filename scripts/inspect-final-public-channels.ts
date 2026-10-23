import { readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { chromium } from "playwright";
import { readPublicPage } from "../server/public-web";
import { structuredJobs } from "../server/destination-page";
import { protectBrowser } from "../server/portal-browser-policy";

// Anonymous public-page inspection. No credentials, personal data, uploads or submit.
const reassessment = JSON.parse(await readFile("artifacts/public-form-reassessment-2026-10-23.json", "utf8"));
const promising = reassessment.gupy.filter((j: any) => j.objectiveFiltersPass && j.professionalPass);
const indexedQuick = [
  { url: "https://vagaswbrain.gupy.io/jobs/10393211", kind: "indexed_quick_apply" },
  { url: "https://institutoeldorado.gupy.io/jobs/11386903", kind: "indexed_quick_apply" },
  { url: "https://corporativopanvel.gupy.io/jobs/10545455", kind: "indexed_quick_apply" },
];
let targets: { url: string; kind: string; jobId?: string }[] = [
  ...promising.map((j: any) => {
    const u = new URL(j.url);
    const id = JSON.parse(Buffer.from(decodeURIComponent(u.pathname.split("/")[2]), "base64").toString()).jobId;
    return { url: `${u.origin}/jobs/${id}`, kind: "existing_profile_compatible", jobId: j.id };
  }),
  ...indexedQuick,
  ...reassessment.results.filter((j: any) => j.destinations.some((d: any) => d.platform === "lever") &&
    (/Angular|\.NET Developer Senior|Mid Data Developer/.test(j.title))).slice(0, 4)
    .map((j: any) => ({ url: j.url, kind: "existing_form_professionally_excluded", jobId: j.id })),
];
const leverOnly = process.argv.includes("--lever-forms-only");
if (leverOnly) {
  const prior = JSON.parse(await readFile("artifacts/final-public-channel-inspections-2026-10-23.json", "utf8"));
  targets = prior.results.filter((r: any) => r.kind === "existing_form_professionally_excluded")
    .flatMap((r: any) => {
      const link = r.rendered?.applicationLinks.find((l: any) => new URL(l.url).hostname === "jobs.lever.co" && new URL(l.url).pathname.endsWith("/apply"));
      return link ? [{ url: link.url, kind: "existing_form_detail", jobId: r.jobId }] : [];
    });
}
const browser = await chromium.launch({ headless: true });
const results: any[] = [];
let preventedWrites = 0;
function safeUrl(value: string) { const u = new URL(value); return u.origin + u.pathname; }
async function rendered(url: string, gupy: boolean) {
  const context = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", acceptDownloads: false });
  if (gupy) await protectBrowser(context, "gupy");
  const page = await context.newPage();
  await page.route("**/*", async route => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      preventedWrites++;
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  });
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.locator("h1").first().waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const text = await page.locator("body").innerText();
    const fields = await page.locator("input,select,textarea").evaluateAll(nodes => nodes.filter(n =>
      n instanceof HTMLElement && n.offsetWidth > 0 && n.offsetHeight > 0).map(node => {
      const n = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      return { name: n.name, type: n instanceof HTMLInputElement ? n.type : n.tagName.toLowerCase(),
        label: n.labels?.[0]?.textContent?.trim().slice(0, 180) || n.getAttribute("aria-label") || n.getAttribute("placeholder") || "",
        required: n.required || n.getAttribute("aria-required") === "true",
        accept: n instanceof HTMLInputElement && n.type === "file" ? n.accept : undefined };
    }));
    const links = await page.locator("a[href]").evaluateAll(nodes => nodes.map(node => ({ label: node.textContent?.trim() || "", url: (node as HTMLAnchorElement).href })));
    const applies = links.filter(l => /candidat|apply|inscrev/i.test(l.label) && /gupy\.io|lever\.co/.test(l.url));
    return { finalUrl: safeUrl(page.url()), status: response?.status(),
      title: await page.locator("h1").first().innerText().catch(() => ""),
      closed: /inscrições encerradas|inscricoes encerradas|applications closed|não aceita mais candidaturas|no longer accepting/i.test(text),
      quickApplyVisible: /candidatura rápida|quick application|quick apply/i.test(text),
      loginVisible: /\/candidates\/signin/.test(page.url()), fields,
      applicationLinks: applies.map(l => ({ label: l.label, url: l.url })),
      challengeText: /captcha|verifique que|verifique se você é|verify you are human|access denied|acesso negado/i.test(text),
      fileInputs: await page.locator('input[type="file"]').count(),
      personalFormFilled: false, text: text.slice(0, 26000) };
  } finally { await context.close(); }
}
try {
  for (const target of targets) {
    const row: any = { ...target, at: new Date().toISOString() };
    try {
      const raw = await readPublicPage(target.url, AbortSignal.timeout(25000));
      const $ = load(raw.html);
      row.publication = { status: raw.status, url: safeUrl(raw.url),
        structured: structuredJobs(raw.html).map(v => ({ title: v.title, datePosted: v.datePosted, validThrough: v.validThrough,
          employmentType: v.employmentType, jobLocationType: v.jobLocationType,
          hiringOrganization: v.hiringOrganization?.name, jobLocation: v.jobLocation,
          applicantLocationRequirements: v.applicantLocationRequirements,
          description: load(v.description || "").text().slice(0, 16000) })),
        closedText: /inscrições encerradas|applications closed/i.test($("body").text()),
        applyLinks: $("a[href]").toArray().flatMap(n => {
          const href = $(n).attr("href") || "", label = $(n).text().trim();
          return /candidat|apply|inscrev/i.test(label) ? [{ label, url: new URL(href, raw.url).href }] : [];
        }) };
      const gupy = new URL(target.url).hostname.endsWith(".gupy.io");
      row.rendered = await rendered(target.url, gupy);
      if (target.kind === "existing_profile_compatible" && !row.rendered.closed && !row.rendered.quickApplyVisible) {
        const link = row.rendered.applicationLinks.find((l: any) => /\/candidates\/jobs\/[^/]+\/apply/.test(new URL(l.url).pathname));
        if (link) row.applyPage = await rendered(link.url, true);
      }
    } catch (error) { row.errorClass = error instanceof Error ? error.name : "UnknownError"; }
    results.push(row);
    console.log(JSON.stringify({ kind: target.kind, url: target.url, http: row.publication?.status,
      datePosted: row.publication?.structured?.[0]?.datePosted, closed: row.rendered?.closed,
      quickApply: row.rendered?.quickApplyVisible, fields: row.rendered?.fields?.length,
      applyFinal: row.applyPage?.finalUrl, error: row.errorClass }));
  }
} finally {
  await browser.close();
  await writeFile(leverOnly ? "artifacts/final-lever-form-inspections-2026-10-23.json" : "artifacts/final-public-channel-inspections-2026-10-23.json", JSON.stringify({
    at: new Date().toISOString(), readOnly: true, transmittedNonReadRequests: 0,
    preventedNonReadRequests: preventedWrites, candidateDataLoaded: false, applicationOperationsInvoked: 0,
    results,
  }, null, 2));
}
