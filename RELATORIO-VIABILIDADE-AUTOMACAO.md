# Viabilidade da automação do Empregatos

> **Atualização final de 23/10, 15h39 Brasília:** [verificação de Candidatura Rápida e dos 33 formulários](#validação-final--candidatura-rápida-e-formulários-existentes). Três indícios de modalidade rápida no índice, todos encerrados na origem; zero rápidos abertos e compatíveis comprovados. Os 33 formulários foram reavaliados: zero elegíveis para novo envio. Piloto empresarial especificado, não iniciado. Produção preservada; **0/5 confirmadas**.

Data: **23/10/2026**. Pesquisa documental e demonstração encerradas às **14h48 de Brasília**, com estado do banco lido às **14h47**. Referência anterior lida: [Destinos de candidatura — especialmente “Expansão orientada a candidaturas submetíveis”](docs/DESTINOS-SUBMETIVEIS-2026-10-23.md).

**Decisão técnica: não está comprovada uma solução oficial para vender candidatura autônoma universal na Gupy a partir da conta do candidato. Existe integração empresarial oficial, condicionada a contratação, permissões e participação das empresas. O Empregatos continua em 0/5 candidaturas reais confirmadas em 23/10.** Abrir o login funcionou; autenticar, restaurar uma sessão Gupy válida e concluir candidatura por ela não foram demonstrados. Não houve nova transmissão nesta investigação.

## 1. A Gupy oferece uma solução oficial viável para nosso produto?

**Para um produto integrado a empresas parceiras: há caminho documentado. Para candidatar qualquer usuário a qualquer empresa usando somente sua conta pessoal: não foi encontrada uma integração oficial que autorize esse funcionamento.** “API pública” designa documentação/interface de integração, e não acesso anônimo ou permissão concedida pelo candidato.

| Canal oficial | Operações documentadas | Credencial e condição | Serve ao Empregatos hoje? |
|---|---|---|---|
| Interface de candidato | Consultar vagas; entrar/criar cadastro; candidatar-se; acompanhar processos; manter currículo | Conta do próprio candidato; obrigações do serviço | Usável pela pessoa. Delegação persistente ao nosso backend não foi estabelecida |
| Captação externa R&S | Consultar vaga, criar registro de candidatura, enviar convite | Bearer empresarial com permissões correspondentes | Sem empresa patrocinadora/token autorizado, não |
| API de Candidatura Rápida | Enviar dados essenciais e respostas adicionais; receber identificadores | Token empresarial, permissões V1/V2 e vaga dessa modalidade | Caminho para piloto contratado; não habilitado nesta instalação |
| Candidatura Rápida na página publicada | Inscrição simplificada sem login, quando a vaga oferece essa modalidade | Regras e consentimentos daquele formulário; não concede API administrativa | Possibilidade a avaliar por destino. Nenhuma das três vagas remanescentes foi comprovada nessa modalidade |
| Integração de Job Board parceiro | Receber vagas selecionadas pelas empresas em feed XML/JSON | Solicitação aprovada, cadastro do parceiro e URL/token fornecidos pela Gupy | Pode melhorar oferta autorizada; feed não autoriza submissão |

O guia de autenticação exige perfil **master ou administrador**, com permissão para gerenciar tokens. A documentação geral informa planos **Premium ou Enterprise** para geração de tokens; disponibilidade comercial deve ser confirmada com a Gupy. O Bearer de R&S é descrito como não expirável; isso não se aplica a cookies do candidato. Tokens, escopos e empresas autorizadas precisam ser delimitados, revogados e mantidos apenas no backend. Não solicitamos nem utilizamos credenciais empresariais de terceiros. Fontes: [autenticação R&S](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o-recrutamento-sele%C3%A7%C3%A3o), [requisito de plano](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o).

No fluxo externo comum, `POST /api/v1/jobs/{jobId}/applications` devolve um identificador de candidatura, mas o guia prevê **convite e complementação pelo candidato**. O registro inicial não deve ser exibido como inscrição integral concluída. Há contratos distintos para conflito de pessoa já cadastrada e de candidatura já existente; não se deve interpretar qualquer HTTP 409 como sucesso. Não foram feitas chamadas a essas APIs. Fonte: [captação externa](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas).

O fluxo rápido documenta `POST /api/v2/applications/quick-apply`, `applicationId`, consulta de perguntas e respostas obrigatórias. `hasDisqualifyingAnswer: false` não significa aprovação na seleção. Não é um endpoint de candidato liberado pelo login pessoal. Fonte: [guia de Candidatura Rápida](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas-candidatura-rapida).

**Parceria existe:** o Developer Hub encaminha ao formulário **Programa de Parceiros de Tecnologia da Gupy**. Existe também integração específica com Job Boards e um programa comercial de indicação/comissões, que são propostas diferentes. Nenhum concede automaticamente acesso de escrita às vagas de todas as empresas. Não foi enviado formulário ou mensagem em nome do titular nesta etapa. Fontes: [formulário tecnológico ligado pelo Developer Hub](https://docs.google.com/forms/d/e/1FAIpQLSc4Zd_dqac7x9WrnuivOJg_h8mP8oYJcauYXZSdj9XDRtjqDA/viewform), [Job Boards parceiros](https://developers.gupy.io/docs/integra%C3%A7%C3%A3o-com-job-boards-parceiros), [programa comercial](https://info.gupy.io/programa-de-parcerias).

## 2. É possível usar uma sessão autorizada do candidato sem extensão?

**É tecnicamente possível construir um navegador isolado e persistir o estado da sessão. Isso já tem componentes no repositório. Não foi comprovado que a Gupy permita ao Empregatos operar essa sessão de modo comercial e independente.** Não foi encontrado OAuth de candidato para delegar candidaturas ao nosso produto. Login social na Gupy autentica a pessoa perante a Gupy; não entrega ao Empregatos uma autorização de integração. Fontes: [acesso do candidato](https://suporte-candidatos.gupy.io/s/article/Como-acessar-a-Gupy?language=pt_BR), [autenticação oficial das APIs](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o-recrutamento-sele%C3%A7%C3%A3o).

O mecanismo existente em `server/portal-browser-service.ts` cria contexto Playwright próprio, permite login interativo e salva `storageState` cifrado com AES-GCM, filtrando cookies/origens para o portal. Não exige extensão. `server/portal-cloud.ts` transporta comandos cifrados para o Sandbox; `server/portal-sessions.ts` mantém a alternativa local. Isso é constatação de código, não certificação de segurança nem validação de uma conta Gupy real.

**Restrição documental decisiva:** os [termos atuais de R&S para candidatos, versão 01/07/2026](https://www.gupy.io/termos-de-uso-recrutamento-e-selecao-candidatos), estabelecem acesso individual e intransferível e proíbem fornecer dados de acesso a terceiros. Também vedam candidaturas em nome de terceiros, acesso não autorizado e ações contra a segurança. Não foi localizada exceção expressa para agentes pessoais delegados. Nossa conclusão operacional é condicionar a custódia da sessão e a submissão pelo serviço a esclarecimento/autorização formal da Gupy; não é uma afirmação de que todo navegador automatizado seja tecnicamente proibido. A autorização já dada pelo usuário ao Empregatos não modifica os termos do destino.

Assim, não pedimos senha, código de acesso ou importação de cookies do navegador pessoal para experimentar uma solução cuja autorização ainda não está estabelecida. Não houve criação de conta fictícia na Gupy ou tentativa de transformar cookies em token administrativo.

## 3. Quais limitações impedem ou condicionam o funcionamento?

| Limite | Consequência prática |
|---|---|
| Autorização do destino ainda não estabelecida para sessão delegada | Não liberar executor autônomo Gupy com base apenas no consentimento do nosso usuário |
| Nenhuma sessão Gupy salva na instalação | Não há credencial de candidato pronta para a rotina; metadados consultados no banco retornaram ausentes |
| Validade real desconhecida | Cookies, sessão no servidor, revogação e novas verificações podem exigir reconexão; não prometer “conecte uma vez para sempre” |
| Autenticação social e desafios | Provedor pode recusar o navegador gerenciado ou pedir nova verificação. O teste anônimo não exerceu esses caminhos |
| Formulários e etapas variáveis | Currículo, perguntas eliminatórias, termos por empresa e eventuais testes precisam ser satisfeitos sem inventar respostas |
| Infraestrutura de sessão | Persistência após reinício/expiração do Sandbox, isolamento entre titulares, rotação de chaves, exclusão e recuperação precisam de validação antes de uso comercial |
| Confirmação e duplicidade | Navegar ou clicar não basta. Sem confirmação verificável, resultado incerto conserva bloqueio e reserva |

Na alternativa local, o código considera a verificação antiga após 12 horas. O serviço de navegador na nuvem deriva metadados de expiração dos cookies e admite validade desconhecida; isso não prova validade da sessão no servidor. A chave de cifragem do serviço fica em seu diretório: cifragem isoladamente não demonstra proteção contra comprometimento do ambiente. Nenhum desses limites foi mascarado por extensão, importação pessoal ou alteração de política.

O mecanismo existente `portalAccess` reconhece desafios visíveis e bloqueios. CAPTCHA, autenticação adicional, vídeo, avaliação e respostas pessoais não devem ser resolvidos por artifícios do backend. A ausência de CAPTCHA em uma única tela anônima não comprova ausência durante autenticação ou submissão. O [suporte de acesso](https://suporte-candidatos.gupy.io/s/article/Como-acessar-a-Gupy?language=pt_BR) documenta cadastro, validação de e-mail e acesso social, sem contrato de sessão delegada ou duração garantida.

## 4. Foi implementada uma prova de conceito?

**Não foi implementada uma PoC de candidatura Gupy autenticada.** O requisito de caminho legítimo para esse modo de uso não foi satisfeito, e não dispomos de empresa piloto, credencial de integração e vaga de homologação autorizadas. Criar outro receptor fictício não comprovaria essa viabilidade.

Foi acrescentada uma **sondagem anônima isolada**, reutilizando o serviço de navegador do produto: [script](scripts/probe-gupy-managed-access.ts), [resultado](artifacts/gupy-managed-access-2026-10-23.json), [captura da tela real](artifacts/gupy-managed-anonymous-2026-10-23.png). Ela não abre o banco de produção, não importa perfil pessoal e bloqueia todas as requisições diferentes de GET/HEAD/OPTIONS. É demonstração de acesso público e de recusa de conexão falsa, sem currículo nem candidatura. Não é execução do Sandbox de produção.

| Verificação pedida | Resultado efetivo |
|---|---|
| Abrir login real em navegador próprio, sem extensão | **Funcionou**, `login.gupy.io/candidates/signin` |
| Identificar campos de autenticação | **Funcionou**, “E-mail ou CPF” e “Senha” |
| Recusar confirmação anônima | **Funcionou**; `confirm(null)` rejeitou e `metadata()` permaneceu `null` |
| Autenticação de candidato | Não exercida |
| Persistência/restauração autenticada | Não exercida |
| Expiração de uma sessão autenticada | Não exercida |
| Formulário de candidatura e preenchimento | Não exercidos |
| Submissão e confirmação no destino | Não exercidas |

A sondagem ocorreu entre **14h44m55s e 14h45m04s de Brasília**. Observou 39 GETs e bloqueou sete POSTs iniciados pela página. Não investigou o conteúdo desses POSTs nem atribuiu função a eles. Transmitiu **zero requisições de escrita** e chamou **zero operações de candidatura**. Não alterou detecção do navegador, não resolveu desafios e não contornou controles.

## 5. Quais operações funcionaram de verdade?

Nesta etapa: pesquisa em fontes oficiais; abertura da página real de login pelo componente existente; leitura dos controles; rejeição de confirmação sem autenticação; leitura do banco, metadados de sessão e estado de produção. TypeScript (`npx tsc --noEmit`) passou com os scripts novos. Não houve nova refatoração de adaptadores nem bateria adicional de testes simulados apresentada como resultado comercial.

Na etapa anterior, o backend real concluiu descoberta e resolução por Vercel Queues nas execuções `f1bd1208-799d-4160-be22-a0bf98f006b3` e `00a7e756-1a5c-4261-9f77-3a2eb78c8cca`. A última examinou 348 registros, preservou 15 e deixou três compatíveis sem canal independente. **Essas operações funcionaram, mas não produziram candidatura.** [Evidência anterior de filas e resultados](artifacts/discovery-quality-real-outcome-2026-10-23.json).

As três vagas continuam no banco sem candidatura criada:

| ID | Publicação | Pontuação | Estado |
|---|---|---:|---|
| `06c71f53-5d17-4975-84b4-9fcc7c0ebfa4` | [Pixeon — C#/.NET Pleno](https://vemprapixeon.gupy.io/jobs/12725139) | 92 | `no_destination` / `login_required` |
| `bb0770a9-fdaf-48ad-877e-aede1553b921` | [Víssimo — Full Stack](https://vissimo.gupy.io/jobs/12722191) | 70 | Mesmo bloqueio |
| `0db3bdc1-db2e-49c6-95b3-8f46bfb6e09a` | [Bancorbrás — Sistemas](https://bancorbras.gupy.io/jobs/12723856) | 78 | Mesmo bloqueio |

Não foram reavaliadas como candidaturas rápidas por mera hipótese, reenviadas ou liberadas manualmente. A elegibilidade acima é o estado do classificador persistido; qualquer envio futuro exige nova verificação de abertura, requisitos, respostas e autorização.

## 6. Quantas candidaturas reais foram confirmadas?

**Zero nesta etapa e zero automáticas confirmadas em 23/10/2026: meta efetivamente cumprida 0/5.** Houve zero novas tentativas, transmissões ou recibos nesta investigação. Uma reserva diária permanece ocupada pelo resultado incerto; saldo quatro. Recibos anteriores e testes controlados não foram somados ao dia.

### Global TI: resultado ainda desconhecido

| Evidência | Estado atual |
|---|---|
| Vaga / candidatura | `9a7b92d7-12b2-4fc5-942d-0cf3e4e6a071` / `69692d0e-e9ba-448b-bb78-0140f31dc5f5` |
| Única tentativa | `a8f0e151-72bb-43d2-b9b6-99bd7ce0a808` |
| Origem / executor | `user_triggered_automation` / `ats_browser`, adaptador Quickin |
| Execução de origem | `a1198849-24d0-46d6-9158-e3021c4bc43a` |
| Início / fim | 23/10, **10h52m21s / 10h52m39s Brasília** |
| Destino | Resposta não aceita ao POST `/apply`; status e corpo antigos descartados pela revisão executada |
| Estado persistido | `Resultado desconhecido`; `outcome: unknown`; recibo e `submittedAt` nulos |
| Reconciliação oficial | Consulta autorizada já enviada; conversa Gmail `1a16937d1e63856d`, aguardando resposta |

A consulta ao Gmail nesta etapa encontrou somente os dois e-mails de acesso já conhecidos, não um recibo ou resposta do suporte. A ausência de confirmação não prova ausência de candidatura. O detalhe HTTP antigo continua irrecuperável pelas evidências disponíveis. **Não houve reenvio, alteração de status ou liberação da reserva.** [Estado atual lido sem escrita](artifacts/automation-viability-state-2026-10-23.json), [reconciliação anterior](artifacts/globalti-safe-reconciliation-2026-10-23.json).

## 7. Qual arquitetura permite um produto comercialmente sustentável?

**Proposta implementável: serviço de descoberta e preparação com submissão verificável limitada aos canais contratados ou expressamente suportados; integrações de captação para empresas parceiras como eixo de expansão.** A sustentabilidade econômica ainda precisa ser validada por piloto pago, custo real e oferta recorrente. A arquitetura não comprova demanda, margem ou cinco envios por dia.

### Contratos de integração disponíveis

| Destino | Caminho sustentável documentado | Dependência concreta |
|---|---|---|
| Gupy | Empresa parceira + captação externa ou Candidatura Rápida | Token emitido pela empresa habilitada; acordo de uso; vagas autorizadas; homologação e reconciliação |
| Greenhouse | Job Board API ou integração de sourcing | GET de catálogo é público; POST exige Job Board API Key. Não confundir identificador público do quadro com essa chave |
| Lever | Postings API com criação de candidatura, ou formulário hospedado permitido | Escrita documentada usa API key; resposta de sucesso contém `ok` e `applicationId`; limites e perguntas variáveis |
| Ashby | `applicationForm.submit` e consulta da candidatura | Chave com `candidatesWrite`; leitura com `candidatesRead`; sucesso HTTP isolado não basta |
| SmartRecruiters | Application API com configuração, envio e consulta de estado | Cliente/parceiro autorizado; autenticação e escopo `candidate_applications_manage`; consentimentos por vaga |
| Formulários públicos de empresas / Quickin | Adaptadores existentes, somente destinos autorizados e sem barreira não suportada | Contrato do destino, preenchimento completo, consentimentos, upload validado e confirmação nova vinculada à vaga |
| E-mail explicitamente publicado para a vaga | Executor existente, destinatário e publicação verificados | Mensagem aceita pelo Gmail comprova transporte pelo provedor, não recebimento pelo recrutador; confirmação do destino exige evidência adicional |

Fontes técnicas: [Greenhouse Job Board](https://docs.greenhouse.io/job-board.html), [Lever Postings API](https://github.com/lever/postings-api), [Ashby envio](https://developers.ashbyhq.com/reference/applicationformsubmit), [Ashby consulta](https://developers.ashbyhq.com/reference/applicationinfo), [SmartRecruiters Application API](https://developers.smartrecruiters.com/docs/application-api), [autorização de parceiros SmartRecruiters](https://developers.smartrecruiters.com/docs/partners-overview). Esta tabela descreve possibilidades documentadas; **não afirma que novas credenciais, parcerias ou integrações de API foram implementadas ou homologadas**.

O produto pode reaproveitar descoberta, filtros por titular, autorização por destino, fila, worker, executor, diário de tentativa e reconciliação. A unidade comercial deve ser um canal e conjunto de empresas com capacidade medida, não um portal inteiro supostamente automatizável. Casos sem canal ficam em preparação/acompanhamento assistido, com acesso direto pelo usuário ao destino.

Para o piloto empresarial, o fluxo concreto é:

1. Selecionar empresa disposta a receber candidatos pelo Empregatos e confirmar com Gupy/ATS o uso e as permissões. Definir responsabilidade pelos dados, revogação e escopo; não pedir uma chave ampla de qualquer empresa apenas para desbloquear o produto.
2. Obter vaga de homologação autorizada e identidade de teste admitida pelo operador. Validar configuração, campos, upload, criação, consulta de recebimento e duplicidade, sem ocupar vaga real de terceiros.
3. Vincular cada operação a titular, empresa, vaga externa, execução e tentativa. Usar idempotência quando oferecida pelo contrato; caso contrário, diário local e reconciliação oficial antes de repetir uma transmissão incerta.
4. Distinguir registro/inserção, convite pendente, inscrição concluída e confirmação verificável. Persistir IDs, horário, contrato/revisão e resposta sanitizada; não guardar senha, documento, currículo ou token em logs.
5. Somente depois da homologação, habilitar esse canal na rotina normal para usuários que consentiram e vagas elegíveis. Medir chegadas novas, recebimentos, bloqueios e custo durante várias janelas agendadas.

Isso é um plano de piloto executável com parceiro; sua execução externa não ocorreu nesta etapa. O formulário oficial de parceria permite iniciar a negociação, mas uma inscrição no programa não garantiria aprovação ou acesso às três vagas atuais.

### Potencial medido e limites por perfil

A leitura atual encontrou **476 publicações distintas** no acervo pessoal. **146** têm data conhecida nos últimos 14 dias e não estão marcadas como encerradas. Elas não foram todas relidas no destino nesta etapa. A classificação abaixo usa somente o título, em famílias exclusivas; não simula currículos, não altera filtros e não atesta elegibilidade de outros candidatos.

| Família no acervo observado | Publicações recentes, não conhecidas como encerradas | Com formulário público observado ainda vigente no cadastro | Candidaturas confirmadas nesta etapa |
|---|---:|---:|---:|
| Software / infraestrutura | 97 | 32 | 0 |
| Dados / analytics | 11 | 0 | 0 |
| Comercial / marketing | 5 | 0 | 0 |
| Suporte / operações | 3 | 0 | 0 |
| Outros / não classificados pelo título | 30 | 1 | 0 |
| **Total** | **146** | **33** | **0** |

Os 33 formulários não equivalem a 33 destinos com preflight aprovado, vagas geograficamente adequadas, pessoas qualificadas ou recibos. Um formulário observado pode exigir CAPTCHA, dados ou experiência ausentes. Zero na coluna de formulários de outra família significa falta de evidência neste acervo, não inexistência de oferta no mercado. A amostra foi construída para um usuário de tecnologia; não permite estimar cobertura comercial de varejo, saúde, administrativo ou de toda a população.

Para o **perfil real C#/.NET/Angular, um ano, remoto Brasil/presencial Ilhéus**, a medição final é **3 compatíveis / 0 novas / 0 submetíveis liberadas / 0 confirmadas**. Mesmo que uma integração futura autorizasse todas as três, o estoque inicial seria no máximo **três candidaturas distintas**, antes da revalidação, sem sustentar cinco naquele dia. Para um perfil sênior, dados ou suporte, os números acima são somente estoque temático; sem perfil confirmado, geografia e requisitos correspondentes, a capacidade elegível não foi medida. Não há fundamento para prometer cinco a esses públicos.

Cinco por dia durante 30 dias exigem **150 vagas distintas elegíveis e recebidas por usuário**, mais reposição para rejeições e bloqueios. Por janela, a capacidade máxima é `min(saldo diário, oportunidades novas elegíveis com canal autorizado e preflight aprovado)`; a realização depende ainda da confirmação. Para este usuário o segundo termo é **zero**. Estoque acumulado de 14 dias e duas buscas com sobreposição não medem chegada diária. A meta deve ser um teto de execução condicionado à oferta, não uma garantia vendida.

Uma validação comercial precisa medir por segmento e região, durante pelo menos várias semanas: novas vagas únicas elegíveis por usuário/dia; proporção com canal contratado; preflights completos; confirmações do destino; reconciliações; intervenção humana e custo. Calcular margem com custos reais de descoberta, navegador, filas, suporte e aquisição do parceiro. Esses custos, taxas e conversões ainda não foram medidos para sustentar preço ou SLA comercial.

## 8. Quais dependências externas impedem o funcionamento totalmente automático?

Hoje impedem a promessa universal: autorização/contrato do ATS; adesão e credenciais de cada empresa; disponibilidade de vagas adequadas; mecanismos de autenticação e verificação humana; dados e consentimentos específicos; meios oficiais de confirmação/reconciliação; limites, alterações e disponibilidade dos destinos. Não existe correção local que conceda permissão empresarial ou crie vagas compatíveis.

Produção consultada às **14h48m46s Brasília**: deployment **`dpl_3iMxZ3n2pYU1SRVRYTnu1vM47w3D`**, `READY`, health HTTP **200**, revisão **`2521c5f400cdb18f6a5a9947a35804367ae685d80defe7bfda9d7df4d7043044`**. Nenhum deployment foi feito nesta etapa. Filtros preservados, assinatura **`22807533ea2c589be194da590b5752ea5c029335fea356ac84c2ccd70ea1bde4`**. Política de destino continua `official`, sem liberar Gupy ou relaxar os bloqueios.

Cron Vercel permanece habilitado, `disabledAt: null`, `/api/daily-routine`, `0 11 * * *`. Rotina no banco: habilitada, modo automático, 08h, limite cinco; próxima execução **24/10/2026 às 08h Brasília**, com janela observada anteriormente prevista até 09h. Não foi antecipada ou acionada nesta investigação. O observador local existente das 09h15 continua ativo. **Configuração e health não comprovam execução futura; a validação independente do cron segue pendente dessa janela.** [Evidência de produção](artifacts/automation-viability-production-2026-10-23.json).

### Entrega e decisão

- Gupy por sessão do candidato: **não habilitar comercialmente neste estado**; falta autorização estabelecida e demonstração autenticada completa.
- Integração oficial empresarial: **tecnicamente documentada e candidata a piloto**, dependente de parceiro, credenciais, ambiente de homologação e contrato. Não está entregue como funcional.
- Produto disponível para evolução: descoberta, análise e preparação, com execução restrita a canais suportados e comprovados e encaminhamento assistido dos demais. Ainda falta comprovar nova submissão real e economia do serviço.
- Resultado comercial comprovado nesta etapa: **0 candidaturas, 0 recibos, 0/5 no dia**. A Global TI permanece bloqueada com resultado desconhecido.

### Artefatos e reprodução

1. `npx tsx scripts/probe-gupy-managed-access.ts` — somente login anônimo; rede de escrita bloqueada; [resultado](artifacts/gupy-managed-access-2026-10-23.json).
2. `npx tsx scripts/observe-automation-viability.ts` — leitura autorizada de estado, filtros, sessão e coortes; [resultado](artifacts/automation-viability-state-2026-10-23.json). Exige credencial existente válida do operador Firebase CLI; não inicia rotina.
3. `node scripts/observe-viability-deployment.mjs` — somente GETs Vercel/health; [resultado](artifacts/automation-viability-production-2026-10-23.json).
4. `npx tsc --noEmit` — aprovado. Captura da tela pública inspecionada visualmente. Os resultados desta lista não são candidaturas nem recibos.

Todas as fontes externas acima foram consultadas em **23/10/2026**. Foram usados os termos atuais de julho/2026, em vez de tratar PDFs antigos como contrato vigente. As conclusões distinguem documentação oficial, observação real, código existente e dependências ainda não verificadas.

## Validação final — Candidatura Rápida e formulários existentes

Etapa solicitada no arquivo “ÚLTIMA ETAPA DE VALIDAÇÃO TÉCNICA ANTES DA DECISÃO DE PRODUTO”. Estado final do banco consultado em **23/10/2026 às 15h39m02s Brasília**. Esta continuação preserva as evidências anteriores e não substitui o insucesso por testes controlados.

### 1. Candidaturas Rápidas sem login: resultado da investigação

Foi investigado o **formulário público da publicação**, separadamente da API administrativa `quick-apply`. A busca delimitada utilizou C#, .NET, Angular, Full Stack, remoto e Ilhéus, incluindo consultas por publicação recente. Não foram criadas fontes nem feitas chamadas a métodos privados ou empresariais.

A modalidade sem conta existe na documentação. O [tutorial oficial para empresas](https://suporte.gupy.io/s/suporte/article/Candidatura-Rapida-Tutorial-para-Empresas?language=pt_BR) descreve inscrição simplificada pelo formulário e configuração de perguntas adicionais; os [termos atuais](https://www.gupy.io/termos-de-uso-recrutamento-e-selecao-candidatos) distinguem esse acesso sem login da conta padrão. Isso não transforma a API empresarial em API pessoal. O conteúdo do tutorial foi recuperado pelo índice; a abertura direta do suporte apresentou erro de CSS, limite que não foi ocultado.

**Três publicações distintas apareceram no índice com “Candidatura rápida”. As três foram relidas na origem em navegador anônimo e estavam encerradas e fora dos 14 dias.** A presença do formulário no índice antigo não corresponde ao estado atual da publicação.

| Publicação examinada | Data exibida na página real | Estado atual observado | Resultado |
|---|---|---|---|
| [wBrain — Back-End Developer (.NET) - Remoto, `10393211`](https://vagaswbrain.gupy.io/jobs/10393211) | 25/11/2025 | Inscrições encerradas; sem formulário rápido ativo | Excluída antes de qualquer preparo |
| [Instituto Eldorado — Analista de Conectividade, `11386903`](https://institutoeldorado.gupy.io/jobs/11386903) | 02/06/2026 | Inscrições encerradas; sem formulário rápido ativo | Excluída por data/estado; especialização Android/conectividade também não confirma aderência ao perfil |
| [Panvel — Software Sênior / React Native, `10545455`](https://corporativopanvel.gupy.io/jobs/10545455) | 17/12/2025 | Inscrições encerradas; sem formulário rápido ativo | Excluída; índice ainda descrevia trabalho híbrido no RS, cooperado e tecnologia não confirmada |

**Contagem: três indícios indexados; zero formulários rápidos ativos confirmados nesse conjunto; zero oportunidades rápidas abertas, recentes e compatíveis comprovadas.** Não é uma estimativa de inexistência de Candidatura Rápida no mercado inteiro.

Os índices históricos exibiam nome, documento/CPF, e-mail, celular, LinkedIn opcional, perguntas da empresa e aceite de termos/privacidade. Esses campos **não foram validados como contrato de um formulário atualmente aberto**. Nenhum CPF ou currículo foi inserido. A resposta de CPF aprovada para a Global TI não foi reaproveitada em outro destino.

Sem uma publicação ativa elegível, não foi possível observar um contrato atual de upload e confirmação da modalidade pública. Um adaptador específico permanece uma possibilidade técnica condicionada a: destino ativo autorizado, requisitos completos, ausência de barreira não suportada e confirmação nova vinculada à vaga. **Não há adaptador Gupy público entregue nesta etapa.** Não se utilizou página encerrada ou cadastro fictício para fabricar a demonstração.

Permissão de uso do serviço continua sendo uma condição própria: não foi encontrada autorização expressa que libere o Empregatos para candidatar terceiros pela modalidade pública. Não ter login resolve uma barreira de autenticação, mas não estabelece essa autorização. Qualquer piloto precisa esclarecer o uso com Gupy/empresa, sem tratar ausência de bloqueio técnico como permissão contratual.

### 2. As três vagas Gupy compatíveis continuam exigindo login

As três passaram novamente pelo classificador e foram abertas sem sessão. Foram seguidos apenas links de candidatura publicados nas próprias páginas, sem preencher campos ou acionar submissão.

| Vaga | Publicada / inscrições até | Pontuação | Evidência atual |
|---|---|---:|---|
| Pixeon `06c71f53-5d17-4975-84b4-9fcc7c0ebfa4` | 22/10/2026 / 16/11/2026 | 92 | Aberta; link termina em `vemprapixeon.gupy.io/candidates/signin` |
| Víssimo `bb0770a9-fdaf-48ad-877e-aede1553b921` | 14/10/2026 / 31/10/2026 | 70 | Aberta; link termina em `vissimo.gupy.io/candidates/signin` |
| Bancorbrás `0db3bdc1-db2e-49c6-95b3-8f46bfb6e09a` | 14/10/2026 / 30/11/2026 | 78 | Aberta; link termina em `bancorbras.gupy.io/candidates/signin` |

**Nenhuma mostrou formulário de Candidatura Rápida.** Publicação aberta, pontuação suficiente e existência do botão não removem a exigência de autenticação ou autorizam o executor. [Leitura real das seis publicações Gupy e quatro anúncios Lever](artifacts/final-public-channel-inspections-2026-10-23.json).

### 3. Reavaliação dos 33 formulários observados

O mesmo grupo contém **32 formulários Lever / CI&T e um Quickin / Global TI**. Não são 33 oportunidades já aprovadas para envio. Foram aplicados os filtros objetivos e recalculada a compatibilidade com o perfil confirmado, antes de qualquer inspeção de preparação. A janela móvel nesta leitura contém 145 publicações recentes, em vez de 146 na leitura anterior; o grupo de 33 permanece. Nenhuma publicação foi apagada e nenhum filtro foi alterado.

Resultado do recálculo: **33 passam pelo filtro objetivo implementado; zero satisfazem a compatibilidade profissional completa; zero liberadas para novo preflight ou envio.** O perfil continua com um ano de experiência, nível não especificado e mínimo 70.

| Exclusão principal, em grupos exclusivos | Quantidade |
|---|---:|
| Global TI com transmissão anterior desconhecida, bloqueio prioritário | 1 |
| Exigência de senioridade não confirmada, além da Global TI | 24 |
| Vagas afirmativas PcD sem confirmação específica | 3 |
| Pontuação insuficiente / outras competências não confirmadas | 5 |
| **Total** | **33** |

A Global TI também recebeu 49 no recálculo e possui bloqueio de senioridade, mas foi contada uma única vez no grupo de incerteza. O classificador atualizado não reescreveu a qualificação ou o histórico da tentativa antiga. [Recálculo de todos os 33, somente leitura](artifacts/public-form-reassessment-2026-10-23.json).

Quatro anúncios foram selecionados pela proximidade tecnológica ou maior pontuação para confirmar a situação pública e os requisitos. Seus links `/apply`, publicados na origem, responderam HTTP 200 e renderizaram formulário sem login. **Isso confirmou acesso público, não elegibilidade.**

| Vaga / ID interno | Pontuação | Evidência e impedimento |
|---|---:|---|
| CI&T Mid Data Developer Azure + Databricks — `fccff2b3-0b7a-40ef-a5fc-ca8e64606c14` | 60 | Publicada em 21/10; formulário público. Abaixo de 70; Databricks/Spark não confirmados |
| CI&T Senior Angular — `951291ed-95ea-4c49-adcc-7550ae30d7d9` | 49 | Publicada em 20/10; formulário público. Senioridade exigida não confirmada |
| CI&T .NET Developer Senior — `77d512b1-3ecb-4be4-b54c-70df9e46fc9f` | 49 | Publicada em 22/10; formulário público. Senioridade exigida não confirmada |
| CI&T Mid Angular, afirmativa PcD — `7e98745c-6905-4b61-98f5-4d64869b9088` | 49 | Publicada em 20/10; formulário público. Declaração de elegibilidade específica ausente; não inferida |

Os quatro usam a plataforma de um executor já implementado. A leitura encontrou controles de nome, e-mail, telefone, localização, empresa atual e LinkedIn, currículo, perguntas adicionais e consentimento de armazenamento obrigatório; marketing aparece separadamente e opcional. Há também um controle de laudo médico ligado à condição declarada na pergunta correspondente, **não um segundo currículo obrigatório para todos**. Não foi presumido arquivo ou condição de saúde do usuário.

Já existem fatos confirmados aproveitáveis: nome, contato, localização, experiência, pretensão salarial e currículo original aprovado; preferências confirmadas também fornecem empresa atual e LinkedIn para seus rótulos correspondentes. Isso não supre respostas pessoais específicas, compatibilidade de opções, seleção de localização ou consentimentos por destino. A aprovação exata do consentimento obrigatório de armazenamento não foi encontrada para esses quatro URLs. Não foi solicitado aceite de vagas incompatíveis apenas para alimentar uma tentativa.

A inspeção registrou 40, 43, 44 e 42 controles visíveis, respectivamente, incluindo opções e campos opcionais. **Não são contagens de perguntas obrigatórias nem de dados faltantes.** O mapeamento de disponibilidade usa rótulos observados; rótulos agrupados e widgets exigiriam o preflight do executor. Ele não foi executado nessas vagas inelegíveis. Nenhum campo foi preenchido e nenhum arquivo foi carregado. [Inspeção dos quatro formulários](artifacts/final-lever-form-inspections-2026-10-23.json), [disponibilidade de fatos e limites do diagnóstico](artifacts/final-public-validation-2026-10-23.json).

Não foi demonstrada uma barreira técnica irreversível nesses quatro formulários. As exclusões que já impedem envio são profissionais e de autorização/respostas; eventual desafio humano precisa ser observado no fluxo permitido, não presumido ausente porque o formulário abriu. O projeto continua obrigado a parar diante de CAPTCHA ou controle não suportado. Não se confunde uma lacuna de cadastro solucionável com falta de qualificação ou de permissão do destino.

### 4. Prova real de envio: nenhuma oportunidade liberada

Nenhuma oportunidade nova satisfez conjuntamente abertura, prazo, perfil, autorização, respostas e executor verificável. **Não foi disparada outra busca normal ou tentativa só para produzir atividade**, pois o conjunto reavaliado não oferece candidato liberado para transmissão. Não houve candidatura manual pelo agente.

Novas candidaturas preparadas: **0**. Novas execuções de envio: **0**. Novas tentativas: **0**. Respostas de submissão: **nenhuma, pois nenhum envio foi iniciado**. Recibos válidos novos: **0**. Não há IDs novos de execução/tentativa para apresentar como prova de candidatura.

A consulta final do banco comprovou a tentativa Global TI inalterada: `a8f0e151-72bb-43d2-b9b6-99bd7ce0a808`, origem `user_triggered_automation`, executor `ats_browser`, execução `a1198849-24d0-46d6-9158-e3021c4bc43a`, `outcome: unknown`, sem recibo ou `submittedAt`. A consulta Gmail retornou somente os dois e-mails de acesso conhecidos, sem resposta de suporte. **Permanece bloqueada contra duplicação.** [Estado final](artifacts/final-public-validation-2026-10-23.json), [consulta de reconciliação](artifacts/final-public-validation-reconciliation-2026-10-23.json).

### 5. Integração empresarial: especificação entregue

Foi criada [ESPECIFICACAO-PILOTO-ATS.md](docs/ESPECIFICACAO-PILOTO-ATS.md). Ela define autorização da empresa e do candidato; concessões reais; feed de vagas; submissão de currículo aprovado; contrato de confirmação e reconciliação; proteção e revogação de dados/credenciais; identidade estável e reserva atômica contra duplicidade; limites de idempotência; homologação e entrada na rotina agendada.

O documento diferencia Gupy empresarial, Greenhouse Ingestion/Job Board, Lever Postings, Ashby e SmartRecruiters. Em particular, o [Greenhouse Candidate Ingestion](https://docs.greenhouse.io/candidate-ingestion.html) oferece caminho oficial para parceiros com clientes em comum, criação e leitura de candidaturas, com autorização empresarial própria. Isso é diferente de OAuth da conta pessoal do candidato.

**Piloto não iniciado:** não há empresa participante, token novo, grants concedidos ou homologação. Nenhuma chave foi inventada, nenhum formulário de parceria foi enviado e nenhum conector foi habilitado por essa especificação. A próxima dependência para validar escala por esse caminho é comercial/operacional: obter empresa e autorização do ATS, antes de investir em implementação específica.

### 6. Classificação final dos canais

As categorias abaixo dizem respeito à candidatura recebida pelo destino, não ao funcionamento isolado de descoberta, fila ou navegador.

| Canal | Classificação atual | Fundamentação |
|---|---|---|
| Nova candidatura autônoma com recebimento comprovado em 23/10 | **Nenhum canal na categoria “Automação real demonstrada” nesta validação** | Zero novos recibos vinculados à rotina |
| Quickin, nos quadros autorizados | **Automação tecnicamente implementada, mas ainda não comprovada em candidatura real confirmada** | Houve execução real Global TI, com retorno desconhecido; bloqueio preservado |
| Formulários públicos suportados Lever, Greenhouse, Ashby e SmartRecruiters | **Automação tecnicamente implementada, mas ainda não comprovada em candidatura real confirmada nesta validação** | Adaptadores existentes; os 32 formulários Lever desse grupo falham na compatibilidade; quatro tiveram acesso público reconfirmado |
| Formulário corporativo nativo WP Jobs e e-mail publicado | **Automação tecnicamente implementada, mas sem nova confirmação real nesta validação** | Nenhuma nova vaga elegível liberada; ID do provedor de e-mail isolado não prova recebimento pelo empregador |
| Gupy — formulário público de Candidatura Rápida | **Não suportado atualmente pelo executor** | Zero vagas rápidas abertas compatíveis comprovadas; autorização e confirmação não homologadas; zero adaptadores novos |
| Gupy — candidatura padrão autenticada | **Operação assistida**, pelo próprio candidato no destino | Três vagas abertas compatíveis; login obrigatório; sem sessão delegada autorizada e validada |
| APIs empresariais dos ATS / captação oficial | **Integração dependente de parceria** | Contratos e arquitetura especificados; faltam empresa, credencial e homologação |
| Destino com CAPTCHA ou barreira não suportada | **Operação assistida ou não suportado**, conforme o caso | Não contornar verificações nem afirmar que automação integral está disponível |

### 7. Cobertura e recomendação de produto

Para este usuário, no conjunto efetivamente verificado: **três vagas compatíveis em canal autenticado sem executor liberado; zero rápidos ativos compatíveis; zero dos 33 formulários liberados; zero candidaturas automáticas recebidas comprovadas.** As quantidades não devem ser somadas como vagas diferentes: os conjuntos e releituras têm sobreposição. Isso não é cobertura de todo o mercado nem taxa de chegada diária.

Não há oferta demonstrada para cinco envios diários. Uma apresentação comercial transparente, **proposta e não publicada**, seria: “O Empregatos busca e prepara oportunidades compatíveis. Nos canais suportados e autorizados, pode realizar até cinco candidaturas por dia, conforme disponibilidade de vagas e respostas necessárias. Preparação e tentativa sem confirmação não contam como candidatura recebida. Nos demais destinos, você conclui a candidatura diretamente.”

O modelo executável é descoberta/preparação/acompanhamento para o candidato, automação limitada por canal e expansão de submissão verificável por empresas parceiras. Vender escala autônoma exige feed autorizado recorrente, taxa de elegibilidade por segmento, confirmação consultável, reconciliação e custo medido. **A amostra atual não valida essa oferta comercial; a parceria é dependência real, não uma falta que mais código local resolva.**

### 8. Produção, entrega e contagem obrigatória

Produção consultada em **15h36m52s Brasília**: mesmo deployment `dpl_3iMxZ3n2pYU1SRVRYTnu1vM47w3D`, `READY`, health 200 e mesma revisão `2521c5f400cdb18f6a5a9947a35804367ae685d80defe7bfda9d7df4d7043044`. Cron continua habilitado para `/api/daily-routine`, próxima janela **24/10 às 08h Brasília**; não foi antecipado. O observador existente continua separado da execução de produção. [Evidência](artifacts/final-public-validation-production-2026-10-23.json).

**Mudança efetiva em produção: nenhuma.** Não houve deploy, alteração de filtro, ativação de fonte, novo grant, liberação de executor, reset de status ou consumo novo de reserva. Foram acrescentados scripts de leitura, artefatos e especificação no projeto; isso não altera o produto publicado. A assinatura dos filtros continua `22807533ea2c589be194da590b5752ea5c029335fea356ac84c2ccd70ea1bde4`.

| Entrega obrigatória | Resultado desta etapa |
|---|---|
| 1. Candidaturas Rápidas encontradas | 3 indícios indexados antigos; **0 formulários rápidos ativos** no conjunto inspecionado |
| 2. Quantidade compatível | **0 rápidas abertas/recentes compatíveis**; 3 vagas padrão Gupy compatíveis com login |
| 3. Formulários realmente submetíveis para o perfil | **0 de 33**, após compatibilidade e bloqueio contra duplicidade |
| 4. Novos adaptadores | **0**, sem destino elegível autorizado que justificasse implementação |
| 5. Envios reais novos pelo Empregatos | **0** |
| 6. Recibos válidos novos | **0** |
| 7. Limitações de autenticação/autorização | Login nas 3 Gupy; delegação e uso do formulário rápido pelo serviço não homologados; consentimentos por destino |
| 8. Integração empresarial | Especificação concluída; **parceria e homologação pendentes** |
| 9. Modelo recomendado | Preparação/acompanhamento e automação restrita; escala condicionada a parceiros e cobertura medida |
| 10. Mudança em produção | **Nenhuma**; configuração e proteções preservadas |
| Meta diária efetivamente cumprida | **0/5 confirmadas**; uma reserva incerta e saldo quatro |

Verificação: `npx tsc --noEmit` aprovado para os scripts; leituras reais das páginas e do banco registradas nos artefatos. Não foi criada bateria nova de testes unitários ou receptor simulado. As inspeções bloquearam requisições de escrita e não carregaram dados do candidato nas páginas do destino. O arquivo `final-public-validation-2026-10-23.json` registra zero novas tentativas desde o recálculo e comparação idêntica da tentativa Global TI.
