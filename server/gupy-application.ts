import type { Locator, Page } from "playwright";
import type { PortalApplication, PortalResult } from "./portal-application";
import { approvedFieldAnswer } from "./approved-answers";
import { normalized } from "./job-identity";
import { isJobUrl } from "../shared/portals";
import { portalAccess } from "./portal-access";

const cleanQuestion = (value: string) =>
  value
    .replace(/^input-/, "")
    .replace(/^\s*\d+\s*[.):-]\s*/, "")
    .replace(/[\s*]+$/, "")
    .trim();
const finalHeading =
  /^(?:sua )?candidatura (?:finalizada|realizada|concluída|enviada)(?: com sucesso)?[!.]?$/i;
const applyLabel = /^(Candidatar-se|Candidatar|Quero me candidatar|Apply)$/i;
const finalLabel =
  /^(Enviar candidatura|Finalizar candidatura|Concluir candidatura|Confirmar candidatura)$/i;
const nextLabel =
  /^(Continuar|Avançar|Próximo|Revisar|Salvar e continuar|Responder agora|Personalizar candidatura|Next|Review)$/i;

async function button(page: Page, name: RegExp) {
  for (const target of [
    page.getByRole("button", { name }),
    page.getByRole("link", { name }),
  ]) {
    for (const node of await target.all())
      if (await node.isVisible()) return node;
  }
}

function jobId(value: string) {
  const url = new URL(value);
  const numeric = url.pathname.match(/^\/jobs\/(\d+)\/?$/)?.[1];
  if (numeric) return numeric;
  try {
    const encoded = decodeURIComponent(url.pathname.split("/")[2]);
    const id = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ).jobId;
    return /^\d+$/.test(String(id)) ? String(id) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads rendered labels, including the heading-based groups used by Gupy. */
async function fieldInfo(field: Locator) {
  return field.evaluate(
    (node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
      const option = (
        node.labels?.[0]?.textContent ||
        node.getAttribute("aria-label") ||
        ""
      ).trim();
      let group = node.closest('fieldset, [role="radiogroup"], [role="group"]');
      let question = "";
      if (group) {
        question = group.querySelector("legend")?.textContent || "";
        const labelledBy = group.getAttribute("aria-labelledby");
        if (!question && labelledBy)
          question = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent || "")
            .join(" ");
        if (!question) question = group.getAttribute("aria-label") || "";
      }
      if (!question) {
        let parent = node.parentElement;
        for (
          let depth = 0;
          parent && depth < 6;
          depth++, parent = parent.parentElement
        ) {
          const headings = parent.querySelectorAll("h2,h3,h4,legend");
          if (headings.length === 1) {
            question = headings[0].textContent || "";
            group = parent;
            break;
          }
          if (headings.length > 1) break;
        }
      }
      const type =
        node instanceof HTMLInputElement
          ? node.type
          : node.tagName.toLowerCase();
      const label =
        type === "radio"
          ? question
          : option ||
            question ||
            node.getAttribute("placeholder") ||
            node.name ||
            node.id;
      return {
        type,
        label,
        option,
        value: node.value,
        name: node.name,
        checked: node instanceof HTMLInputElement && node.checked,
        required:
          node.required ||
          node.getAttribute("aria-required") === "true" ||
          group?.getAttribute("aria-required") === "true" ||
          /\*/.test(question),
        options:
          node instanceof HTMLSelectElement
            ? [...node.options].map((o) => ({
                label: o.textContent || "",
                value: o.value,
              }))
            : [],
      };
    },
  );
}

export async function fillGupyQuestions(
  page: Page,
  input: PortalApplication,
  questionOptions: Record<string, string[]> = {},
): Promise<string[]> {
  const missing: string[] = [];
  const radios = new Map<
    string,
    {
      question: string;
      required: boolean;
      fields: {
        field: Locator;
        option: string;
        value: string;
        checked: boolean;
      }[];
    }
  >();
  const fields = page.locator(
    'input:not([type="hidden"]):not([type="file"]),textarea,select',
  );
  for (const field of await fields.all()) {
    if (!(await field.isVisible()) || !(await field.isEnabled())) continue;
    const info = await fieldInfo(field);
    if (["button", "submit", "reset", "search"].includes(info.type)) continue;
    const question = cleanQuestion(info.label);
    if (info.type === "select") questionOptions[question] = info.options.map(option => option.label).filter(Boolean);
    if (info.type === "radio") {
      // A label such as “Sim” is not a question and must never be guessed.
      const key = info.name || question;
      const group = radios.get(key) || {
        question,
        required: false,
        fields: [],
      };
      group.required ||= info.required;
      group.fields.push({
        field,
        option: info.option,
        value: info.value,
        checked: info.checked,
      });
      radios.set(key, group);
      continue;
    }
    if (info.type === "checkbox") {
      // No privacy notices, declarations or consents are accepted implicitly.
      if (info.required && !info.checked)
        missing.push(question || "Confirmação obrigatória");
      continue;
    }
    const answer = approvedFieldAnswer(question, input.profile, input.job.url);
    if (answer === undefined) {
      if (info.required && !info.value.trim())
        missing.push(question || "Campo obrigatório sem resposta aprovada");
      continue;
    }
    if (
      (info.type === "email" ||
        /^(email|e mail)$/.test(normalized(question))) &&
      info.value.trim() &&
      info.value.trim().toLowerCase() !== answer.toLowerCase()
    ) {
      missing.push(
        "O e-mail cadastrado no portal foi preservado. Confira a conta antes de continuar.",
      );
      continue;
    }
    if (info.type === "select") {
      const option = info.options.find(
        (o) => normalized(o.label) === normalized(answer),
      );
      if (!option) {
        missing.push(question);
        continue;
      }
      await field.selectOption(option.value);
    } else {
      if (info.type === "number" && !Number.isFinite(Number(answer))) {
        missing.push(question);
        continue;
      }
      await field.fill(answer);
    }
  }
  for (const group of radios.values()) {
    questionOptions[group.question] = group.fields.map(field => field.option || field.value);
    let answer = approvedFieldAnswer(
      group.question,
      input.profile,
      input.job.url,
    );
    // Factual source: this execution starts at the company's own Gupy career page.
    if (
      answer === undefined &&
      /por onde voce ficou sabendo desta oportunidade|onde voce encontrou (?:essa|esta) vaga/.test(
        normalized(group.question),
      )
    )
      answer = group.fields.find(
        (o) => normalized(o.option) === "pagina de carreiras da empresa",
      )?.option;
    if (answer !== undefined) {
      const choice = group.fields.find(
        (o) =>
          normalized(o.option) === normalized(answer) ||
          normalized(o.value) === normalized(answer),
      );
      if (choice) await choice.field.check();
      else missing.push(group.question);
    } else if (group.required && !group.fields.some((o) => o.checked))
      missing.push(
        group.question || "Pergunta obrigatória de múltipla escolha",
      );
  }
  return [...new Set(missing)];
}

/** Dedicated state machine for the observed Gupy candidate flow. No account/profile mutations. */
export async function applyGupyApplication(
  page: Page,
  input: PortalApplication,
  profileApproved: boolean,
): Promise<PortalResult> {
  let applyClicked = false,
    finalClicked = false,
    draftRecognized = false,
    identityVerified = false;
  let continuationUrl: string | undefined;
  const pause = (message: string, questions?: string[]): PortalResult => ({
    status: "action_required",
    message,
    missingQuestions: questions,
    retryable: draftRecognized && !finalClicked,
    continuationUrl,
  });
  const unknown = (message: string): PortalResult => ({
    status: "unknown",
    message,
    continuationUrl,
  });
  const existing = (message: string): PortalResult => ({
    status: "action_required",
    message,
    retryable: false,
    continuationUrl,
  });
  if (!isJobUrl("gupy", input.job.url))
    return pause("Endereço da vaga Gupy inválido.");
  const expectedJobId = jobId(input.job.url);
  if (!expectedJobId) return pause("Endereço da vaga Gupy inválido.");
  if (!profileApproved)
    return pause(
      "Confirme que o currículo estruturado da Gupy está atualizado e corresponde ao currículo aprovado antes do envio.",
    );
  const tenant = new URL(input.job.url).hostname;
  try {
    await page.goto(input.job.url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    const deadline = Date.now() + 85000;
    for (let step = 0; step < 100 && Date.now() < deadline; step++) {
      await page.waitForTimeout(350);
      const url = new URL(page.url());
      if (url.protocol !== "https:" || url.hostname !== tenant)
        return applyClicked
          ? unknown(
              "A Gupy mudou de domínio durante a candidatura. Confira o resultado antes de repetir.",
            )
          : pause(
              "Entre novamente na Gupy pelo navegador de conexão e confirme a sessão.",
            );
      if (/\/candidates\/(?:profile|curriculum)(?:\/|$)/.test(url.pathname))
        return pause(
          "A candidatura abriu configurações da conta. Nenhum dado cadastral será alterado; revise o currículo no portal.",
        );
      const routedJobId = url.pathname.match(
        /^\/candidates\/jobs\/(\d+)\/apply/,
      )?.[1];
      if (routedJobId && routedJobId !== expectedJobId)
        return pause(
          "O portal abriu outra vaga. A candidatura não será finalizada.",
        );
      const text = (await page.locator("body").innerText()).trim();
      if (
        !text ||
        (text.length < 40 && /carregando|loading|^\?$|^suporte/i.test(text))
      )
        continue;
      const access = await portalAccess(page, text);
      if (access.blocked || access.challenge)
        return finalClicked
          ? unknown(
              "O portal pediu uma verificação após a tentativa. Confira a candidatura antes de repetir.",
            )
          : pause(access.notice);
      const title = normalized(input.job.title);
      if (title && normalized(text).includes(title)) identityVerified = true;
      const native = url.pathname.match(
        /^\/candidates\/applications\/(\d+)(?:\/steps\/\d+\/curriculum)?\/?$/,
      );
      if (native && identityVerified) {
        continuationUrl = url.origin + url.pathname;
        draftRecognized = true;
      }
      const headings = page.getByRole("heading");
      let confirmation: string | undefined;
      for (const heading of await headings.all()) {
        if (await heading.isVisible()) {
          const value = (await heading.innerText()).trim();
          if (finalHeading.test(value)) confirmation = value;
        }
      }
      // Legacy Gupy pages may use a minimal receipt body rather than a heading.
      if (
        !confirmation &&
        text.length < 200 &&
        /candidatura (?:realizada|concluída|enviada)/i.test(text) &&
        !(await page.locator("input,textarea,select").count())
      )
        confirmation = text.match(
          /candidatura (?:realizada|concluída|enviada)/i,
        )?.[0];
      if (confirmation) {
        if (!applyClicked && !finalClicked)
          return existing(
            "A Gupy mostra uma candidatura anterior. Não foi realizado um novo envio.",
          );
        if (native && !finalClicked)
          return existing(
            "A Gupy mostra uma candidatura já concluída. Confira o histórico antes de repetir.",
          );
        return {
          status: "sent",
          receipt: `${input.job.url} · ${confirmation} · ${url.origin}${url.pathname} · ${new Date().toISOString()}`,
          message: "Candidatura finalizada e confirmada pela Gupy.",
          continuationUrl: url.origin + url.pathname,
        };
      }
      if (
        native &&
        /seu progresso|acompanhe abaixo o andamento/i.test(text) &&
        !(await button(page, applyLabel))
      )
        return existing(
          "Esta candidatura já está no acompanhamento da Gupy. Nenhum novo envio foi realizado.",
        );
      if (
        await page
          .getByRole("heading", { name: "Atualize seus dados", exact: true })
          .isVisible()
          .catch(() => false)
      ) {
        const later = await button(page, /^Me lembrar depois$/i);
        if (!later)
          return pause(
            "A Gupy exige atualização cadastral. Faça essa revisão no portal; o sistema não altera e-mail nem dados da conta.",
          );
        await later.click();
        continue;
      }
      if (
        await page
          .locator('input[type="password"]')
          .isVisible()
          .catch(() => false)
      )
        return pause(
          "Entre novamente na Gupy. A sessão expirou ou o portal pediu confirmação de login.",
        );
      const apply = await button(page, applyLabel);
      if (apply && !applyClicked) {
        if (!identityVerified)
          return pause(
            "Não foi possível confirmar o cargo na publicação da Gupy.",
          );
        const href = await apply.getAttribute("href");
        if (href) {
          const target = new URL(href, page.url());
          const targetJobId = target.pathname.match(
            /^\/candidates\/jobs\/(\d+)\/apply/,
          )?.[1];
          if (
            target.hostname !== tenant ||
            target.protocol !== "https:" ||
            (targetJobId && targetJobId !== expectedJobId)
          )
            return pause(
              "O botão de candidatura aponta para outra vaga ou domínio. Revise o anúncio.",
            );
        }
        applyClicked = true;
        await apply.click({ timeout: 8000 });
        continue;
      }
      if (!identityVerified) {
        if (/\/candidates\/auth/.test(url.pathname)) continue;
        if (step < 12) continue;
        return pause(
          "A Gupy ainda não confirmou o cargo e a conta. Reconecte o portal para continuar.",
        );
      }
      const questionOptions: Record<string, string[]> = {};
      const questions = await fillGupyQuestions(page, input, questionOptions);
      if (questions.length)
        return { ...pause(
          "Precisamos de respostas aprovadas antes de finalizar a candidatura.",
          questions,
        ), questionOptions };
      const presentation = page.locator(
        'textarea[id="personalization-step-text-area"]',
      );
      if (await presentation.isVisible().catch(() => false)) {
        const value = input.presentation?.trim();
        if (value) await presentation.fill(value.slice(0, 1500));
        // Only highlight skills already present on the user-confirmed Gupy CV.
        let highlighted = 0;
        for (const skill of input.profile.skills) {
          const choice = page.getByRole("button", {
            name: `${skill} Destacar habilidade`,
            exact: true,
          });
          if (
            highlighted < 3 &&
            (await choice.isVisible().catch(() => false))
          ) {
            await choice.click();
            highlighted++;
          }
        }
      }
      const final = await button(page, finalLabel);
      // The optional personalization dialog also has a final button. Prefer entering
      // personalization so the approved draft can be included before submission.
      const personalize = await button(page, /^Personalizar candidatura$/i);
      if (personalize) {
        await personalize.click();
        continue;
      }
      if (final) {
        if (!(await final.isEnabled())) continue;
        finalClicked = true;
        await final.click({ timeout: 8000 });
        // Never click final submission twice, even after a slow response.
        for (let tick = 0; tick < 20; tick++) {
          await page.waitForTimeout(350);
          if (new URL(page.url()).hostname !== tenant)
            return unknown(
              "O destino mudou após o envio. Confira o resultado antes de repetir.",
            );
          const success = page.getByRole("heading", { name: finalHeading });
          if (await success.isVisible().catch(() => false)) {
            const current = new URL(page.url());
            return {
              status: "sent",
              receipt: `${input.job.url} · ${await success.innerText()} · ${current.origin}${current.pathname} · ${new Date().toISOString()}`,
              message: "Candidatura finalizada e confirmada pela Gupy.",
              continuationUrl: current.origin + current.pathname,
            };
          }
        }
        return unknown(
          "A Gupy não confirmou o resultado após finalizar. Confira a candidatura; o sistema não repetirá esse envio automaticamente.",
        );
      }
      const next = await button(page, nextLabel);
      if (next && (await next.isEnabled())) {
        await next.click({ timeout: 8000 });
        continue;
      }
      if (/carregando|loading/i.test(text) || step < 12) continue;
      return pause(
        "Esta etapa da Gupy precisa de revisão. Nenhum botão de finalização foi acionado.",
      );
    }
    return finalClicked
      ? unknown("A Gupy não confirmou o resultado. Confira antes de repetir.")
      : pause(
          "A Gupy demorou para carregar. Revise a conexão e as etapas pendentes.",
        );
  } catch {
    return finalClicked || (applyClicked && !draftRecognized)
      ? unknown(
          "A conexão foi interrompida durante a tentativa. Confira a candidatura antes de repetir.",
        )
      : pause(
          "Não foi possível completar esta etapa da Gupy. Revise as respostas e a conexão.",
        );
  }
}
