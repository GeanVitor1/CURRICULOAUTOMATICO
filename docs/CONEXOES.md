# Conexões dos candidatos — capacidades atuais

Cada fonte informa separadamente autenticação, busca e envio em **Automação → Contas dos sites** e na entrevista. A seleção de um site não conecta a conta. Abertura do site oficial também não comprova conexão ou candidatura.

## LinkedIn oficial

Com `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` e `LINKEDIN_REDIRECT_URI` configurados e o produto OpenID Connect habilitado, **Conectar LinkedIn** abre a autorização oficial em uma janela. O callback retorna ao Empregatos e atualiza a conexão. São solicitados apenas `openid profile email`, que autenticam a conta e não permitem pesquisar empregos ou enviar candidaturas. Não é uma verificação de identidade civil.

O backend valida estado aleatório vinculado ao usuário, prazo de dez minutos e uso único. Troca o código e consulta `userinfo` no servidor. Tokens não são devolvidos nem persistidos; apenas metadados da autenticação são armazenados cifrados. Autorização expirada, recusada ou falha não aparece como conectada. Desconectar/excluir conta remove os metadados.

Desconexão e conclusão OAuth compartilham o lock do workspace e uma geração da autorização. Uma troca de código que terminar depois de desconectar ou iniciar uma autorização nova não pode restaurar a conexão antiga.

Sem as credenciais do aplicativo, o OAuth é informado como não configurado. O round trip com aplicativo real não foi validado nesta revisão. [Permissões LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) e [OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).

## Adaptadores por navegador em ambientes autorizados

Os adaptadores de LinkedIn, Gupy, Glassdoor e InfoJobs permanecem implementados, mas exigem `PORTAL_BROWSER_AUTHORIZED` com autorização explícita do serviço para cada provedor. O padrão é vazio. Consentimento do candidato não substitui autorização do portal. A busca automatizada LinkedIn também exige `PORTAL_DISCOVERY_AUTHORIZED`; as [restrições do LinkedIn](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions) impedem tratar esse recurso como liberado para qualquer instalação.

Quando autorizado, o login interativo serve apenas para obter uma sessão privada para o adaptador. Não é OAuth. O navegador auxiliar é reservado à autenticação/verificação; buscas são feitas pelo worker. Login social com domínio diferente não é suportado nesse adaptador. Nenhum CAPTCHA é contornado.

**Confirmar conexão** exige um sinal de conta autenticada. Abrir o login, encontrar um link de perfil no anúncio ou selecionar o site não confirma uma conexão. Glassdoor apresentou uma verificação de acesso na inspeção pública; essa janela pode exigir uma ação da pessoa ou continuar bloqueada.

O candidato pode confirmar que o currículo do portal foi atualizado com o arquivo atual. Isso permite usar candidaturas que enviam o perfil armazenado no site, especialmente o InfoJobs. Sem essa aprovação ou upload do original aprovado no formulário, o adaptador interrompe o envio. Trocar o currículo invalida a aprovação anterior pelo identificador do arquivo.

A entrevista também permite informar telefone com DDD. O preenchimento usa nome, e-mail, telefone, cidade e links aprovados. Perguntas de experiência, documentos, autorizações legais, testes ou outros dados ausentes exigem a pessoa. Não há respostas inventadas. Os adaptadores tentam formulários internos compatíveis: Easy Apply no LinkedIn/Glassdoor, candidatura da Gupy e inscrição com perfil no InfoJobs. Redirecionamentos para empresas e outros sistemas geram uma pendência. Os portais podem mudar os formulários ou limitar o acesso.

O envio participa da fila existente e respeita currículo aprovado, sites escolhidos, compatibilidade, rotina ativa e limite diário. Há claim atômico antes da chamada externa e estado **Enviando**. Somente confirmação do receptor registra **Enviada**. Falhas sem confirmação ficam com **Resultado desconhecido**, sem repetição automática; perguntas adicionais ficam com **Requer ação manual**. Envios interrompidos são recuperados após 150 segundos, sem retry. O gateway externo continua opcional e deve representar uma integração realmente autorizada.

## Instalação e armazenamento

```powershell
npm install
npx playwright install --with-deps chromium
npm run dev
```

As sessões ficam cifradas com AES-256-GCM em `DATA_DIR/portal-sessions`, usando a chave privada já existente do servidor. Senhas de login não são gravadas; cookies e armazenamento do navegador são credenciais e ficam privados. A API nunca os retorna nem os inclui na exportação da conta. Desconectar remove a sessão; excluir a conta remove todas as conexões.

Janelas temporárias expiram em quinze minutos. Há até quatro logins simultâneos por padrão (`PORTAL_LOGIN_LIMIT`). Um lock por pessoa/site evita login e candidatura simultâneos, inclusive entre API e worker. `PORTAL_CONNECTIONS_ENABLED=false` desativa o recurso mesmo que o provedor esteja autorizado. Sessões sem verificação há mais de doze horas ou com todos os cookies expirados aparecem como expiradas; antes de enviar, o adaptador também verifica autenticação no portal. API e workers precisam compartilhar volume privado de `DATA_DIR` e chave; somente PostgreSQL/Redis não compartilha arquivos. Em Linux, use usuário sem privilégios com sandbox do Chromium.

A navegação fica restrita ao site escolhido e seus subdomínios. Requisições para rede privada, protocolos não HTTPS e WebSockets são recusadas. Os formulários não recebem um endereço arbitrário informado pelo cliente.

## Histórico de validação anterior

Validação da entrega: **139 testes unitários/API e 22 cenários de navegador aprovados**, com TypeScript e build de produção aprovados.

Os testes usam navegador real com páginas controladas para autenticação, isolamento entre usuários, persistência cifrada, restauração e desconexão. Os quatro adaptadores têm testes de confirmação, perguntas pendentes, currículo não aprovado, redirecionamento externo e ausência de confirmação sem envio duplicado. Nenhuma candidatura de teste foi enviada a um empregador.

O teste de interface abre o login público real do LinkedIn dentro da entrevista, verifica desktop/celular e comprova que confirmar sem login continua pendente. Gupy e InfoJobs também tiveram seus formulários públicos inspecionados. **Envios com contas reais ainda dependem de conectar essas contas e validar os formulários autenticados de cada portal.** Estes testes não demonstram funcionamento de todos os formulários reais nem acesso desbloqueado ao Glassdoor.

Os números acima são históricos. A validação atual, a pesquisa das APIs e as limitações por fonte estão em [REDESIGN-E-INTEGRACOES-2026-10-09.md](REDESIGN-E-INTEGRACOES-2026-10-09.md). Os testes de envio usam páginas/respostas controladas e não comprovam submissão a empregadores reais.

Referências: [autenticação no Playwright](https://playwright.dev/docs/auth), [Gupy Quick Apply](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas-copy), [API InfoJobs.net](https://developer.infojobs.net/documentation/operation-list/index.xhtml). A API Gupy depende de credenciais e condições de empresa/parceiro; documentação InfoJobs.net não comprova cobertura de InfoJobs Brasil.
