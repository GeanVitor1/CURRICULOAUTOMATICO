export const portals = {
  linkedin: {
    name: "LinkedIn",
    url: "https://www.linkedin.com/jobs/",
    host: "linkedin.com",
    coverage:
      "Vagas de empresas de todo o Brasil, em diferentes áreas e níveis.",
  },
  infojobs: {
    name: "InfoJobs",
    url: "https://www.infojobs.com.br/",
    host: "infojobs.com.br",
    coverage:
      "Vagas de atendimento, comércio, administração, logística e outras áreas no Brasil.",
  },
  indeed: {
    name: "Indeed",
    url: "https://br.indeed.com/",
    host: "indeed.com",
    coverage: "Buscas por cargo e cidade em empresas de vários setores.",
  },
  gupy: {
    name: "Gupy",
    url: "https://portal.gupy.io/",
    host: "gupy.io",
    coverage:
      "Processos seletivos de empresas brasileiras, do primeiro emprego a vagas especializadas.",
  },
  glassdoor: {
    name: "Glassdoor",
    url: "https://www.glassdoor.com.br/",
    host: "glassdoor.com.br",
    coverage: "Vagas e informações sobre empresas no Brasil.",
  },
} as const;
export const candidatePortals = [
  "linkedin",
  "gupy",
  "glassdoor",
  "infojobs",
] as const;
export type PortalId = keyof typeof portals;
export function isPortalId(value: string): value is PortalId {
  return Object.hasOwn(portals, value);
}
export function portalSearchUrl(id: PortalId, title: string, location: string) {
  const terms = [title, location].filter(Boolean).join(" ");
  if (id === "linkedin")
    return `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: title, location: location || "Brasil" })}`;
  if (id === "infojobs")
    return `https://www.infojobs.com.br/empregos.aspx?${new URLSearchParams({ Palabra: terms })}`;
  if (id === "indeed")
    return `https://br.indeed.com/jobs?${new URLSearchParams({ q: title, l: location })}`;
  if (id === "glassdoor")
    return `https://www.glassdoor.com.br/Job/jobs.htm?${new URLSearchParams({ sc: "0", keyword: terms })}`;
  return `https://portal.gupy.io/job-search/term=${encodeURIComponent(terms)}`;
}
export function isJobUrl(id: PortalId, value: string) {
  try {
    const url = new URL(value),
      host = portals[id].host;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !(
        url.hostname === host ||
        url.hostname.endsWith(`.${host}`) ||
        (id === "glassdoor" &&
          (url.hostname === "glassdoor.com" ||
            url.hostname.endsWith(".glassdoor.com")))
      )
    )
      return false;
    if (id === "linkedin") return /^\/jobs\/view\/[^/]+/.test(url.pathname);
    if (id === "infojobs")
      return /\/vaga-de-.+__\d+\.aspx$/i.test(url.pathname);
    if (id === "indeed")
      return url.pathname === "/viewjob" && !!url.searchParams.get("jk");
    if (id === "glassdoor")
      return (
        url.pathname.startsWith("/job-listing/") &&
        /^\d+$/.test(url.searchParams.get("jl") || "")
      );
    return (
      /^\/jobs\/\d+\/?$/.test(url.pathname) ||
      /^\/job\/[a-zA-Z0-9_+=-]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
