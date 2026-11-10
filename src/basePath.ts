// Suporte a publicação em subcaminho (ex.: GitHub Pages em /CURRICULOAUTOMATICO/).
// Com BASE_URL "/" (Vercel/local) tudo aqui é no-op.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function withBase(path: string): string {
  if (!BASE || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BASE || path.startsWith(BASE + "/")) return path;
  return BASE + path;
}

export function appPathname(): string {
  const p = location.pathname;
  if (BASE && (p === BASE || p.startsWith(BASE + "/"))) return p.slice(BASE.length) || "/";
  return p;
}

export function installBasePath(): void {
  if (!BASE) return;
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = history[m].bind(history);
    history[m] = (data: unknown, unused: string, url?: string | URL | null) =>
      orig(data, unused, typeof url === "string" ? withBase(url) : url);
  }
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      const href = a?.getAttribute("href");
      if (a && href && href.startsWith("/") && !href.startsWith("//")) a.setAttribute("href", withBase(href));
    },
    true,
  );
}
