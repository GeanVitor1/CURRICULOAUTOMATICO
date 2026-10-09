import type { Locator, Page } from "playwright";
import type { Profile } from "../shared/types";
import { isJobUrl } from "../shared/portals";
import { portalHost, type CandidatePortal } from "./portal-browser-policy";

export type PortalApplication = {
  applicationId: string;
  job: { title: string; url: string; company: string };
  profile: Profile;
  resume: {
    name: string;
    file?: { name: string; mimeType: string; data: string };
  };
};
export type PortalResult = {
  status: "sent" | "action_required" | "unknown";
  receipt?: string;
  message: string;
};
export const portalRules = {
  linkedin: {
    account: "https://www.linkedin.com/feed/",
    authenticated: '.global-nav__me, button[aria-label*="Me "]',
    apply: /^(Candidatura simplificada|Easy Apply)$/i,
    submit: /^(Enviar candidatura|Submit application)$/i,
    next: /^(Avançar|Próximo|Next|Revisar|Review)$/i,
    confirmation:
      /(?:candidatura foi enviada|candidatura enviada|application (?:was )?sent|successfully applied)/i,
  },
  gupy: {
    account: "https://login.gupy.io/candidates/applications",
    authenticated:
      'a[href*="signout"], a[href*="logout"], button[aria-label*="perfil"], button[aria-label*="Profile"]',
    apply: /^(Candidatar-se|Candidatar|Quero me candidatar|Apply)$/i,
    submit:
      /^(Enviar candidatura|Finalizar candidatura|Concluir candidatura|Confirmar candidatura)$/i,
    next: /^(Continuar|Avançar|Próximo|Revisar|Next|Review)$/i,
    confirmation:
      /(?:candidatura (?:realizada|concluída|enviada)|você (?:já )?está (?:participando|inscrito)|inscrição realizada|application submitted)/i,
  },
  infojobs: {
    account: "https://www.infojobs.com.br/candidate/",
    authenticated:
      'a[href*="Logout"], a[href*="logout"], a[href*="Candidate/CV"], a[href*="candidate/cv"]',
    apply: /^(Candidatar-me|Candidatar-se|Inscrever-me|Quero me candidatar)$/i,
    submit:
      /^(Enviar candidatura|Confirmar candidatura|Confirmar inscrição|Inscrever-me|Candidatar-me)$/i,
    next: /^(Continuar|Avançar|Próximo|Revisar)$/i,
    confirmation:
      /(?:inscrição (?:realizada|enviada)|candidatura (?:realizada|enviada)|você (?:já )?(?:se candidatou|está inscrito)|seu currículo foi enviado)/i,
  },
  glassdoor: {
    account: "https://www.glassdoor.com/member/profile/",
    authenticated: 'a[href*="logout"], a[href*="signout"]',
    apply: /^(Candidatura simplificada|Candidatura fácil|Easy Apply)$/i,
    submit: /^(Enviar candidatura|Submit application|Submit)$/i,
    next: /^(Continuar|Avançar|Próximo|Next|Review)$/i,
    confirmation:
      /(?:candidatura enviada|application (?:was )?(?:sent|submitted)|successfully applied)/i,
  },
} as const;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function candidateAnswer(
  label: string,
  profile: Profile,
): string | undefined {
  const key = normalize(label).replace(/[ *:]+$/g, "");
  // Exact personal fields only. Job skills, years, legal declarations, salary questions and tests
  // must never be answered by inferring a yes/no from the CV.
  if (/^(email|e-mail|email address|endereco de e-mail)$/.test(key))
    return profile.email || undefined;
  if (/^(nome completo|full name|name|nome)$/.test(key))
    return profile.name || undefined;
  if (/^(primeiro nome|first name)$/.test(key))
    return profile.name.split(/\s+/)[0] || undefined;
  if (/^(sobrenome|last name)$/.test(key))
    return profile.name.split(/\s+/).slice(1).join(" ") || undefined;
  if (/^(github|github url)$/.test(key)) return profile.github || undefined;
  if (
    /^(telefone|celular|phone|phone number|mobile phone number|numero de telefone|numero de telefone celular)$/.test(
      key,
    )
  )
    return profile.phone || undefined;
  if (/^(cidade|city)$/.test(key))
    return profile.location.split(",")[0].trim() || undefined;
  if (/^(portfolio|portfolio url|website|site pessoal)$/.test(key))
    return profile.portfolio || undefined;
  return undefined;
}
export async function authenticated(
  page: Page,
  portal: CandidatePortal,
): Promise<boolean> {
  if (
    !portalHost(portal, page.url()) ||
    /signin|sign-in|\/login|checkpoint|challenge|authwall|signup/i.test(
      new URL(page.url()).pathname,
    )
  )
    return false;
  const signals = page.locator(portalRules[portal].authenticated);
  for (let i = 0; i < (await signals.count()); i++)
    if (await signals.nth(i).isVisible()) return true;
  const exits = page
    .getByRole("button", { name: /^(Sair|Sign out|Log out)$/i })
    .or(page.getByRole("link", { name: /^(Sair|Sign out|Log out)$/i }));
  for (let i = 0; i < (await exits.count()); i++)
    if (await exits.nth(i).isVisible()) return true;
  return false;
}
async function visibleButton(root: Page | Locator, pattern: RegExp) {
  const matches = root.getByRole("button", { name: pattern });
  for (let i = 0; i < (await matches.count()); i++)
    if (await matches.nth(i).isVisible()) return matches.nth(i);
  const links = root.getByRole("link", { name: pattern });
  for (let i = 0; i < (await links.count()); i++)
    if (await links.nth(i).isVisible()) return links.nth(i);
  return undefined;
}
async function fillKnown(
  root: Page | Locator,
  input: PortalApplication,
): Promise<string | undefined> {
  const fields = root.locator(
    'input:not([type="hidden"]):not([type="file"]), textarea, select',
  );
  for (let i = 0; i < (await fields.count()); i++) {
    const field = fields.nth(i);
    if (!(await field.isVisible()) || !(await field.isEnabled())) continue;
    const info = await field.evaluate(
      (node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => ({
        type:
          node instanceof HTMLInputElement
            ? node.type
            : node.tagName.toLowerCase(),
        label: (
          node.labels?.[0]?.textContent ||
          node.getAttribute("aria-label") ||
          node.getAttribute("placeholder") ||
          node.getAttribute("name") ||
          ""
        ).trim(),
        required:
          node.required || node.getAttribute("aria-required") === "true",
        value: node.value,
        checked: node instanceof HTMLInputElement && node.checked,
      }),
    );
    if (["button", "submit", "reset", "search"].includes(info.type)) continue;
    if (["checkbox", "radio", "select"].includes(info.type)) {
      if (
        info.required &&
        !(info.type === "select" ? info.value : info.checked)
      )
        return info.label || "Uma opção obrigatória precisa da sua resposta.";
      continue;
    }
    const answer = candidateAnswer(info.label, input.profile);
    if (answer) await field.fill(answer);
    else if (info.required || (!info.value && info.type !== "password"))
      return info.label || "Há uma pergunta que precisa da sua resposta.";
  }
}
async function submissionConfirmation(
  page: Page,
  portal: CandidatePortal,
  input: PortalApplication,
): Promise<PortalResult> {
  const pattern = portalRules[portal].confirmation;
  // A click is attempted at most once. A slow response must never trigger a second submit.
  for (let tick = 0; tick < 12; tick++) {
    await page.waitForTimeout(500);
    if (!portalHost(portal, page.url())) break;
    const text = await page.locator("body").innerText();
    const match = text.match(pattern);
    if (match)
      return {
        status: "sent",
        receipt: `${input.job.url} · ${match[0]} · ${new Date().toISOString()}`,
        message: "Candidatura confirmada pelo portal.",
      };
  }
  return {
    status: "unknown",
    message:
      "O portal não confirmou o envio. Confira sua candidatura antes de repetir.",
  };
}
export async function applyOnPage(
  page: Page,
  portal: CandidatePortal,
  input: PortalApplication,
  profileApproved: boolean,
): Promise<PortalResult> {
  const rules = portalRules[portal];
  const pending = (message: string): PortalResult => ({
    status: "action_required",
    message,
  });
  if (!isJobUrl(portal, input.job.url))
    return pending("O endereço da vaga não pertence ao site escolhido.");
  let submitted = false,
    uploaded = false;
  try {
    await page.goto(input.job.url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await page.waitForTimeout(1000);
    if (!portalHost(portal, page.url()))
      return pending(
        "A vaga redirecionou para outro site. Conclua a candidatura no anúncio.",
      );
    if (!(await authenticated(page, portal)))
      return pending(
        "Entre novamente na sua conta. A sessão expirou ou o site pediu uma verificação.",
      );
    const initialText = await page.locator("body").innerText();
    if (rules.confirmation.test(initialText))
      return pending(
        "Este portal informa uma candidatura anterior. Confira a data antes de registrar um novo envio.",
      );
    const apply = await visibleButton(page, rules.apply);
    if (!apply)
      return pending(
        "Esta vaga não oferece um formulário de candidatura compatível. Abra o anúncio para continuar.",
      );
    // InfoJobs can submit in a single click using the stored candidate CV.
    if (["infojobs", "gupy"].includes(portal) && !profileApproved)
      return pending(
        "Confirme que seu currículo neste site está atualizado antes de usar a candidatura com o perfil do site.",
      );
    // Gupy and InfoJobs may create an application using the stored profile on the first click.
    // From that point an ambiguous response must be checked, never automatically retried.
    if (portal !== "linkedin") submitted = true;
    await apply.click({ timeout: 8000 });
    if (portal === "infojobs")
      return await submissionConfirmation(page, portal, input);
    for (let step = 0; step < 8; step++) {
      await page.waitForTimeout(700);
      if (!portalHost(portal, page.url()))
        return submitted
          ? {
              status: "unknown",
              message:
                "O site redirecionou depois do envio. Confira sua candidatura antes de repetir.",
            }
          : pending("O anúncio exige continuar em outro site.");
      const text = await page.locator("body").innerText();
      if (submitted && rules.confirmation.test(text))
        return {
          status: "sent",
          receipt: `${input.job.url} · ${text.match(rules.confirmation)![0]} · ${new Date().toISOString()}`,
          message: "Candidatura confirmada pelo portal.",
        };
      if (
        /captcha|verify you are human|confirme que você|verificação de segurança|limite de candidaturas|application limit/i.test(
          text,
        )
      )
        return submitted
          ? {
              status: "unknown",
              message:
                "O portal pediu uma verificação após a tentativa. Confira o resultado.",
            }
          : pending(
              "O portal pediu uma verificação ou atingiu seu limite. Conclua no site.",
            );
      const dialog = page.getByRole("dialog");
      const root =
        (await dialog.count()) && (await dialog.last().isVisible())
          ? dialog.last()
          : page;
      const files = root.locator('input[type="file"]');
      for (let i = 0; i < (await files.count()); i++) {
        const field = files.nth(i),
          metadata = await field.evaluate(
            (el: HTMLInputElement) =>
              `${el.accept} ${el.name} ${el.labels?.[0]?.textContent || ""}`,
          );
        if (!/pdf|doc|resume|curr[ií]culo|cv/i.test(metadata)) continue;
        if (!input.resume.file)
          return pending("Envie o arquivo original do currículo novamente.");
        await field.setInputFiles({
          name: input.resume.file.name,
          mimeType: input.resume.file.mimeType,
          buffer: Buffer.from(input.resume.file.data, "base64"),
        });
        uploaded = true;
      }
      const question = await fillKnown(root, input);
      if (question)
        return submitted
          ? {
              status: "unknown",
              message: `Confira o envio. O portal solicitou: ${question}`,
            }
          : pending(`Precisamos da sua resposta: ${question}`);
      const submit = await visibleButton(root, rules.submit);
      if (submit) {
        if (!uploaded && !profileApproved)
          return pending(
            "Confirme o currículo do site ou envie o currículo aprovado neste formulário antes de continuar.",
          );
        if (!(await submit.isEnabled()))
          return pending(
            "O portal não liberou o envio. Confira os campos e as perguntas da vaga.",
          );
        submitted = true;
        await submit.click({ timeout: 8000 });
        return await submissionConfirmation(page, portal, input);
      }
      const next = await visibleButton(root, rules.next);
      if (!next || !(await next.isEnabled()))
        return submitted
          ? {
              status: "unknown",
              message:
                "Não recebemos confirmação do envio. Confira sua candidatura no portal.",
            }
          : pending("O formulário precisa de uma ação sua para continuar.");
      await next.click({ timeout: 8000 });
    }
    return submitted
      ? {
          status: "unknown",
          message: "O portal não confirmou o envio. Confira antes de repetir.",
        }
      : pending(
          "O formulário tem etapas adicionais. Conclua a candidatura no portal.",
        );
  } catch {
    return submitted
      ? {
          status: "unknown",
          message:
            "A conexão caiu durante a tentativa. Confira no portal antes de repetir.",
        }
      : pending(
          "Não foi possível abrir ou preencher o formulário. Reconecte o site e tente novamente.",
        );
  }
}
