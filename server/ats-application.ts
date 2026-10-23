import type { Page, Locator } from "playwright";
import type { ApplicationDestination } from "../shared/types";
import type { PortalApplication } from "./portal-application";
import { approvedFieldAnswer } from "./approved-answers";
import {
  confirmationPatterns,
  verifyApplicationReceipt,
  type ExecutionResult,
} from "./application-verification";
import { normalized } from "./job-identity";
import {executeQuickinForm} from './quickin-form';

export type AtsApplication = PortalApplication & {
  destination: ApplicationDestination;
  /** Read-only preparation: never fills fields, uploads a file or clicks submit. */
  inspectOnly?: boolean;
};
const adapters = {
  greenhouse: {
    form: '#application_form, form[action*="applications"], form[data-application-form]',
    submit: /^(submit application|enviar candidatura|submit)$/i,
    confirmation:
      '#application_confirmation, [data-application-confirmation], [role="status"]',
  },
  lever: {
    form: '#application-form, form.application-form, form[action*="apply"], form[data-application-form]',
    submit: /^(submit application|enviar candidatura|submit)$/i,
    confirmation:
      ".application-confirmation, .application-success, [data-application-confirmation]",
  },
  ashby: {
    form: "form",
    submit: /^(submit application|enviar candidatura|submit)$/i,
    confirmation:
      '[role="status"], [data-application-confirmation], [class*="confirmation"]',
  },
  smartrecruiters: {
    form: "form",
    submit: /^(submit application|enviar candidatura|send application)$/i,
    confirmation: '[role="status"], [data-application-confirmation]',
  },
  company: {
    form: "form[data-application-form]",
    submit: /^(submit application|enviar candidatura)$/i,
    confirmation: "[data-application-confirmation]",
  },
};
const intervention = (
  message: string,
  questions?: string[],
): ExecutionResult => ({
  status: "action_required",
  retryable: true,
  message,
  missingQuestions: questions,
});
async function questionOf(field: Locator) {
  return field.evaluate((node: HTMLInputElement) =>
    (
      (node.type === "radio"
        ? node.closest("fieldset")?.querySelector("legend")?.textContent
        : undefined) ||
      node
        .closest(".application-question")
        ?.querySelector(".application-label .text, .application-label")
        ?.textContent ||
      node.labels?.[0]?.querySelector(".application-label")?.textContent ||
      node.labels?.[0]?.textContent ||
      node.getAttribute("aria-label") ||
      node.getAttribute("placeholder") ||
      node.name ||
      "Campo obrigatório"
    )
      .replace(/\s+/g, " ")
      .replace(/[\s*:✱＊]+$/, "")
      .trim(),
  );
}
/** Adapter receives an isolated page, no cookies from another candidate. Never executes model code. */
export async function executeAtsApplication(
  page: Page,
  input: AtsApplication,
): Promise<ExecutionResult> {
  if(input.destination.platform==='quickin')return executeQuickinForm(page,input);
  const answersUsed: {question:string;value:string}[]=[];
  const result=await executeForm(page,input,answersUsed);
  return {...result,...(!input.inspectOnly && answersUsed.length ? {answersUsed} : {})};
}
async function executeForm(
  page: Page,
  input: AtsApplication,
  answersUsed: {question:string;value:string}[],
): Promise<ExecutionResult> {
  const rules = adapters[input.destination.platform as keyof typeof adapters];
  if (!rules) return intervention("Este ATS ainda exige conclusão assistida.");
  let submitted = false;
  const origin = new URL(input.destination.url).origin;
  try {
    const response = await page.goto(input.destination.url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    if (!response || response.status() >= 400)
      return intervention("A publicação não está disponível para candidatura.");
    if (new URL(page.url()).origin !== origin)
      return intervention(
        "O destino redirecionou para outro domínio; é necessária nova verificação.",
      );
    const content = await page.locator("body").innerText();
    if (
      /captcha|verify you are human|humans only|access denied/i.test(content) ||
      (await page
        .locator(
          'iframe[src*="captcha"], iframe[src*="challenges.cloudflare.com"]',
        )
        .count())
    )
      return intervention(
        "O destino solicitou verificação humana ou bloqueou a execução.",
      );
    if (
      /job (?:is no longer|has been filled)|vaga (?:encerrada|indisponível)/i.test(
        content,
      )
    )
      return intervention("A vaga foi encerrada.");
    if (
      !normalized(content).includes(normalized(input.job.title)) ||
      !normalized(content).includes(normalized(input.destination.company))
    )
      return intervention(
        "O formulário não confirmou a empresa e o cargo da publicação verificada.",
      );
    if (await page.locator('input[type="password"]').count())
      return intervention(
        "O destino exige login. Reavalie os destinos alternativos.",
      );
    let forms = page.locator(rules.form);
    if (!(await forms.count())) {
      const apply = page
        .getByRole("link", {
          name: /^(apply for this job|apply now|apply|candidatar-se)$/i,
        })
        .first();
      if ((await apply.count()) && (await apply.isVisible())) {
        const href = await apply.getAttribute("href");
        if (href && new URL(href, page.url()).origin === origin)
          await apply.click();
      }
      forms = page.locator(rules.form);
    }
    if ((await forms.count()) !== 1)
      return intervention(
        "Não foi possível identificar um único formulário de candidatura.",
      );
    const form = forms.first();
    const action = await form.getAttribute("action");
    if (action && new URL(action, page.url()).origin !== origin)
      return intervention(
        "O formulário envia para outro domínio e precisa de verificação específica.",
      );
    if (await form.locator('#h-captcha, .h-captcha, [data-sitekey]').count())
      return intervention("Este formulário exige verificação humana para liberar a submissão. As demais candidaturas automáticas podem continuar.");
    const missing: string[] = [];
    const radioGroups = new Map<string, string>();
    const fields = form.locator(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
    );
    // Read every required field before the first mutation or resume upload.
    const questionOptions: Record<string, string[]> = {};
    for (let index = 0; index < (await fields.count()); index++) {
      const field = fields.nth(index);
      const metadata = await field.evaluate((n: HTMLInputElement) => ({
        type: n.tagName === "SELECT" ? "select" : n.type || "text",
        required: n.required || n.getAttribute("aria-required") === "true",
        name: n.name,
        id: n.id,
      }));
      if (!metadata.required || !(await field.isEnabled())) continue;
      if (metadata.type !== "file" && !(await field.isVisible())) continue;
      const question = await questionOf(field);
      if (metadata.type === "file") {
        if (
          !/resume|curr[ií]culo|\bcv\b/i.test(
            `${question} ${metadata.name} ${metadata.id}`,
          )
        )
          missing.push(question);
        continue;
      }
      const answer = approvedFieldAnswer(
        question,
        input.profile,
        input.destination.url,
      );
      let options: string[] = [];
      if (metadata.type === "select") {
        options = await field.locator("option").evaluateAll((nodes) =>
          nodes
            .filter(
              (n) =>
                !!(n as HTMLOptionElement).value &&
                !(n as HTMLOptionElement).disabled,
            )
            .map((n) => n.textContent?.trim() || "")
            .filter(Boolean),
        );
      } else if (metadata.type === "radio") {
        options = await form
          .locator('input[type="radio"]')
          .evaluateAll(
            (nodes, name) =>
              nodes
                .filter((n) => (n as HTMLInputElement).name === name)
                .map(
                  (n) =>
                    (n as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
                    (n as HTMLInputElement).value,
                ),
            metadata.name,
          );
      } else if (metadata.type === "checkbox") options = ["Sim", "Não"];
      if (options.length) questionOptions[question] = options;
      const compatible =
        answer !== undefined &&
        (metadata.type === "checkbox"
          ? /^(true|sim|yes)$/i.test(answer)
          : !options.length ||
            options.some(
              (option) =>
                normalized(option) === normalized(answer) ||
                (/ingles|english|espanhol|spanish/.test(normalized(question)) &&
                  normalized(option).startsWith(
                    `${normalized(answer)} exemplo `,
                  )),
            ));
      if (!compatible) missing.push(question);
    }
    if (missing.length)
      return {
        ...intervention(
          "Complete as perguntas desta vaga em Preferências antes do envio.",
          [...new Set(missing)],
        ),
        questionOptions,
      };
    if (input.inspectOnly)
      return {
        status: "action_required",
        retryable: true,
        preflightReady: true,
        message: "Perguntas obrigatórias conferidas antes do envio.",
      };
    let resumeAttached = false;
    for (let index = 0; index < (await fields.count()); index++) {
      const field = fields.nth(index);
      const type = await field.evaluate((n: HTMLInputElement) =>
        n.tagName === "SELECT" ? "select" : n.type || "text",
      );
      const required = await field.evaluate(
        (n: HTMLInputElement) =>
          n.required || n.getAttribute("aria-required") === "true",
      );
      const question = await questionOf(field);
      if (type === "file") {
        const metadata = `${question} ${(await field.getAttribute("name")) || ""} ${(await field.getAttribute("id")) || ""}`;
        if (!/resume|curr[ií]culo|\bcv\b/i.test(metadata)) {
          if (required) missing.push(question);
          continue;
        }
        if (!input.resume.file)
          return intervention(
            "O currículo original aprovado não está disponível.",
          );
        await field.setInputFiles({
          name: input.resume.file.name,
          mimeType: input.resume.file.mimeType,
          buffer: Buffer.from(input.resume.file.data, "base64"),
        });
        resumeAttached = true;
        continue;
      }
      if (!(await field.isVisible()) || !(await field.isEnabled())) continue;
      const answer = approvedFieldAnswer(
        question,
        input.profile,
        input.destination.url,
      );
      if (answer === undefined) {
        if (required) missing.push(question);
        continue;
      }
      if (type === "checkbox") {
        if (!/^(true|false|sim|nao|não|yes|no)$/i.test(answer)) {
          if (required) missing.push(question);
          continue;
        }
        await field.setChecked(/^(true|sim|yes)$/i.test(answer));
        answersUsed.push({question,value:answer});
      } else if (type === "radio") {
        const value = await field.getAttribute("value");
        const label = await field.evaluate(
          (node: HTMLInputElement) => node.labels?.[0]?.textContent || "",
        );
        if (value === answer || normalized(label) === normalized(answer)) {
          await field.check();
          answersUsed.push({question,value:label.trim() || answer});
        }
        if (required)
          radioGroups.set((await field.getAttribute("name")) || "", question);
      } else if (type === "select") {
        try {
          const options = await field.locator("option").allTextContents();
          const exact = options.find(
            (option) => normalized(option.trim()) === normalized(answer),
          );
          const languageOptions = /ingles|english|espanhol|spanish/.test(
            normalized(question),
          )
            ? options.filter((option) =>
                normalized(option.trim()).startsWith(
                  `${normalized(answer)} exemplo `,
                ),
              )
            : [];
          await field.selectOption({
            label:
              exact ||
              (languageOptions.length === 1 ? languageOptions[0] : answer),
          });
          answersUsed.push({question,value:exact || (languageOptions.length===1 ? languageOptions[0] : answer)});
        } catch {
          missing.push(question);
        }
      } else {
        await field.fill(answer);
        if (input.destination.platform === "lever" && await field.getAttribute("id") === "location-input") {
          // Lever clears free text on blur. Its own dropdown must commit the
          // selected location and its provider identifier before leaving the field.
          const city = normalized(answer.split(",")[0].trim());
          await field.press("End");
          const options = form.locator(".dropdown-location");
          try { await options.first().waitFor({state:"visible",timeout:8000}); }
          catch {
            await field.fill(answer.split(",")[0].trim());
            await field.press("End");
            await options.first().waitFor({state:"visible",timeout:8000});
          }
          const labels = await options.allTextContents();
          const exact = labels.map((label,index)=>({label,index})).filter(({label})=>normalized(label)===normalized(answer));
          const sameCity = labels.map((label,index)=>({label,index})).filter(({label})=>normalized(label.split(",")[0].trim())===city);
          const selected = exact.length===1 ? exact[0] : sameCity.length===1 ? sameCity[0] : undefined;
          if (!selected) return intervention("A cidade precisa corresponder a uma opção inequívoca do formulário.",[question]);
          await options.nth(selected.index).click();
          if (!(await form.locator('#selected-location').inputValue())) return intervention("O formulário não confirmou a cidade selecionada.",[question]);
          answersUsed.push({question,value:await field.inputValue()});
        } else answersUsed.push({question,value:answer});
      }
    }
    for (const [name, question] of radioGroups)
      if (
        !(await form
          .locator('input[type="radio"]')
          .evaluateAll(
            (nodes, group) =>
              nodes.some(
                (node) =>
                  (node as HTMLInputElement).name === group &&
                  (node as HTMLInputElement).checked,
              ),
            name,
          ))
      )
        missing.push(question);
    if (missing.length)
      return intervention("Há perguntas que precisam de respostas aprovadas.", [
        ...new Set(missing),
      ]);
    if (!resumeAttached)
      return intervention(
        "Nenhum campo de currículo reconhecido confirmou o anexo aprovado.",
      );
    if (!(await form.evaluate((node: HTMLFormElement) => node.checkValidity()))) {
      const invalid = form.locator("input:invalid,select:invalid,textarea:invalid");
      const questions:string[]=[];
      for(let i=0;i<await invalid.count();i++) questions.push(await questionOf(invalid.nth(i)));
      return intervention(
        `O formulário não validou: ${[...new Set(questions)].join("; ")}.`,
        [...new Set(questions)],
      );
    }
    const submit = form.getByRole("button", { name: rules.submit });
    if ((await submit.count()) !== 1 || !(await submit.isEnabled()))
      return intervention(
        "O formulário não liberou um botão de envio inequívoco.",
      );
    // No pre-existing success panel may be reused as proof of this submission.
    const previous = page
      .locator(rules.confirmation)
      .filter({ hasText: confirmationPatterns });
    for (let index = 0; index < (await previous.count()); index++)
      if (await previous.nth(index).isVisible())
        return intervention(
          "Já havia uma confirmação nesta página; confira a candidatura existente.",
        );
    submitted = true;
    await submit.click({ timeout: 10000 });
    return await verifyApplicationReceipt(page, origin, rules.confirmation);
  } catch {
    return submitted
      ? {
          status: "unknown",
          message:
            "A execução foi interrompida após a tentativa. Não repetir sem conferir no destino.",
        }
      : intervention("A execução não chegou à submissão. Revise o formulário.");
  }
}
