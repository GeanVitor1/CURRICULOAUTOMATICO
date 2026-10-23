import { createHash } from "node:crypto";
import { z } from "zod";
import type { Job, Profile } from "../shared/types";
import { gmailAccessToken } from "./gmail-connection";
import { verifyEmailDestination } from "./email-destination";
import type { ExecutionResult } from "./application-verification";

const base64Lines = (value: Buffer) =>
  value
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") || "";
type EmailInput = {
  applicationId: string;
  profile: Profile;
  presentation?: string;
  job: Job;
  resume: { file?: { name: string; mimeType: string; data: string } };
};
export function applicationEmailMime(input: EmailInput, recipient: string) {
  const file = input.resume.file;
  if (
    !file ||
    !z.email().safeParse(recipient).success ||
    !z.email().safeParse(input.profile.email).success
  )
    throw new Error("Invalid recipient, sender or missing original resume");
  if (
    !/^[a-zA-Z0-9-]+$/.test(input.applicationId) ||
    /[\r\n]/.test(input.job.title)
  )
    throw new Error("Invalid mail headers");
  if (
    ![
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.mimeType)
  )
    throw new Error("Unsupported resume");
  const bytes = Buffer.from(file.data, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error("Invalid resume size");
  const boundary = `empregatos_${createHash("sha256").update(input.applicationId).digest("hex")}`;
  const subject = Buffer.from(
    `Candidatura — ${input.job.title.slice(0, 150)}`,
  ).toString("base64");
  const text = `Olá, equipe ${input.job.company}.\n\nGostaria de me candidatar à vaga ${input.job.title}.\n\n${input.presentation || "Segue meu currículo em anexo para avaliação."}\n\n${input.profile.name}\n${input.profile.email}\n${input.profile.phone || ""}`;
  const name = file.name.replace(/[\r\n"\\]/g, "_").slice(0, 150);
  return [
    `From: ${input.profile.email}`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: <${boundary}@empregatos.invalid>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(text)),
    `--${boundary}`,
    `Content-Type: ${file.mimeType}`,
    `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(bytes),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
export async function sendEmailApplication(
  userId: string,
  input: EmailInput,
  fetcher: typeof fetch = fetch,
  verify: typeof verifyEmailDestination = verifyEmailDestination,
): Promise<ExecutionResult> {
  let attempted = false;
  let stage: "destination"|"gmail_connection"|"resume" = "destination";
  try {
    const pinned = input.job.emailDestination;
    if (!pinned) throw new Error("Missing destination");
    const destination = await verify(input.job, pinned.employerUrl);
    if (
      destination.email !== pinned.email ||
      destination.publicationUrl !== pinned.publicationUrl
    )
      return {
        status: "action_required",
        retryable: true,
        message: "O destinatário mudou. Revise e autorize novamente.",
      };
    stage="gmail_connection";
    const token = await gmailAccessToken(userId, input.profile.email, fetcher);
    stage="resume";
    const raw = Buffer.from(
      applicationEmailMime(input, destination.email),
    ).toString("base64url");
    attempted = true;
    // One send only. A lost response is unknown and must never trigger an automatic retry.
    const response = await fetcher(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if ([400, 401, 403, 404, 413, 429].includes(response.status)) {
      const body = await response.json().catch(() => null);
      const reason = [body?.error?.status, body?.error?.errors?.[0]?.reason, body?.error?.details?.[0]?.reason]
        .filter((value): value is string => typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value)).join(" / ");
      return {
        status: "action_required",
        message: `O Gmail recusou o envio. [GMAIL_REJECTED HTTP ${response.status}${reason ? `: ${reason}` : ""}] Confira a conexão, a ativação da API e os limites da conta.`,
      };
    }
    if (!response.ok)
      return {
        status: "unknown",
        message:
          "O Gmail não confirmou o resultado. Não repetir sem conferir os enviados.",
      };
    const message = z
      .object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/) })
      .safeParse(await response.json());
    if (!message.success)
      return {
        status: "unknown",
        message: "A resposta do Gmail não trouxe um identificador verificável.",
      };
    return {
      status: "sent",
      receipt: `Gmail message ID: ${message.data.id}`,
      message:
        "O Gmail confirmou a aceitação da mensagem com currículo. Isso não confirma entrega, leitura ou avanço no processo.",
    };
  } catch (error) {
    console.error(JSON.stringify({event:"email_application_failed",applicationId:input.applicationId,stage:attempted?"transmission":stage,type:error instanceof Error?error.name:"UnknownError"}));
    return attempted
      ? {
          status: "unknown",
          message:
            "A conexão foi interrompida após iniciar o envio. Confira os enviados antes de repetir.",
        }
      : {
          status: "action_required",
          retryable: true,
          message:
            stage === "destination" ? "A publicação ou o destinatário de candidatura não pôde ser revalidado. Nenhuma mensagem foi transmitida." :
              stage === "gmail_connection" ? "O Gmail conectado não forneceu um token válido para o e-mail do candidato. Confira ou renove a conexão; nenhuma mensagem foi transmitida." :
                "O currículo original não permitiu preparar a mensagem MIME. Nenhuma mensagem foi transmitida.",
        };
  }
}
