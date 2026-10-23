import { describe, expect, it, vi } from "vitest";
import type { Job } from "../shared/types";
import { createWorkspace } from "../server/workspace";
import {
  verifyEmailDestination,
  emailDestinationReady,
} from "../server/email-destination";
import {
  applicationEmailMime,
  sendEmailApplication,
} from "../server/email-application";
import { gmailAccessToken } from "../server/gmail-connection";

vi.mock("../server/gmail-connection", () => ({
  gmailAccessToken: vi.fn().mockResolvedValue("fixture-private-token"),
}));
const job = {
  id: "fixture-job",
  title: "Desenvolvedor Júnior",
  company: "Empresa Teste",
  url: "https://publisher.example/job/1",
} as Job;
const page = (url: string, body: string) => ({
  url,
  status: 200,
  contentType: "text/html",
  html: `<html><body>${body}</body></html>`,
});
const publication =
  "Desenvolvedor Júnior Empresa Teste. Candidatura por e-mail talentos@empresa.example";
const read = vi.fn(async (url: string) =>
  url === job.url
    ? page(url, publication)
    : page(url, "Empresa Teste talentos@empresa.example"),
);
const destination = {
  email: "talentos@empresa.example",
  publicationUrl: job.url,
  employerUrl: "https://empresa.example/",
  verifiedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
const input = () => ({
  applicationId: "fixture-application",
  profile: {
    ...createWorkspace("Pessoa", "candidate@example.test").profile,
    confirmed: true,
  },
  job: { ...job, emailDestination: destination },
  resume: {
    file: {
      name: "Currículo.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("%PDF controlled fixture").toString("base64"),
    },
  },
});
describe("Envio pelo sistema com Gmail — receptor controlado", () => {
  it("confirma publicação da própria empresa por organização, domínio e e-mail",async()=>{
    const socialJob={...job,url:"https://www.linkedin.com/feed/update/urn:li:activity:123/"};
    const profile="https://br.linkedin.com/company/empresa-teste/";
    const social=page(socialJob.url,publication+`<script type="application/ld+json">${JSON.stringify({'@type':'SocialMediaPosting',headline:job.title,datePublished:'2026-10-08T12:00:00.000Z',articleBody:publication,author:{'@type':'Organization',url:profile}})}</script>`);
    const lookup=async(url:string)=>url===socialJob.url?social:page(profile,'<h1>Empresa Teste</h1><a href="https://empresa.example/">Site</a> talentos@empresa.example');
    expect(await verifyEmailDestination(socialJob,undefined,lookup)).toMatchObject({email:destination.email,publishedAt:'2026-10-08T12:00:00.000Z'});
    await expect(verifyEmailDestination(socialJob,undefined,async(url)=>url===socialJob.url?social:page(profile,'<h1>Outra empresa</h1> talentos@empresa.example'))).rejects.toThrow();
    await expect(verifyEmailDestination(socialJob,undefined,async(url)=>url===socialJob.url?social:page(profile,'<h1>Empresa Teste</h1><a href="https://other.example/">Site</a> talentos@empresa.example'))).rejects.toThrow();
  });
  it("exige instrução de candidatura, identidade da vaga e endereço confirmado na empresa", async () => {
    expect(await verifyEmailDestination(job, undefined, read)).toMatchObject({
      email: destination.email,
    });
    expect(
      emailDestinationReady({ ...job, emailDestination: destination }),
    ).toBe(true);
    expect(
      emailDestinationReady({
        ...job,
        emailDestination: {
          ...destination,
          publicationUrl: "https://other.example/",
        },
      }),
    ).toBe(false);
    await expect(
      verifyEmailDestination(job, undefined, async (url) =>
        page(url, "Contato: talentos@empresa.example"),
      ),
    ).rejects.toThrow();
    await expect(
      verifyEmailDestination(job, undefined, async (url) =>
        page(
          url,
          url === job.url
            ? publication
            : "Outra empresa talentos@empresa.example",
        ),
      ),
    ).rejects.toThrow();
    await expect(
      verifyEmailDestination(job, "https://evil.example/", read),
    ).rejects.toThrow();
    await expect(
      verifyEmailDestination(job, undefined, async (url) =>
        page(url, publication + " Vaga encerrada"),
      ),
    ).rejects.toThrow();
  });
  it("anexa o arquivo original, codifica Unicode e impede injeção de cabeçalhos", () => {
    const mime = applicationEmailMime(input(), destination.email);
    expect(mime).toContain("Content-Type: multipart/mixed");
    expect(mime).toContain(input().resume.file.data);
    expect(mime).toContain("filename*=UTF-8''Curr%C3%ADculo.pdf");
    expect(mime).toContain(`To: ${destination.email}\r\n`);
    expect(() =>
      applicationEmailMime(
        input(),
        "person@example.test\r\nBcc:attacker@example.test",
      ),
    ).toThrow();
    const malformed = input();
    malformed.job.title = "Developer\r\nBcc: attacker@example.test";
    expect(() => applicationEmailMime(malformed, destination.email)).toThrow();
  });
  it("lê a codificação pública do endereço apresentada pelo navegador sem executar scripts", async () => {
    const email = destination.email,
      key = 71;
    const encoded = Buffer.from([
      key,
      ...Buffer.from(email).map((value) => value ^ key),
    ]).toString("hex");
    const result = await verifyEmailDestination(job, undefined, async (url) =>
      page(
        url,
        url === job.url
          ? `Desenvolvedor Júnior Empresa Teste. Candidatura por e-mail <a data-cfemail="${encoded}">[email protected]</a>`
          : `Empresa Teste ${email}`,
      ),
    );
    expect(result.email).toBe(email);
  });
  it("só registra aceitação depois de receber o identificador real do provedor", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "controlled-message-123" })),
      );
    const result = await sendEmailApplication(
      "fixture-user",
      input(),
      fetcher,
      async () => destination,
    );
    expect(result).toMatchObject({
      status: "sent",
      receipt: "Gmail message ID: controlled-message-123",
    });
    expect(result.message).toContain("não confirma entrega");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).raw).toBeTruthy();
  });
  it("não envia se o destinatário mudou ou se não houver conexão", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      (
        await sendEmailApplication(
          "fixture-user",
          input(),
          fetcher,
          async () => ({ ...destination, email: "changed@empresa.example" }),
        )
      ).status,
    ).toBe("action_required");
    vi.mocked(gmailAccessToken).mockRejectedValueOnce(
      new Error("Disconnected"),
    );
    expect(
      (
        await sendEmailApplication(
          "fixture-user",
          input(),
          fetcher,
          async () => destination,
        )
      ).status,
    ).toBe("action_required");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("não repete um envio incerto nem transforma HTTP 200 sem recibo em sucesso", async () => {
    const broken = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Connection lost"));
    expect(
      (
        await sendEmailApplication(
          "fixture-user",
          input(),
          broken,
          async () => destination,
        )
      ).status,
    ).toBe("unknown");
    expect(broken).toHaveBeenCalledTimes(1);
    const noReceipt = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}"));
    expect(
      (
        await sendEmailApplication(
          "fixture-user",
          input(),
          noReceipt,
          async () => destination,
        )
      ).status,
    ).toBe("unknown");
    const denied = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 403 }));
    expect(
      (
        await sendEmailApplication(
          "fixture-user",
          input(),
          denied,
          async () => destination,
        )
      ).status,
    ).toBe("action_required");
  });
});
