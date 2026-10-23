import type { Page } from "playwright";
import type {SubmissionDiagnostic} from '../shared/types';
export type ExecutionResult = {
  diagnostic?: SubmissionDiagnostic;
  answersUsed?: {question: string; value: string}[];
  status: "sent" | "action_required" | "unknown";
  receipt?: string;
  message: string;
  missingQuestions?: string[];
  questionOptions?: Record<string, string[]>;
  preflightReady?: true;
  /** Definitive pause before clicking submit; never set after an uncertain submission. */
  retryable?: true;
};
export const confirmationPatterns =
  /(?:thank you for (?:applying|your application)|your application (?:has been|was) (?:received|submitted)|application (?:successfully submitted|received)|recebemos sua candidatura|candidatura (?:foi )?(?:recebida|enviada com sucesso))/i;
export async function verifyApplicationReceipt(
  page: Page,
  origin: string,
  selector: string,
): Promise<ExecutionResult> {
  try {
    const confirmation = page
      .locator(selector)
      .filter({ hasText: confirmationPatterns })
      .first();
    await confirmation.waitFor({ state: "visible", timeout: 12000 });
    if (new URL(page.url()).origin !== origin)
      throw new Error("External destination");
    const text = (await confirmation.innerText()).replace(/\s+/g, " ").trim();
    const phrase = text.match(confirmationPatterns)?.[0];
    if (!phrase) throw new Error("No confirmation");
    // This is an observed confirmation, not a fabricated provider application ID.
    return {
      status: "sent",
      receipt: `Confirmação observada no destino: ${phrase}`,
      message: "O destino exibiu confirmação de recebimento após a submissão.",
    };
  } catch {
    return {
      status: "unknown",
      message:
        "O envio foi tentado, mas o destino não comprovou o recebimento. Confira antes de repetir.",
    };
  }
}
