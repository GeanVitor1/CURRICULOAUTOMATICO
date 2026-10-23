import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { chromium, type Browser } from "playwright";
import {
  executeAtsApplication,
  type AtsApplication,
} from "../server/ats-application";
import { defaultProfile } from "../shared/types";
import { resumePdf } from "./pdf-fixture";
import { applicationAnswerProfile, prepareAutomaticAnswers } from "../server/automatic-answers";
import type { Application, Job, Resume } from "../shared/types";

let server: Server,
  browser: Browser,
  origin = "";
const received: Buffer[] = [];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.method === "POST") {
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      received.push(Buffer.concat(parts));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        req.url?.includes("unknown")
          ? "<p>Processando.</p>"
          : '<div id="application_confirmation" data-application-confirmation>Your application has been received.</div>',
      );
      return;
    }
    const extra = req.url?.includes("location")
      ? `<label>Current location<input required id="location-input" name="location"></label><input type="hidden" id="selected-location" name="selectedLocation"><div id="location-results"></div><script>
      const locationField=document.getElementById('location-input');
      locationField.addEventListener('keydown',()=>{document.getElementById('location-results').innerHTML='<div class="dropdown-location">Ilhéus, Bahia, Brazil</div>';});
      locationField.addEventListener('blur',()=>{if(!document.getElementById('selected-location').value) locationField.value='';});
      document.getElementById('location-results').addEventListener('mousedown',()=>{document.getElementById('selected-location').value='provider-location';locationField.value='Ilhéus, Bahia, Brazil';});
      </script>`
      : req.url?.includes("lever")
      ? '<li class="application-question custom-question"><div class="application-label"><div class="text">Como ficou sabendo da vaga?<span class="required">✱</span></div></div><select name="cards[uuid][field0]" required><option value="">Select...</option><option>Site de Carreiras</option></select></li>'
      : req.url?.includes("question")
        ? '<label>Quantos anos de experiência em React?<input required name="years"></label>'
        : req.url?.includes("legal")
          ? '<label>Aceito a política de privacidade<input type="checkbox" required name="consent"></label>'
          : "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<h1>Desenvolvedor React</h1><p>Empresa controlada QA</p><form id="${(req.url?.includes("lever") || req.url?.includes("location")) ? "application-form" : "application_form"}" action="${req.url}" method="POST" enctype="multipart/form-data"><label>Full name✱<input required name="name"></label><label>Email<input required type="email" name="email"></label><label>Resume<input required type="file" name="resume"></label>${extra}<button>Submit application</button></form>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch({ headless: true });
}, 30000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});
function input(path: string): AtsApplication {
  return {
    applicationId: "controlled-application",
    job: {
      title: "Desenvolvedor React",
      company: "Empresa controlada QA",
      url: origin + path,
    },
    profile: {
      ...defaultProfile,
      confirmed: true,
      name: "Pessoa QA Fictícia",
      email: "qa@example.test",
    },
    resume: {
      name: "qa.pdf",
      file: {
        name: "qa.pdf",
        mimeType: "application/pdf",
        data: resumePdf().toString("base64"),
      },
    },
    destination: {
      id: "controlled-destination",
      platform: "greenhouse",
      url: origin + path,
      publicationUrl: origin + path,
      company: "Empresa controlada QA",
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      confidence: 100,
      evidence: ["Formulário controlado do teste"],
      state: "verified",
      method: "browser",
      formFound: true,
    },
  };
}
describe("Submissão HTTP controlada com Chromium real", () => {
  it("seleciona a cidade Lever antes do blur em vez de perder o valor obrigatório",async()=>{
    const context=await browser.newContext();
    const data=input("/location");
    data.destination.platform="lever";
    data.profile.location="Ilhéus, BA";
    try {
      const result=await executeAtsApplication(await context.newPage(),data);
      expect(result.status).toBe("sent");
      expect(result.answersUsed).toContainEqual({question:"Current location",value:"Ilhéus, Bahia, Brazil"});
      expect(received.at(-1)?.includes(Buffer.from("provider-location"))).toBe(true);
    } finally { await context.close(); }
  });
  it("identifica o campo que falhou na validação nativa sem submeter",async()=>{
    const context=await browser.newContext();
    const data=input("/apply"); data.profile.email="invalid-email";
    const before=received.length;
    try {
      const result=await executeAtsApplication(await context.newPage(),data);
      expect(result.missingQuestions).toEqual(["Email"]);
      expect(result.message).toContain("Email");
      expect(received.length).toBe(before);
    } finally {await context.close();}
  });
  it("sends an authorized automatic answer and reports exactly what was filled", async()=>{
    const context=await browser.newContext();
    const data=input("/question");
    data.profile.answerPolicy={enabled:true,missing:"no",confirmedAt:new Date().toISOString()};
    const answers=await prepareAutomaticAnswers({profile:data.profile,resume:{id:"resume",text:"Desenvolvimento de software"} as Resume,job:{title:data.job.title,source:"Site de Carreiras"} as Job,destinationUrl:data.destination.url,questions:["Quantos anos de experiência em React?"]});
    data.profile=applicationAnswerProfile(data.profile,{resumeId:"resume",automaticAnswers:answers} as Application,data.destination.url);
    try {
      const result=await executeAtsApplication(await context.newPage(),data);
      expect(result.status).toBe("sent");
      expect(result.answersUsed).toContainEqual({question:"Quantos anos de experiência em React?",value:"0"});
    } finally {await context.close();}
  });
  it("prepara perguntas antes de preencher dados ou anexar o PDF", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const data = input("/lever-preflight");
    data.destination.platform = "lever";
    data.inspectOnly = true;
    const before = received.length;
    try {
      const result = await executeAtsApplication(page, data);
      expect(result.missingQuestions).toEqual(["Como ficou sabendo da vaga?"]);
      expect(result.questionOptions?.["Como ficou sabendo da vaga?"]).toEqual(["Site de Carreiras"]);
      expect(await page.locator('input[name="name"]').inputValue()).toBe("");
      expect(await page.locator('input[name="email"]').inputValue()).toBe("");
      expect(await page.locator('input[type="file"]').evaluate((n: HTMLInputElement) => n.files?.length)).toBe(0);
      expect(received.length).toBe(before);
    } finally { await context.close(); }
  });
  it("a execução também confere perguntas antes de qualquer upload", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await executeAtsApplication(page, input("/question"));
      expect(await page.locator('input[name="name"]').inputValue()).toBe("");
      expect(await page.locator('input[type="file"]').evaluate((n: HTMLInputElement) => n.files?.length)).toBe(0);
    } finally { await context.close(); }
  });
  it("preparação completa não envia nem anexa mesmo com todas as respostas", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const data = input("/apply");
    data.inspectOnly = true;
    const before = received.length;
    try {
      expect((await executeAtsApplication(page, data)).preflightReady).toBe(true);
      expect(await page.locator('input[type="file"]').evaluate((n: HTMLInputElement) => n.files?.length)).toBe(0);
      expect(received.length).toBe(before);
    } finally { await context.close(); }
  });
  it("envia pelo formulário Lever sem sessão de portal após confirmar as respostas", async () => {
    const context = await browser.newContext();
    const data = input("/lever-approved");
    data.destination.platform = "lever";
    data.profile.approvedAnswers = [
      {
        id: "source-answer",
        question: "Como ficou sabendo da vaga?",
        aliases: [],
        value: "Site de Carreiras",
        confirmedAt: new Date().toISOString(),
        destinationUrl: data.destination.url,
      },
    ];
    const before = received.length;
    try {
      const result = await executeAtsApplication(await context.newPage(), data);
      expect(result.status).toBe("sent");
      expect(result.receipt).toContain("received");
      expect(received.length).toBe(before + 1);
      expect(received.at(-1)?.includes(resumePdf())).toBe(true);
      expect(await context.cookies()).toEqual([]);
    } finally {
      await context.close();
    }
  });
  it("reconhece o formulário e as perguntas Lever observadas no site oficial", async () => {
    const context = await browser.newContext();
    const data = input("/lever");
    data.destination.platform = "lever";
    const before = received.length;
    try {
      const result = await executeAtsApplication(await context.newPage(), data);
      expect(result.status).toBe("action_required");
      expect(result.missingQuestions).toEqual(["Como ficou sabendo da vaga?"]);
      expect(received.length).toBe(before);
    } finally {
      await context.close();
    }
  });
  it("o receptor recebe dados e PDF e só então o adaptador confirma o envio", async () => {
    const context = await browser.newContext(),
      page = await context.newPage();
    try {
      const result = await executeAtsApplication(page, input("/apply"));
      expect(result.status).toBe("sent");
      expect(result.receipt).toContain("received");
      expect(received.at(-1)?.includes(Buffer.from("qa@example.test"))).toBe(
        true,
      );
      expect(received.at(-1)?.includes(resumePdf())).toBe(true);
    } finally {
      await context.close();
    }
  });
  it("não envia pergunta de experiência sem resposta aprovada", async () => {
    const context = await browser.newContext(),
      before = received.length;
    try {
      const result = await executeAtsApplication(
        await context.newPage(),
        input("/question"),
      );
      expect(result.status).toBe("action_required");
      expect(result.missingQuestions).toContain(
        "Quantos anos de experiência em React?",
      );
      expect(received.length).toBe(before);
    } finally {
      await context.close();
    }
  });
  it("reutiliza uma resposta confirmada para a mesma pergunta", async () => {
    const context = await browser.newContext(),
      data = input("/question");
    data.profile.approvedAnswers = [
      {
        id: "answer",
        question: "Quantos anos de experiência em React?",
        aliases: [],
        value: "1",
        confirmedAt: new Date().toISOString(),
        destinationUrl: data.destination.url,
      },
    ];
    try {
      expect(
        (await executeAtsApplication(await context.newPage(), data)).status,
      ).toBe("sent");
    } finally {
      await context.close();
    }
  });
  it("não aceita declaração legal sem confirmação específica", async () => {
    const context = await browser.newContext(),
      before = received.length;
    try {
      expect(
        (await executeAtsApplication(await context.newPage(), input("/legal")))
          .status,
      ).toBe("action_required");
      expect(received.length).toBe(before);
    } finally {
      await context.close();
    }
  });
  it("HTTP 200 sem confirmação permanece resultado desconhecido", async () => {
    const context = await browser.newContext();
    try {
      const result = await executeAtsApplication(
        await context.newPage(),
        input("/unknown"),
      );
      expect(result.status).toBe("unknown");
      expect(result.receipt).toBeUndefined();
    } finally {
      await context.close();
    }
  }, 20000);
});
