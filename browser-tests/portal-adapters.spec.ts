import { test, expect } from "@playwright/test";
import {
  applyOnPage,
  authenticated,
  type PortalApplication,
} from "../server/portal-application";
import { defaultProfile } from "../shared/types";
import type { CandidatePortal } from "../server/portal-browser-policy";
const urls: Record<CandidatePortal, string> = {
  linkedin: "https://www.linkedin.com/jobs/view/12345/",
  gupy: "https://empresa.gupy.io/jobs/12345",
  glassdoor: "https://www.glassdoor.com.br/job-listing/developer?jl=12345",
  infojobs: "https://www.infojobs.com.br/vaga-de-desenvolvedor__12345.aspx",
};
const configs = {
  linkedin: {
    auth: '<button class="global-nav__me">Eu</button>',
    apply: "Candidatura simplificada",
    submit: "Enviar candidatura",
    done: "Sua candidatura foi enviada",
  },
  gupy: {
    auth: "<button>Sair</button>",
    apply: "Candidatar-se",
    submit: "Finalizar candidatura",
    done: "Candidatura realizada",
  },
  glassdoor: {
    auth: '<a href="/logout">Sair</a>',
    apply: "Easy Apply",
    submit: "Submit application",
    done: "Application submitted",
  },
  infojobs: {
    auth: '<a href="/candidate/Logout">Sair</a>',
    apply: "Candidatar-me",
    submit: "Candidatar-me",
    done: "Seu currículo foi enviado",
  },
};
function application(portal: CandidatePortal): PortalApplication {
  return {
    applicationId: "fixture",
    job: {
      title: "Desenvolvedor",
      company: "Empresa de teste",
      url: urls[portal],
    },
    profile: {
      ...defaultProfile,
      name: "Ana Silva",
      email: "ana@example.test",
    },
    resume: {
      name: "resume.pdf",
      file: {
        name: "resume.pdf",
        mimeType: "application/pdf",
        data: Buffer.from("%PDF fixture").toString("base64"),
      },
    },
  };
}
for (const portal of Object.keys(configs) as CandidatePortal[])
  test(`adaptador ${portal}: somente uma confirmação do portal registra envio`, async ({
    page,
  }) => {
    const c = configs[portal];
    await page.route(urls[portal], (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `${c.auth}<h1>Desenvolvedor</h1><div id="form"><button onclick="openForm()">${c.apply}</button></div><script>
  window.submits=0; window.openForm=()=>${portal === "infojobs" ? `{window.submits++;document.querySelector('#form').innerHTML='<p role="status">${c.done}</p>';}` : `{document.querySelector('#form').innerHTML='<section role="dialog"><label>Email<input required type="email"></label><label>Currículo<input type="file" accept=".pdf"></label><button onclick="send()">${c.submit}</button></section>';}`}
  window.send=()=>{window.submits++;document.querySelector('#form').innerHTML='<p role="status">${c.done}</p>'};
  </script>`,
      }),
    );
    const result = await applyOnPage(
      page,
      portal,
      application(portal),
      portal === "infojobs" || portal === "gupy",
    );
    expect(result.status).toBe("sent");
    expect(result.receipt).toContain(urls[portal]);
    expect(await page.evaluate(() => (window as any).submits)).toBe(1);
  });
test("pergunta de experiência exige a resposta da pessoa e impede submit", async ({
  page,
}) => {
  await page.route(urls.linkedin, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${configs.linkedin.auth}<button onclick="document.querySelector('#form').hidden=false">Easy Apply</button><section role="dialog" hidden id="form"><label>Possui experiência com vendas?<input required></label><button onclick="window.submits++">Submit application</button></section><script>window.submits=0</script>`,
    }),
  );
  const result = await applyOnPage(
    page,
    "linkedin",
    application("linkedin"),
    true,
  );
  expect(result.status).toBe("action_required");
  expect(result.message).toContain("experiência com vendas");
  expect(await page.evaluate(() => (window as any).submits)).toBe(0);
});
test("submit sem confirmação fica desconhecido e nunca é repetido", async ({
  page,
}) => {
  await page.route(urls.linkedin, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${configs.linkedin.auth}<button onclick="document.querySelector('#form').hidden=false">Easy Apply</button><section role="dialog" hidden id="form"><button onclick="window.submits++">Submit application</button></section><script>window.submits=0</script>`,
    }),
  );
  const result = await applyOnPage(
    page,
    "linkedin",
    application("linkedin"),
    true,
  );
  expect(result.status).toBe("unknown");
  expect(result.receipt).toBeUndefined();
  expect(await page.evaluate(() => (window as any).submits)).toBe(1);
});
test("currículo pré-existente não é usado sem aprovação da pessoa", async ({
  page,
}) => {
  await page.route(urls.infojobs, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${configs.infojobs.auth}<button onclick="window.submits++">Candidatar-me</button><script>window.submits=0</script>`,
    }),
  );
  const result = await applyOnPage(
    page,
    "infojobs",
    application("infojobs"),
    false,
  );
  expect(result.status).toBe("action_required");
  expect(await page.evaluate(() => (window as any).submits)).toBe(0);
});
test("login público e link de perfil na descrição não provam autenticação", async ({
  page,
}) => {
  await page.route("https://www.linkedin.com/jobs/view/12345/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<a href="/in/recruiter/">Recrutador</a><button>Entrar</button>',
    }),
  );
  await page.goto(urls.linkedin);
  expect(await authenticated(page, "linkedin")).toBe(false);
});
test("redirect externo não recebe currículo nem candidatura", async ({
  page,
}) => {
  let requests = 0;
  await page.route(urls.gupy, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<script>location.href='https://employer.example.test/apply'</script>",
    }),
  );
  await page.route("https://employer.example.test/apply", (route) => {
    requests++;
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<button onclick="window.submits++">Submit</button><script>window.submits=0</script>',
    });
  });
  const result = await applyOnPage(page, "gupy", application("gupy"), true);
  expect(result.status).toBe("action_required");
  expect(result.message).toContain("outro site");
  expect(requests).toBe(1);
  expect(await page.evaluate(() => (window as any).submits)).toBe(0);
});
