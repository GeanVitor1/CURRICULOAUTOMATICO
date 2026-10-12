# Login Google e envio de candidaturas

## Configurar o Google Cloud

Esta instalação precisa de um cliente OAuth próprio. O código não pode emitir credenciais do Google nem usar o OAuth de outro aplicativo.

Nesta instalação local, o cliente **EmpreGatos Local** já foi criado no Google Cloud, suas credenciais foram importadas no `.env` e a conta responsável foi adicionada aos usuários de teste. O projeto continua em modo de teste. O login solicita apenas `openid email profile`; pela exceção documentada pelo Google para autenticação básica, outras contas não precisam ser adicionadas à lista de usuários de teste para esse fluxo. No primeiro acesso, uma pessoa sem conta no EmpreGatos recebe uma conta nova automaticamente. Quem já possui uma conta local com o mesmo e-mail precisa conectar o Google após entrar com sua senha.

1. Acesse [Google Auth Platform](https://console.cloud.google.com/auth/overview) com a conta responsável pelo EmpreGatos. Selecione ou crie o projeto.
2. Em **Branding**, configure nome EmpreGatos, e-mail de suporte e contato do responsável. Em **Audience**, use público externo. Se adicionar permissões além da autenticação básica, durante os testes será necessário incluir os e-mails autorizados em **Test users**.
3. Em **Clients**, crie um cliente do tipo **Web application**. Para esta instalação local, use a origem `http://127.0.0.1:5173` e o URI de redirecionamento exato `http://127.0.0.1:5173/api/auth/google/callback`.
4. Baixe o JSON desse cliente, salve na pasta do projeto com o nome `google-client.local.json` e execute `npm run configure:google`. Esse arquivo é privado e ignorado pelo Git. Também é possível indicar outro caminho: `npm run configure:google -- /caminho/client_secret.json`.
5. Reinicie `npm run dev` e abra `http://127.0.0.1:5173/login`. Login e cadastro usam o botão **Continuar com Google**. Uma conta existente com senha conecta o Google em **Minha conta → Conectar Google**, usando o mesmo e-mail.

O importador grava `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` no `.env` privado, sem exibir as chaves. O callback precisa pertencer a `APP_ORIGIN`; em produção é HTTPS. A URL, incluindo porta e caminho, precisa coincidir com a registrada no Google. Não alterne localhost e 127.0.0.1 no mesmo login: cookies pertencem ao host.

O Vite bloqueia o acesso HTTP aos arquivos de credenciais e à pasta `.data`. Seu proxy mantém o host original para que o início do login Google não redirecione de volta para si mesmo.

O backend usa código de autorização, PKCE, estado vinculado ao navegador, nonce e desafio de uso único com validade de dez minutos. A biblioteca oficial valida assinatura, emissor, audiência e validade do ID token. O e-mail precisa ser verificado pelo Google. A identidade é vinculada pelo `sub`, não apenas pelo e-mail. Contas locais existentes exigem login prévio para vinculação; uma colisão de e-mail nunca funde contas automaticamente. Tokens de acesso e refresh tokens não são persistidos.

Contas criadas com Google não recebem senha artificial. Sua exclusão exige confirmação de e-mail e autenticação Google feita nos últimos cinco minutos. Logout invalida desafios de vinculação ou confirmação pendentes.

Referências: [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect), [público e exceção para autenticação básica](https://support.google.com/cloud/answer/15549945?hl=en), [biblioteca oficial](https://github.com/googleapis/google-cloud-node-core/tree/main/packages/google-auth-library).

## Por que nenhum currículo era enviado nesta instalação

Selecionar sites e iniciar uma busca não configura uma integração de candidatura. O `.env` inicial não continha gateway de envio, credenciais de parceiro nem autorização de navegador por provedor. Além disso, o Chromium do Playwright não pôde ser instalado no macOS 12; o Google Chrome 152 instalado também não iniciou nesse sistema.

O login Google permite entrar no EmpreGatos. Ele não fornece acesso às contas dos portais, formulários de emprego ou APIs de candidaturas.

Para enviar de verdade, configure uma destas integrações:

- **API/gateway:** um serviço que efetivamente transmite a candidatura ao destino e devolve o recibo. Configure `APPLICATION_WEBHOOK_URL`, `APPLICATION_WEBHOOK_TOKEN`, `APPLICATION_WEBHOOK_AUTHORIZED=true` e `APPLICATION_WEBHOOK_PORTALS` apenas com os portais cobertos pelo serviço. O gateway recebe o arquivo PDF/DOCX original em base64 e usa `Idempotency-Key` para impedir duplicatas. O contrato existente está em [CONEXOES.md](CONEXOES.md).
- **Navegador em ambiente autorizado:** use um servidor com sistema compatível, instale `npx playwright install chromium` ou informe `PORTAL_BROWSER_EXECUTABLE_PATH` para um navegador compatível. Habilite somente os provedores com permissão em `PORTAL_BROWSER_AUTHORIZED`. Depois, cada pessoa conecta sua sessão em **Automação → Contas dos sites** e confirma o currículo do portal quando necessário. Atualizações dos formulários, verificação de acesso e perguntas não respondidas podem exigir intervenção.

Não configure um webhook fictício que apenas retorna `sent`. Um recibo produzido por um simulador não comprova candidatura. A Gupy documenta o fluxo de candidatura rápida com Bearer Token gerado pela plataforma da empresa/parceiro; o login comum de candidato não fornece esse token. O LinkedIn Apply Connect é uma integração de parceiros e ATS. A entrevista atual usa LinkedIn, Gupy, Glassdoor e InfoJobs; outras fontes de busca existentes não ganham envio por serem adicionadas.

Correções nesta entrega: envio de PDF/DOCX também para fontes autorizadas por empresa; prioridade para API configurada quando há sessão de navegador; limite diário baseado em tentativas de envio; candidaturas sem integração não ocupam a cota das que podem ser enviadas; processamento de pendências continua após uma candidata inelegível; capacidade exibida considera a conta e a disponibilidade do navegador. A interface informa o motivo específico de bloqueio por site.

Sem uma integração real de candidaturas, testes locais do envio só comprovam o comportamento do aplicativo com respostas controladas. Nenhum envio real a empregadores foi executado nesta implementação.

Referências: [Gupy — candidatura rápida](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas-copy), [LinkedIn Apply Connect](https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/create-apply-connect-jobs), [requisitos do Playwright](https://playwright.dev/docs/intro), [Chrome 151 e macOS 12](https://developer.chrome.com/release-notes/151).

## Validação desta implementação

- `npm run typecheck` e `npm run build`: aprovados.
- `npx vitest run tests/google-auth.test.ts tests/google-config.test.ts tests/automatic-submission.test.ts`: 27 testes aprovados. Incluem verificação criptográfica do ID token, desafio de uso único, vinculação de contas, exclusão com confirmação Google, importação privada de credenciais, transmissão do DOCX original, escolha da API, limite diário e preservação de resultados desconhecidos.
- A execução ampliada das outras suítes aprovou os testes existentes selecionados. O cenário de sessão nativa com Chromium foi excluído porque o navegador não inicia neste sistema.
- Página `/login` e endpoint `/api/health` responderam HTTP 200 na instalação local.
- O fluxo com credenciais reais abriu a seleção de conta e o consentimento do Google. A conta local existente foi conectada pelo usuário em **Minha conta** após autenticação com sua senha. Uma nova entrada pelo Google retornou a `/app`; `/api/auth/me` respondeu HTTP 200 com `googleConnected: true` e `recentGoogleAuthentication: true`. O endpoint `/api/auth/providers` informa `google: true`.
- Os arquivos de credenciais têm permissão `0600` e são ignorados pelo Git. Requisições a um arquivo de exemplo privado, inclusive `?raw` e `/@fs/`, receberam HTTP 403; a página de login continuou respondendo HTTP 200.
- As respostas de Google e do serviço receptor utilizadas nos testes automatizados são controladas; os testes não enviam candidaturas a empregadores. Candidaturas reais permanecem pendentes da integração externa.
