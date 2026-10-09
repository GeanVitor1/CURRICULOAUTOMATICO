# Redesign e integrações — 09/10/2026

Esta revisão atende às onze capturas e ao pedido de correção geral. O diretório já continha alterações locais extensas; elas foram preservadas. Nenhum envio real a empregadores foi feito.

## Problemas, causas e mudanças

| Problema observado | Causa no código | Mudança implementada |
| --- | --- | --- |
| Resumo e aviso de automação colados | Blocos irmãos sem agrupamento e ritmo de espaçamento | Um painel de estado, com aviso contextual, separação interna e controles proporcionais |
| Dropdown nativo e filtros desalinhados | Layout flex com campos de larguras independentes e select sem estilização do popup | Grid responsivo, campos de 44 px, picker nativo personalizável no Chromium e fallback nativo acessível |
| Cidade, salário e limpar filtros sem relação visual | Formulário misturado a popover absoluto | Grupo de cidade com submit; salário expansível no fluxo; ação de limpeza alinhada |
| Estado vazio indistinguível de falha | Mensagem única quando a lista tinha zero itens | Primeira busca, processamento, nenhuma correspondência e falha parcial/total com mensagens distintas |
| Feed LinkedIn apresentado como formulário de login | Campos editáveis coletados antes de verificar autenticação | Verifica autenticação primeiro e retorna zero campos de login após autenticar; encerra a exibição da janela de verificação |
| Conexão prometia envio com base em login/sessão salva | Flags de capacidade misturavam autenticação com operação de candidatura | Capacidade por provedor, escopos OAuth explícitos e autorização do serviço independente do consentimento do candidato |
| Sessão antiga considerada conectada indefinidamente | Presença do arquivo cifrado usada como validade | Metadados de verificação, expiração conservadora após 12 h ou todos os cookies expirados; verificação no portal antes do envio |
| Antes/depois mudava quase só o texto | Mesmas cartas e linhas nos dois estados | Conteúdo distinto, abas/arquivos/notas e disposição irregular antes; perfil, oportunidades e histórico organizados depois |
| Prévia permanecia parada | Reprodução iniciava desativada e havia três painéis esquemáticos | Seis etapas, progresso, resultados ilustrativos, reprodução ao entrar em vista, pausa/manual e movimento reduzido |
| Busca Gupy incompleta | Uma única página de 50 resultados por consulta | Até três páginas de 50 por cargo/cidade; detecta página repetida e deduplica por ID |
| Fonte malformada parecia vazia | Todos os registros rejeitados silenciosamente | Erro explícito quando a fonte devolve registros, mas nenhum anúncio tem formato válido |
| Requisições repetidas após 429 | Ausência de cooldown nas páginas públicas | Respeita Retry-After, com espera entre 1 minuto e 1 hora por host |
| Envio em andamento parecia resultado já desconhecido | Estado de incerteza também usado como claim | Estado Enviando; claim atômico e recuperação de interrupções sem repetir envios |
| Gateway ignorava perguntas adicionais/refusa em HTTP 200 | Contrato considerava apenas sucesso ou HTTP 422 | Trata action_required e not_submitted; rejeita recibo em branco ou ID de outra candidatura |
| Uma fonte sem envio impedia automação de todas as outras | Ativação exigia que todos os sites selecionados tivessem a mesma capacidade | Ativação por fontes autorizadas; demais sites continuam em preparação/intervenção, com aviso antes de ativar |

## Arquitetura e configuração

- `server/provider-capabilities.ts` centraliza capacidades e autorização por provedor. As consultas e os envios continuam nos adaptadores existentes; não há tentativa de importar cookies do navegador pessoal.
- `server/linkedin-oauth.ts` implementa Authorization Code para cliente confidencial no servidor: estado aleatório vinculado à conta, expiração em 10 minutos, consumo único por rename atômico, troca de código e consulta ao userinfo oficial. Só persiste metadados cifrados. Tokens, código de autorização e resposta pessoal do provedor não vão ao frontend ou aos logs.
- Configure `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` e `LINKEDIN_REDIRECT_URI`, com o produto OpenID Connect habilitado no aplicativo LinkedIn. A URL deve corresponder ao registro do aplicativo. Produção exige HTTPS. Esses valores não foram inventados nem preenchidos nesta sessão.
- A janela OAuth vai diretamente ao domínio oficial e retorna ao callback do Empregatos. A janela de origem aceita mensagens apenas de sua própria origem e da janela criada. Cancelamento/fechamento libera a interface. OAuth autentica a conta; não prova identidade civil nem concede permissão de emprego.
- `PORTAL_BROWSER_AUTHORIZED` lista somente portais com autorização explícita do serviço para navegador. Fica vazio por padrão. Os adaptadores existentes permanecem disponíveis para ambientes autorizados e testes controlados. CAPTCHA e desafios não são contornados.
- `PORTAL_DISCOVERY_AUTHORIZED` habilita o acesso automatizado a páginas LinkedIn somente se autorizado pelo provedor. Sem isso, busca e envio LinkedIn permanecem indisponíveis e a interface permite abrir o site oficial.
- `APPLICATION_WEBHOOK_*` mantém o contrato de integração autorizada. Requer autorização real do operador e do receptor; configurar uma flag não obtém permissões do portal.
- As tarefas continuam em fila persistida no banco, com heartbeat, lease e prevenção de duplicidade. HTTP de busca apenas enfileira. Envios são processados no worker, com limite diário e sem retry automático de resultado incerto. Recovery verifica Enviando a cada 30 s; claims de mais de 150 s ficam desconhecidos.

## Capacidades verificadas e limitações

| Fonte | Verificação real nesta revisão | Autenticação/envio |
| --- | --- | --- |
| Gupy | 99 anúncios reais para Auxiliar administrativo; fila → banco → UI, filtros, reload e solicitação duplicada passaram | Listagem pública do portal, sem SLA de API de candidato. Quick Apply oficial requer credenciais/permissões de empresa ou parceiro e condições da vaga. Envio real não validado |
| Greenhouse | 733 anúncios do mural Stripe | API pública de leitura; API de envio exige acesso apropriado da organização. Nenhum envio feito |
| Lever | 309 anúncios do mural Palantir | API pública de leitura; nenhum envio feito. O primeiro mural consultado, Netflix, respondeu 404 e não foi apresentado como resultado vazio |
| Ashby | 134 anúncios do mural Notion | API pública de leitura; nenhum envio feito |
| LinkedIn | OAuth, estado, isolamento, expiração, callback e janela testados com respostas controladas | Não validado com aplicativo/credenciais reais. Escopos abertos são de identidade; APIs Talent exigem aprovação. Navegador automatizado não autorizado por padrão |
| InfoJobs Brasil | Adaptador de formulário verificado em páginas controladas | Busca Gemini depende de resultados citados; cobertura variável. A documentação infojobs.net não comprova acesso ao Brasil. Sem OAuth/API brasileira configurada |
| Glassdoor | Adaptador de formulário verificado em páginas controladas | Busca Gemini depende de resultados citados. Não há API de candidatura de pessoa configurada; bloqueios/redirecionamentos ficam pendentes |
| Jobicy/Adzuna | Preservados; testes de conector com respostas controladas | Não foram consultados ao vivo nesta revisão. Adzuna exige credenciais/licença/cobertura |

Os números são uma amostra datada de leitura, não uma garantia de cobertura ou de vaga ainda aberta. Os murais internacionais consultados validam o conector; não são cadastrados automaticamente no perfil de ninguém.

## Referências técnicas primárias

- [LinkedIn: permissões abertas e programas Talent](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access).
- [LinkedIn: OpenID Connect e userinfo](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2).
- [LinkedIn: Authorization Code para servidor](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
- [LinkedIn: restrições a software de automação](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions).
- [Gupy: autenticação de Recrutamento e Seleção](https://developers.gupy.io/v2.0/docs/autentica%C3%A7%C3%A3o-recrutamento-sele%C3%A7%C3%A3o).
- [Gupy: fluxo oficial de captação e candidatura rápida](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas-copy).
- [InfoJobs.net: operações e OAuth2](https://developer.infojobs.net/documentation/operation-list/index.xhtml).
- [Glassdoor: termos da API](https://www.glassdoor.com/crs/api/glassdoor-public-api-terms.pdf); não equivalem a uma permissão de envio automático de candidato.

## Evidências de validação

Resultados finais:

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Aprovado, incluindo TypeScript, Vite, backend e compressão Brotli/gzip |
| `npm run typecheck` após os últimos testes adicionados | Aprovado |
| `npm test` final | 20 arquivos, **209 testes aprovados**, 71,73 s |
| `npm run test:browser` | **49 aprovados, 1 sem execução**, 3,2 min |
| Verificação após adicionar ativação por fontes mistas | **11 aprovados**, incluindo o novo cenário; total de **50 cenários distintos aprovados** nesta revisão |
| `npx tsx scripts/verify-search-redesign.ts` | Gupy, Greenhouse, Lever e Ashby responderam com anúncios reais |
| Gupy pela API/fila/interface | Aprovado: 99 anúncios, persistência, filtros, reload e task ID reutilizado para chamada duplicada; zero candidaturas enviadas |
| `git diff --check` | Sem erro de whitespace; somente avisos da configuração LF/CRLF do Windows |

O teste sem execução é `portal-login-live.spec.ts`: não há autorização LinkedIn configurada para navegador. Ele não é contado como aprovado. OAuth real também não foi validado sem aplicativo/credenciais; protocolo, callback, expiração, recusa, replay, isolamento e revogação durante troca de código foram testados com respostas controladas. Os quatro adaptadores de candidatura foram testados com formulários locais, sem empregadores reais.

Uma rodada intermediária apresentou quatro falhas em testes de arquivos estáticos porque o build foi iniciado em paralelo à suíte e substituiu `dist` durante a leitura. A sequência foi corrigida: build concluído antes dos testes finais; os 209 passaram. Um teste de teclado também foi atualizado dos nomes das três etapas antigas para as seis novas etapas, mantendo as verificações de foco e seleção.

Capturas `artifacts/redesign-*` cobrem antes/depois, seis etapas, filtros, dropdown aberto, conexões e anúncios reais, em desktop e celular. Layout foi verificado de 320 a 1920 px, com navegação por teclado e movimento reduzido. As imagens principais foram também inspecionadas visualmente após os testes. `artifacts/redesign-live-search.json` registra consultas de conectores; `artifacts/redesign-live-workflow.json` registra o fluxo real pela fila, sem dados pessoais de QA.

## Trabalho ainda necessário para lançamento

1. Registrar/configurar aplicativo LinkedIn e testar o round trip real; obter acessos aprovados para empregos se fizerem parte da oferta. Login não habilita esses acessos.
2. Credenciar integrações de envio com empresas/provedores; validar cada fluxo em sandbox ou obter autorização específica para candidaturas reais. Não se afirma que os quatro portais já enviam automaticamente em produção.
3. Validar PostgreSQL/Redis e múltiplos workers no ambiente de produção. O modo local PGlite e a fila persistida foram testados; sessões privadas em arquivos exigem volume/chave compartilhados entre API e workers.
4. Migrar coleções de vagas/candidaturas em JSONB para tabelas relacionais para maior escala. Continua o limite operacional de 2.000 vagas por workspace.
5. Completar requisitos operacionais já documentados: backups, retenção, responsável por privacidade e cobrança real antes de ofertar plano pago.

Essas pendências não são ocultadas pelo redesign. O produto foi corrigido e validado nos fluxos descritos; esta revisão não certifica prontidão integral para lançamento.
