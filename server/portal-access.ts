import type { Page } from "playwright";

// Inspect only the presence/layout of a verification frame. Never inspect its
// challenge, choose answers, click it, or decide that verification succeeded.
export async function portalAccess(page: Page, text: string) {
  let challenge = false;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      const url = new URL(frame.url());
      const known =
        url.hostname === "challenges.cloudflare.com" ||
        ((url.hostname === "www.google.com" ||
          url.hostname === "www.recaptcha.net") &&
          url.pathname.includes("/recaptcha/")) ||
        url.hostname === "newassets.hcaptcha.com" ||
        url.hostname.endsWith(".arkoselabs.com");
      if (!known || url.protocol !== "https:") continue;
      const element = await frame.frameElement();
      try {
        const box = await element.boundingBox();
        if (
          box &&
          box.width >= 40 &&
          box.height >= 25 &&
          (await element.isVisible())
        ) {
          challenge = true;
          break;
        }
      } finally {
        await element.dispose();
      }
    } catch {
      /* Verification frames can be replaced during navigation. */
    }
  }
  const denied =
    /access denied|acesso negado|humans only|request (?:was )?blocked|you have been blocked/i.test(
      text,
    );
  return {
    // A 403 / "Humans only" page can itself contain an interactive challenge.
    // Keep the viewer usable so the person can complete the portal's check.
    blocked: denied && !challenge,
    challenge,
    notice: challenge
      ? "Verificação do portal. Conclua manualmente na página."
      : denied
        ? "O portal bloqueou o acesso."
        : "",
  };
}
