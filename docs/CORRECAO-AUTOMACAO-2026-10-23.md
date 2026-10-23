# Automação — correções e evidências de 23/10/2026

**AUTOMAÇÃO AINDA NÃO VALIDADA para cinco candidaturas reais diárias.** As correções foram publicadas. Os dois executores testados concluíram cinco envios cada para receptores controlados; nenhum desses recibos representa candidatura a empregador.

## Problemas identificados e correções

| Problema e evidência | Correção | Arquivos principais |
| --- | --- | --- |
| Cron real às 08h09 respondeu 503. Ambas as consultas de recuperação falharam no banco real com código 9, exigindo índice. | Criados os índices `status ASC, leaseUntil ASC` em `discovery_tasks` e `resolution_tasks`, sem apagar documentos ou índices existentes. Ambos READY; as mesmas consultas passaram. Log do cron agora identifica etapa, tipo e código do erro. | `firestore.indexes.json`, `server/vercel-cron.ts`, `scripts/ensure-automation-indexes.ts` |
| Reentrega após salvar resultado podia terminar sem publicar a continuação. A descoberta também permanecia marcada como running ao solicitar a próxima janela. | Retomar pelo estado persistido sem repetir a transmissão; concluir a tarefa antes de iniciar a próxima descoberta e verificar a posse da tarefa. | `server/vercel-submission-worker.ts`, `server/discovery-queue.ts`, `server/operations.ts` |
| Cortes fixos de descoberta repetiam o começo do catálogo. | Cursores persistidos para Abler e páginas de empresas, paginação e orçamentos configuráveis. A pesquisa automática tem orçamento diário persistido; trabalho restante é preservado. | `server/abler-discovery.ts`, `server/company-board.ts`, `server/automatic-cycle.ts`, `server/resolution-queue.ts`, `.env.example` |
| Uma autorização de formulário nativo podia ser confundida com disponibilidade de navegador para outro ATS. Gmail configurado também não garantia conexão da conta. | Conferência de executor por destino; fallback considera conexão Gmail. Ativação oficial aceita Gmail conectado mesmo sem navegador. Motivos de impedimento mais específicos. | `server/ats-registry.ts`, `server/submission-routing.ts`, `server/submission-eligibility.ts`, `server/app.ts` |
| Origem e vínculo entre descoberta, tentativa e recibo não eram estruturados. | `correlationId`, execução de origem, tentativa, executor, resultado e recibo persistidos; logs sem currículo, respostas, contatos ou tokens. Registros antigos ficam sem proveniência presumida. | `shared/types.ts`, `server/automation-trace.ts`, `server/operations.ts` |
| O contador automático podia incluir recibos individuais ou antigos sem comprovação de origem. | A meta automática exige tentativa confirmada vinculada à execução do produto. Histórico geral continua mostrando recibos confirmados. | `server/automatic-cycle.ts`, `src/SimpleAutomation.tsx`, `shared/confirmed-applications.ts` |
| WP Jobs Board recusava qualquer pergunta adicional. Respostas sem duração específica podiam virar zero anos. | Mapeamento de perguntas rotuladas, opções e respostas aprovadas no formulário nativo. Duração por tecnologia exige evidência explícita; tecnologia conhecida sem duração fica pendente. Contrato de resposta registra confiança e possibilidade de preenchimento. | `server/company-form.ts`, `server/company-board.ts`, `server/automatic-answers.ts`, `server/answer-evidence.ts`, `server/question-drafts.ts` |
| Erros Gmail anteriores ao POST eram genéricos; limpeza do Sandbox podia descartar resultado conhecido. | Identificar etapa da recusa; liberar reserva quando comprovadamente nenhuma transmissão começou, preservando impedimento de repetição. Falha ao encerrar Sandbox não substitui recibo recuperado. | `server/email-application.ts`, `server/submission-attempts.ts`, `server/ats-execution.ts` |
| Enriquecimento do título penalizava profissões gerais e invalidava assinatura de análise complementar. | Especialização técnica do título separada de competências da descrição; assinatura usa a mesma evidência normalizada da análise. Não foram reduzidos filtros nem pontuação mínima. | `server/engine.ts` |

## Validação

- `npm run build` e TypeScript aprovados.
- Suíte final: **607 testes passaram, 11 ignorados**, em 76 arquivos aprovados e um ignorado.
- Chromium: teste do histórico passou; preparação fica invisível e o registro aparece após receber recibo e data.
- Dois fluxos completos em Vercel Sandbox Linux, com banco temporário, perfil/PDF fictícios, descoberta, preparação, execução e persistência do próprio backend:

| Executor | Receptores distintos confirmados | Arquivo/candidato conferidos | Duplicação rejeitada | Destino bloqueado recebeu POST? |
| --- | ---: | --- | --- | --- |
| Playwright | 5 | Sim | Sim | Não |
| WP Jobs Board nativo | 5 | Sim | Sim | Não |

Origem dos testes controlados: `user_triggered_automation`, com execução e tentativas vinculadas. **O transporte Vercel Queues não foi utilizado nesses dois testes**; foram processadas as filas persistidas pelos consumidores do projeto. A execução real de hoje forneceu evidência separada de cron, descoberta e resolução em nuvem.

Recibos e vínculos completos: [Playwright](../artifacts/controlled-cloud-ats_browser-pipeline-2026-10-23.json), [WP Jobs Board](../artifacts/controlled-cloud-company_wp_jobs-pipeline-2026-10-23.json). Scripts: `scripts/controlled-destination-pipeline.ts` e `scripts/verify-controlled-cloud.ts`.

## Resultado real da conta

Preferências lidas do banco: meta 5, mínimo 70, publicação conhecida nos últimos 14 dias, remoto ou presencial em Ilhéus, CLT/PJ e destinos oficiais. Foram preservadas.

| Medida | Resultado observado |
| --- | ---: |
| Vagas armazenadas | 432 |
| Novas vagas na busca agendada de hoje | 9 |
| Compatíveis no conjunto atual | 14 |
| Novo canal por e-mail compatível e sem candidatura anterior | 0 |
| Bloqueios ativos por verificação humana | 5, sendo 1 novo hoje |
| Transmissões iniciadas hoje | 0 |
| Novas confirmações reais hoje | **0** |
| Cota consumida hoje | 0 |
| Meta diária real | **0/5** |

As 14 compatíveis incluem uma candidatura já enviada, cinco bloqueadas e oito sem executor independente liberado. A sondagem pública atual de Abler e AllEasy encontrou 15 anúncios válidos; os dois que passaram pelos filtros já haviam recebido candidatura. Não foram repetidos AllEasy nem Solucionare. O recibo Gmail histórico `1a1644f34c558e49` comprova aceitação pelo Gmail em 22/10, sem comprovar entrega ou leitura.

O cron real iniciou a busca `8acfd302-430f-4532-9e3a-1dc8363ebc73` e a resolução continuou até terminar, apesar do erro na etapa de recuperação do cron. Uma fonte de páginas oficiais retornou referências sem confirmação legível; a busca ficou parcial. Não houve ação do agente nos formulários de empregadores.

Evidências: [falha das consultas](../artifacts/automation-cron-failure-2026-10-23.json), [consultas corrigidas](../artifacts/automation-after-indexes-2026-10-23.json), [sondagem pública](../artifacts/automation-public-probe-2026-10-23.json), [estado da conta](../artifacts/automation-production-final-2026-10-23.json).

## Produção

- Publicado e promovido: **`dpl_HtNmg61GjxZe15xJR8UEwLY4Rtyu`**, READY, em [curriculoautomatico.vercel.app](https://curriculoautomatico.vercel.app).
- `/api/health`: HTTP 200, Firestore acessível; impressão do build remoto `4a748f78f48c1a7b53af3b2bd52f41fd561a96dd3702e453fd568677db6daa88`.
- Comparação independente das fontes enviadas com o workspace: **265 arquivos, zero diferenças**. O hash do build remoto não foi tratado como commit Git nem como o hash local anterior à instalação de dependências.
- Descoberta, destinos, submissão e cron publicados com limite de 300 segundos; API com 60 segundos. Tópicos existentes preservados.
- Cron preservado em `0 11 * * *`. Próxima execução independente: **24/10, entre 08h e 09h de Brasília**, pela precisão horária do plano Hobby. Ainda não observada nesta revisão.
- Inspeção de erros da revisão publicada: nenhum registro retornado na janela consultada; isso não comprova envios nem execução futura.
- Sem limpeza de histórico, relaxamento de preferências ou instalação obrigatória de extensão. Alterações anteriores da pasta de trabalho foram preservadas.

Evidências: [release](../artifacts/automation-production-release-2026-10-23.json), [saúde](../artifacts/automation-production-health-2026-10-23.json), [fontes](../artifacts/automation-deployed-source-comparison-2026-10-23.json), [índices](../artifacts/automation-indexes-2026-10-23.json).

## Limites remanescentes

Faltam um destino novo realmente compatível e submetível para o teste real, cinco oportunidades distintas nessas condições e observação de execuções agendadas independentes após a publicação. Os formulários reais restantes encontrados exigem verificação humana ou não possuem executor autorizado. Não foi feita nova chamada manual autenticada do cron: não há `CRON_SECRET` utilizável nas configurações locais; o segredo permanece configurado na produção.

Reconhecer uma plataforma não libera sua API de submissão: [Greenhouse](https://docs.greenhouse.io/job-board), [Lever](https://github.com/lever/postings-api), [Ashby](https://developers.ashbyhq.com/reference/authentication) e [SmartRecruiters](https://developers.smartrecruiters.com/docs/authentication) distinguem dados públicos de operações autenticadas. Não foram utilizadas credenciais de empregador nem contornadas verificações humanas. A limitação de horário do cron está na [documentação da Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

**Resultado: canais controlados validados, falha concreta de infraestrutura corrigida e revisão publicada; automação real de cinco candidaturas ainda não validada.**
