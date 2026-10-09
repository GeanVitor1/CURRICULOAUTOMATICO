import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

// Read-only measurements of the public production landing page. No account,
// credentials, application actions, AI requests or database access are used.
const outputDirectory = resolve("artifacts");
const outputFile = resolve(outputDirectory, "product-performance.json");
const report = {
  checkedAt: new Date().toISOString(),
  status: "running",
  scope:
    "Medições locais da landing pública, sem limitação de CPU/rede. Não representam capacidade sob carga ou latência de usuários reais.",
  setup: {
    coldContexts: 3,
    warmNavigation: "Mesmo contexto após about:blank, sem reload forçado",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
    requestRouting: false,
    cacheEvidence:
      "Recursos same-origin com transferSize=0 e decodedBodySize>0 indicam reutilização pelo navegador. Compara também os bytes transferidos observados em cada par cold/warm.",
    gzipEvidence:
      "gzipBytes usa o arquivo pré-comprimido quando gzipVariantPresent=true; caso contrário, é calculado. brotliBytes usa a variante real do build. Headers de negociação verificam br/gzip e a resposta sem Accept-Encoding.",
    timingWindow:
      "LCP observado até a coleta, antes de rolagem; apenas a viewport inicial entra nas métricas. Screenshots completos são coletados depois das medições.",
  },
  samples: [],
  screenshots: [],
  failures: [],
};

function median(values) {
  const numbers = values
    .filter((value) => Number.isFinite(value))
    .sort((one, two) => one - two);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;
}

async function assetSizes() {
  const directory = resolve("dist/assets");
  const names = await readdir(directory, { withFileTypes: true });
  const assets = await Promise.all(
    names
      .filter((entry) => entry.isFile() && !/\.(?:br|gz)$/i.test(entry.name))
      .map(async ({ name }) => {
        const data = await readFile(resolve(directory, name));
        const variants = await variantSizes(resolve(directory, name));
        return {
          path: `/assets/${name}`,
          bytes: data.length,
          gzipBytes: variants.gzipBytes ?? gzipSync(data).length,
          gzipVariantPresent: variants.gzipBytes !== null,
          brotliBytes: variants.brotliBytes,
        };
      }),
  );
  return assets.sort((one, two) => two.bytes - one.bytes);
}

async function variantSizes(path) {
  const size = (extension) =>
    stat(path + extension)
      .then((file) => file.size)
      .catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
  const [gzipBytes, brotliBytes] = await Promise.all([
    size(".gz"),
    size(".br"),
  ]);
  return { gzipBytes, brotliBytes };
}

async function headerCheck(origin, path, acceptEncoding) {
  // Node fetch adds Accept-Encoding itself. Native HTTP lets us verify a truly
  // absent header as well as explicit Brotli/gzip negotiation.
  return new Promise((success, failure) => {
    const url = new URL(path, origin);
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "HEAD",
        headers: acceptEncoding ? { "Accept-Encoding": acceptEncoding } : {},
      },
      (response) => {
        response.resume();
        success({
          path,
          requestedEncoding: acceptEncoding ?? null,
          status: response.statusCode,
          cacheControl: response.headers["cache-control"] ?? null,
          contentType: response.headers["content-type"] ?? null,
          contentEncoding: response.headers["content-encoding"] ?? null,
          contentLength: response.headers["content-length"] ?? null,
          etag: response.headers.etag ?? null,
          vary: response.headers.vary ?? null,
        });
      },
    );
    request.once("error", failure);
    request.setTimeout(10000, () => request.destroy(new Error("HEAD timeout")));
    request.end();
  });
}

async function collect(page, origin) {
  const issues = {
    consoleErrors: [],
    pageErrors: [],
    httpErrors: [],
    requestsFailed: [],
  };
  const consoleError = (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  };
  const pageError = (error) => issues.pageErrors.push(error.message);
  const httpError = (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400)
      issues.httpErrors.push({
        path: url.pathname,
        status: response.status(),
        expectedUnauthenticated:
          url.pathname === "/api/auth/me" && response.status() === 401,
      });
  };
  const requestFailed = (request) =>
    issues.requestsFailed.push({
      path: new URL(request.url()).pathname,
      reason: request.failure()?.errorText || "Falha na requisição",
    });
  page.on("console", consoleError);
  page.on("pageerror", pageError);
  page.on("response", httpError);
  page.on("requestfailed", requestFailed);
  try {
    const response = await page.goto(origin, {
      waitUntil: "load",
      timeout: 30000,
    });
    if (!response?.ok())
      throw new Error("Landing indisponível na origem local.");
    await page.locator("main h1").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await page.waitForFunction(() =>
      [".hero-copy", ".hero-visual"].every((selector) => {
        const element = document.querySelector(selector);
        return element && getComputedStyle(element).opacity === "1";
      }),
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((ready) =>
        requestAnimationFrame(() => requestAnimationFrame(ready)),
      );
    });
    const data = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const metrics = window.__productAuditMetrics;
      const resources = performance
        .getEntriesByType("resource")
        .map((entry) => {
          const url = new URL(entry.name, location.href);
          const sameOrigin = url.origin === location.origin;
          return {
            path: url.pathname,
            sameOrigin,
            initiatorType: entry.initiatorType,
            durationMs: entry.duration,
            transferBytes: entry.transferSize,
            encodedBytes: entry.encodedBodySize,
            decodedBytes: entry.decodedBodySize,
            cachedByBrowser:
              sameOrigin &&
              entry.transferSize === 0 &&
              entry.decodedBodySize > 0,
          };
        });
      const hashedAssets = resources.filter((entry) =>
        /^\/assets\/.+-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(entry.path),
      );
      return {
        navigation: {
          ttfbMs: navigation.responseStart - navigation.requestStart,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          loadMs: navigation.loadEventEnd,
          documentTransferBytes: navigation.transferSize,
          documentEncodedBytes: navigation.encodedBodySize,
        },
        paint: {
          firstContentfulPaintMs:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? null,
          lcpSupported: metrics.lcpSupported,
          lcpMs: metrics.lcpMs,
        },
        resourceCount: resources.length,
        resourceTransferBytes: resources.reduce(
          (sum, item) => sum + item.transferBytes,
          0,
        ),
        hashedAssetTransferBytes: hashedAssets.reduce(
          (sum, item) => sum + item.transferBytes,
          0,
        ),
        cachedResourceCount: resources.filter((item) => item.cachedByBrowser)
          .length,
        cachedHashedAssetCount: hashedAssets.filter(
          (item) => item.cachedByBrowser,
        ).length,
        resources,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    return { ...data, ...issues };
  } finally {
    page.off("console", consoleError);
    page.off("pageerror", pageError);
    page.off("response", httpError);
    page.off("requestfailed", requestFailed);
  }
}

async function screenshots(page) {
  const desktop = "artifacts/product-landing-1440.png";
  await page.screenshot({ path: desktop, fullPage: false });
  report.screenshots.push({ path: desktop, width: 1440, fullPage: false });
  await page.setViewportSize({ width: 375, height: 1000 });
  // Reveal observed landing sections and lazy images before the full-page shot.
  const sections = page.locator("main section");
  const sectionCount = await sections.count();
  for (let index = 0; index < sectionCount; index++) {
    await sections.nth(index).scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise((ready) =>
          requestAnimationFrame(() => requestAnimationFrame(ready)),
        ),
    );
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForLoadState("networkidle", { timeout: 15000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((ready) =>
      requestAnimationFrame(() => requestAnimationFrame(ready)),
    );
  });
  const mobile = "artifacts/product-landing-375.png";
  await page.screenshot({ path: mobile, fullPage: true });
  report.screenshots.push({
    path: mobile,
    width: 375,
    fullPage: true,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  });
}

function summarize(kind) {
  const samples = report.samples.map((pair) => pair[kind]);
  return {
    samples: samples.length,
    medianTtfbMs: median(samples.map((sample) => sample.navigation.ttfbMs)),
    medianDomContentLoadedMs: median(
      samples.map((sample) => sample.navigation.domContentLoadedMs),
    ),
    medianLoadMs: median(samples.map((sample) => sample.navigation.loadMs)),
    medianFirstContentfulPaintMs: median(
      samples.map((sample) => sample.paint.firstContentfulPaintMs),
    ),
    medianLcpMs: median(samples.map((sample) => sample.paint.lcpMs)),
    medianResourceTransferBytes: median(
      samples.map((sample) => sample.resourceTransferBytes),
    ),
    medianHashedAssetTransferBytes: median(
      samples.map((sample) => sample.hashedAssetTransferBytes),
    ),
    medianCachedHashedAssetCount: median(
      samples.map((sample) => sample.cachedHashedAssetCount),
    ),
  };
}

let browser;
try {
  const base = new URL(process.env.AUDIT_BASE_URL || "http://127.0.0.1:3109");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password
  )
    throw new Error(
      "AUDIT_BASE_URL deve apontar para uma origem local sem credenciais.",
    );
  report.origin = base.origin;
  await mkdir(outputDirectory, { recursive: true });
  report.assets = await assetSizes();
  const hashed = report.assets.filter((asset) =>
    /-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(asset.path),
  );
  const checks = await Promise.all([
    headerCheck(base.origin, "/"),
    headerCheck(base.origin, "/privacy"),
    ...hashed.map((asset) =>
      headerCheck(
        base.origin,
        "/assets/" + encodeURIComponent(asset.path.slice("/assets/".length)),
      ),
    ),
  ]);
  report.headers = {
    index: checks[0],
    spaFallback: checks[1],
    hashedAssets: checks.slice(2),
  };
  for (const document of checks.slice(0, 2))
    if (
      document.status !== 200 ||
      !/no-cache|no-store/.test(document.cacheControl || "")
    )
      report.failures.push(
        `Documento ${document.path} sem resposta 200 e política de revalidação.`,
      );
  for (const asset of checks.slice(2))
    if (asset.status !== 200 || !/\bimmutable\b/.test(asset.cacheControl || ""))
      report.failures.push(
        `Asset ${asset.path} sem resposta 200 e cache imutável.`,
      );

  const indexVariants = await variantSizes(resolve("dist/index.html"));
  const compressionTargets = [
    { path: "/", ...indexVariants },
    ...[".js", ".css"].map((extension) => {
      const asset = report.assets.find((item) => item.path.endsWith(extension));
      if (!asset) throw new Error("Build sem JavaScript ou CSS.");
      return {
        path:
          "/assets/" + encodeURIComponent(asset.path.slice("/assets/".length)),
        gzipBytes: asset.gzipVariantPresent ? asset.gzipBytes : null,
        brotliBytes: asset.brotliBytes,
      };
    }),
  ];
  report.headers.compressionNegotiation = await Promise.all(
    compressionTargets.flatMap((target) =>
      [undefined, "gzip", "br"].map(async (encoding) => {
        const result = await headerCheck(base.origin, target.path, encoding);
        const compressedBytes =
          encoding === "gzip" ? target.gzipBytes : target.brotliBytes;
        const expectedContentEncoding =
          encoding && compressedBytes !== null ? encoding : null;
        return { ...result, expectedContentEncoding };
      }),
    ),
  );
  for (const check of report.headers.compressionNegotiation)
    if (
      check.status !== 200 ||
      check.contentEncoding !== check.expectedContentEncoding ||
      !/\baccept-encoding\b/i.test(check.vary || "")
    )
      report.failures.push(
        `Negociação inválida de ${check.path} para ${check.requestedEncoding || "Accept-Encoding ausente"}.`,
      );

  browser = await chromium.launch({ headless: true });
  report.setup.browserVersion = browser.version();
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({
      viewport: report.setup.viewport,
      reducedMotion: "reduce",
      colorScheme: "light",
      serviceWorkers: "block",
    });
    try {
      await context.addInitScript(() => {
        window.__productAuditMetrics = { lcpMs: null, lcpSupported: false };
        if (
          typeof PerformanceObserver !== "undefined" &&
          PerformanceObserver.supportedEntryTypes.includes(
            "largest-contentful-paint",
          )
        ) {
          window.__productAuditMetrics.lcpSupported = true;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              window.__productAuditMetrics.lcpMs = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        }
      });
      const page = await context.newPage();
      const cold = await collect(page, base.origin);
      await page.goto("about:blank");
      const warm = await collect(page, base.origin);
      report.samples.push({ run, cold, warm });
      for (const [kind, sample] of [
        ["cold", cold],
        ["warm", warm],
      ]) {
        if (
          sample.pageErrors.length ||
          sample.httpErrors.some((error) => !error.expectedUnauthenticated)
        )
          report.failures.push(
            `Erros de execução ou HTTP inesperado na amostra ${run} ${kind}.`,
          );
        if (sample.horizontalOverflow)
          report.failures.push(
            `Overflow horizontal na amostra ${run} ${kind}.`,
          );
      }
      if (run === 3) await screenshots(page);
    } finally {
      await context.close();
    }
  }
  report.summary = {
    cold: summarize("cold"),
    warm: summarize("warm"),
    medianHashedAssetTransferSavedBytes: median(
      report.samples.map(
        ({ cold, warm }) =>
          cold.hashedAssetTransferBytes - warm.hashedAssetTransferBytes,
      ),
    ),
    warmCacheReuseObserved: report.samples.every(
      ({ warm }) => warm.cachedHashedAssetCount > 0,
    ),
  };
  if (report.screenshots.some((shot) => shot.horizontalOverflow))
    report.failures.push("Overflow horizontal no screenshot de 375 px.");
  report.status = report.failures.length ? "failed" : "passed";
} catch (error) {
  report.status = "failed";
  report.failures.push(
    error instanceof Error &&
      /^(?:AUDIT_BASE_URL|Landing indisponível)/.test(error.message)
      ? error.message
      : "A auditoria não concluiu. Verifique o build, a origem local e a instalação do Chromium.",
  );
} finally {
  await browser?.close();
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        status: report.status,
        report: "artifacts/product-performance.json",
        summary: report.summary,
        failures: report.failures,
      },
      null,
      2,
    ),
  );
  if (report.status !== "passed") process.exitCode = 1;
}
