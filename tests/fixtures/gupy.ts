import type { Page } from "playwright";
export const gupyFixtureTitle = "Pessoa Desenvolvedora Backend C#/.NET - Pleno";
const title = gupyFixtureTitle;
const nativePath = "/candidates/applications/777/steps/888/curriculum";
export type GupyFixtureOptions = {
  unknown?: boolean;
  unknownRadio?: boolean;
  contactBlocked?: boolean;
  already?: boolean;
  differentJob?: boolean;
  ambiguous?: boolean;
};
export type GupyFixtureMetrics = {
  updates: number;
  submits: number;
  received?: any;
};
export async function installGupyFixture(
  page: Page,
  options: GupyFixtureOptions = {},
  metrics: GupyFixtureMetrics = { updates: 0, submits: 0 },
) {
  const header =
    '<header><button aria-label="Menu">Menu</button><button id="header-message-icon" aria-label="Email"></button></header>';
  const script = `
    window.answers={};window.skills=[];
    function welcome(){document.body.innerHTML=${JSON.stringify(header + "<h1>Olá Pessoa, vamos continuar sua candidatura?</h1><p>Você está se candidatando para " + title + '</p><button onclick="additional()">Continuar</button>')};}
    function additional(){document.body.innerHTML=${JSON.stringify(header + `<h1>Dados adicionais</h1><fieldset><legend>Alguém que trabalha nesta empresa indicou você para esta vaga?</legend><label><input type="radio" name="referral" value="Sim">Sim</label><label><input type="radio" name="referral" value="Não" checked>Não</label></fieldset><fieldset><legend>Você trabalha na empresa Fixture?</legend><label><input type="radio" name="employee" value="Sim">Sim</label><label><input type="radio" name="employee" value="Não" checked>Não</label></fieldset><label>Onde você encontrou essa vaga? (Opcional)<select><option value="">Selecione</option></select></label><button onclick="questionsIntro()">Salvar e continuar</button>`)};}
    function questionsIntro(){document.body.innerHTML=${JSON.stringify(header + '<h1>Perguntas criadas pela empresa</h1><p>Para continuar com o processo responda as perguntas a seguir.</p><button onclick="questions()">Responder agora</button>')};}
    function questions(){document.body.innerHTML=${JSON.stringify(
      header +
        `<h1>Perguntas criadas pela empresa Fixture</h1><form onsubmit="event.preventDefault();saveQuestions()">
      <section><h3>1. Adoramos saber como nossos talentos nos encontram! Por onde você ficou sabendo desta oportunidade? *</h3>${["LinkedIn", "Página de Carreiras da Empresa"].map((v) => `<label><input type="radio" name="source" value="${v}" required>${v}</label>`).join("")}</section>
      <section><h3>2. Você tem interesse em atuar no regime PJ? *</h3><label><input type="radio" name="pj" value="Sim" required>Sim</label><label><input type="radio" name="pj" value="Não" required>Não</label></section>
      <section><h3>3. Qual é a sua remuneração atual (ou última) + benefícios? *</h3><textarea id="input-Qual é a sua remuneração atual (ou última) + benefícios?" name="compensation" required></textarea></section>
      <section><h3>4. Qual é a sua pretensão salarial? *</h3><textarea name="salary" required></textarea></section>
      ${options.unknown ? '<section><h3>5. Qual é sua certificação profissional? *</h3><textarea name="certification" required></textarea></section>' : ""}
      ${options.unknownRadio ? '<section><h3>5. Você possui certificação profissional? *</h3><label><input type="radio" name="certification" value="Sim" required>Sim</label><label><input type="radio" name="certification" value="Não" required>Não</label></section>' : ""}
      <button>Salvar e continuar</button></form>`,
    )};}
    function saveQuestions(){window.answers=Object.fromEntries(new FormData(document.querySelector('form')));document.body.innerHTML=${JSON.stringify('<div role="dialog"><h3>Apresente-se!</h3><p>Você pode fazer uma apresentação pessoal para esta vaga.</p><button onclick="personalization()">Personalizar candidatura</button><button onclick="finish()">Finalizar candidatura</button></div>')};}
    function personalization(){document.body.innerHTML=${JSON.stringify(header + '<h1>Apresente-se!</h1><p>Fale sobre você e sua trajetória profissional (etapa opcional).</p><textarea id="personalization-step-text-area"></textarea>' + ["C#", ".NET", "Microsoft SQL Server"].map((v) => `<button onclick="window.skills.push('${v}');this.setAttribute('aria-label','${v} Remover habilidade destacada')">${v} Destacar habilidade</button>`).join("") + '<button onclick="finish()">Finalizar candidatura</button>')};}
    async function finish(){window.answers.presentation=document.querySelector('textarea')?.value;window.answers.skills=window.skills;await fetch('/submit-fixture',{method:'POST',body:JSON.stringify(window.answers)});${options.ambiguous ? "document.body.innerHTML='<h1>Aguarde</h1><p>Processando sua candidatura. Não repita este envio.</p><button onclick=\"finish()\">Finalizar candidatura</button>';" : "document.body.innerHTML=" + JSON.stringify(header + "<h1>Candidatura finalizada!</h1><p>Agora a empresa Fixture vai analisar sua compatibilidade com a vaga e decidirá se você avança para as próximas etapas. Fique de olho no seu e-mail e telefone.</p><button>Acompanhar candidatura</button><p>" + "Rodapé da Gupy. ".repeat(20) + "</p>") + ";"}}
  `;
  await page.route("https://*.gupy.io/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "login.gupy.io") {
      const signed = (await page.context().cookies()).some(
        (c) => c.name === "candidate_session",
      );
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: signed
          ? header + "<h1>Minhas candidaturas</h1>"
          : '<form onsubmit="event.preventDefault();document.cookie=\'candidate_session=qa-only; Domain=.gupy.io; Secure; SameSite=Lax; path=/\';location.href=\'/candidates/applications\'"><label>E-mail<input type="email"></label><label>Senha<input type="password"></label><button>Entrar</button></form>',
      });
    }
    if (url.hostname !== "fixture.gupy.io") return route.abort();
    if (url.pathname === "/account-update") {
      metrics.updates++;
      return route.fulfill({ body: "{}" });
    }
    if (url.pathname === "/submit-fixture") {
      metrics.submits++;
      metrics.received = route.request().postDataJSON();
      return route.fulfill({ body: "{}" });
    }
    if (url.pathname === "/jobs/12345")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body:
          header +
          `<h1>${options.differentJob ? "Outro cargo completamente diferente" : title}</h1>` +
          (options.already
            ? `<p>Seu progresso 1 / 5. Acompanhe abaixo o andamento de cada etapa.</p><script>history.replaceState({},'', '${nativePath}')</script>`
            : `<button onclick="location.href='${nativePath}'">Candidatar-se</button>`),
      });
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<h2>Atualize seus dados</h2><p>Confirme seus contatos.</p><label>E-mail<input type="email" value="original@example.test"></label><label>Telefone<input value="11911111111"></label><button onclick="fetch('/account-update',{method:'POST'})">Atualizar</button>${options.contactBlocked ? "" : '<button onclick="welcome()">Me lembrar depois</button>'}<script>${script}</script>`,
    });
  });
  return metrics;
}
