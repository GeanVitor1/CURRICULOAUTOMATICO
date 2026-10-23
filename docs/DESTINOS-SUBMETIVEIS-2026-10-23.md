# Destinos de candidatura — 23/10/2026

> **Atualização após 13h25 de Brasília — AUTOMAÇÃO AINDA NÃO VALIDADA:** filtros antecipados, busca por tecnologias/experiência confirmadas, produtividade por fonte e bloqueios de qualificação publicados. Duas execuções reais do backend concluíram descoberta e resolução; a última examinou 348 registros, preservou 15 e encontrou três vagas já conhecidas compatíveis, todas sem canal independente submetível. **Zero vagas novas, zero novas preparações, zero transmissões e zero recibos. Meta 0/5.** Global TI desconhecida e sem reenvio; Cadmus incompatível e com obrigatórios pendentes. A [expansão e o resultado final](#expansão-orientada-a-candidaturas-submetíveis--2310-após-13h) detalham as evidências.

> **Encerramento da continuação, 23/10, após 12h30 de Brasília:** Global TI continua **desconhecida, sem reenvio**. Consulta ao suporte enviada com autorização; resposta pendente. Quickin corrigido e publicado, 86 testes focados aprovados. Uma nova busca real consultou 469 registros e adicionou 39 vagas; nenhuma passou por todos os filtros. **Zero novas tentativas, zero novos recibos e meta diária 0/5.** Detalhamento e estado de produção na [continuação segura](#reconciliação-segura-e-continuação-real--2310-após-12h30).

> **Atualização da execução real, 23/10:** a Global TI já teve uma transmissão pelo backend em produção às **10h52 de Brasília**, mas a Quickin devolveu HTTP não aceito e **não há recibo**. A candidatura permanece como **Resultado desconhecido**; não foi repetida nem contada como enviada. A investigação e as evidências estão em [Execução real da Global TI](#execução-real-da-global-ti--continuação-de-2310).

## Resultado verificável até a publicação

- Oito destinos originais investigados individualmente; **zero recuperados para envio independente**. Todos apresentam anúncio aberto e link de candidatura, mas o acesso público à candidatura redireciona para login na Gupy. Nenhum canal alternativo para a mesma vaga foi confirmado nas páginas corporativas examinadas.
- Uma nova oportunidade compatível e com preflight aprovado: **Global TI, Desenvolvedor Full Stack - PL/SR, 85 pontos**, publicação de 19/10. O novo coletor examinou oito anúncios do quadro e retornou somente essa vaga elegível. A candidatura real depende da execução da rotina e de recibo do destino; teste interceptado não conta como envio real.
- Adaptador Quickin implementado; adaptador nativo WP Jobs e escolha entre destinos corrigidos. Filtros, preferências e histórico real preservados.
- Vercel Queues validado com consumidores reais e receptores controlados, incluindo reentrega após falha posterior à persistência, continuação e ausência de transmissões duplicadas.
- Indicadores internos disponíveis em Automação → **Indicadores técnicos da automação** e na API autenticada `/api/automation/conversion`. Histórico público continua limitado a candidaturas com recibo.

## As oito vagas originais

As publicações responderam HTTP 200 e exibiram link oficial de candidatura. A observação foi repetida em navegador sem sessão; os oito formulários terminam em `/candidates/signin`, sem upload público de currículo. As oito constatações foram gravadas como diagnóstico do destino, sem criar candidaturas nem alterar o histórico.

| Empresa | Cargo e publicação oficial | Canal publicado e impedimento |
|---|---|---|
| Pixeon | [Analista Desenvolvedor(a) C#/.NET Pleno](https://vemprapixeon.gupy.io/jobs/12725139) | Gupy; exige autenticação. Não há sessão executável nem executor independente autorizado para esse fluxo. |
| Softplan | [Pessoa Desenvolvedora .NET Sr (Remoto) - 6791](https://softplan.gupy.io/jobs/12726791) | Gupy; exige autenticação. A página corporativa direciona ao mesmo ATS. |
| Víssimo | [Desenvolvedor(a) Full Stack, ênfase em Frontend](https://vissimo.gupy.io/jobs/12722191) | Gupy; exige autenticação. Nenhum formulário alternativo da mesma vaga confirmado. |
| Bancorbrás | [Analista de Desenvolvimento de Sistemas](https://bancorbras.gupy.io/jobs/12723856) | Gupy; exige autenticação. O registro existente usa “Oportunidades” como empresa; o quadro oficial identifica Bancorbrás. |
| Libbs | [Analista de Sistemas Sênior (Ecommerce)](https://vempralibbs.gupy.io/jobs/12741698) | Gupy; exige autenticação. A descrição ainda pede disponibilidade para São Paulo/Grande SP, que precisaria ser confrontada com as preferências antes de eventual envio. |
| DOMO | [Banco de Talentos — Analista de Sistemas Júnior, afirmativa PCD](https://domo.gupy.io/jobs/12747984) | Gupy; exige autenticação. Banco de talentos e condição afirmativa não foram tratados como qualificação confirmada. O formulário corporativo genérico de contato não é canal de candidatura. |
| Lanlink | [Analista de Sistemas de Automação DevOps — Sênior](https://vempralanlink.gupy.io/jobs/12753756) | Gupy; exige autenticação, confirmado em segunda inspeção após carregamento. Requisitos especializados não foram presumidos. |
| Lanlink | [Analista de Sistemas de Automação — Servidores de Aplicação Sênior](https://vempralanlink.gupy.io/jobs/12753649) | Gupy; exige autenticação, confirmado em segunda inspeção. Não foi publicado canal alternativo para a mesma vaga. |

O projeto reconhece essas URLs, inclusive links Gupy com identificador codificado. O roteamento não omitiu um formulário independente funcional: o fluxo autenticado não integra os adaptadores públicos liberados. Implementá-lo exigiria uma sessão do candidato utilizável pelo executor e validação própria desse fluxo. Nenhuma permissão, credencial ou endpoint privado foi inventado, e nenhuma extensão foi tornada obrigatória.

Evidências: `artifacts/eight-official-destinations-2026-10-23.json`, `eight-gupy-access-2026-10-23.json`, `expanded-browser-channels-2026-10-23.json` e `eight-destinations-recorded-2026-10-23.json`.

## Ampliação orientada a submissão

### Quickin / Global TI

[Anúncio oficial](https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0) e seu link público de candidatura foram conferidos. O anúncio declara trabalho remoto no Brasil e data exata de publicação. A fonte obtém o catálogo público utilizado pela própria interface e relê cada anúncio potencialmente elegível, exigindo identidade da empresa, data, URL e link publicado. O coletor aplica os filtros atuais e a pontuação mínima antes de retornar oportunidades.

O adaptador:

1. Confere o esquema de perguntas publicado e a identidade da vaga antes de qualquer preenchimento ou arquivo.
2. Usa dados confirmados do perfil. O CPF fornecido pelo titular foi salvo somente como resposta para a URL exata desta candidatura; o valor não consta dos relatórios.
3. Não gera CPF ou outros documentos pela política automática de informações ausentes. Documentos continuam exigindo informação explícita aprovada.
4. Seleciona Brasil no telefone e confere o número. Perguntas opcionais sobre deficiência e grupos sem resposta aprovada ficam vazias.
5. Não transforma aviso informativo de privacidade em aceite. Uma nova declaração obrigatória sem resposta aprovada pausa o fluxo.
6. Carrega o currículo original aprovado pelo controle normal da página. A execução permite apenas `jobs.quickin.io` e `api.quickin.io`; CAPTCHA ou hosts não suportados interrompem a preparação.
7. Exige resposta HTTP aceita ao POST normal da interface e confirmação visível **“Candidatura enviada!”**. Resultado incerto não é repetido automaticamente.

Configuração de produção: `DISCOVERY_QUICKIN_BOARDS=[{"company":"Global TI","board":"globalti"}]` e autorização exata `ATS_BROWSER_AUTHORIZED=quickin:globalti`. Isso não libera todos os quadros Quickin.

O preflight no Sandbox real passou sem preencher os campos e sem carregar arquivo. Um segundo teste usou a interface real com identidade e PDF fictícios, interceptando **todas** as escritas antes do empregador. Esse teste comprovou o preenchimento e o reconhecimento da confirmação, mas não constitui candidatura real. Evidências separadas: `quickin-cloud-preflight-2026-10-23.json`, `quickin-ui-controlled-2026-10-23.json` e `quickin-scoped-answer-2026-10-23.json`.

### Fontes examinadas que não liberaram novas candidaturas

- Foram examinadas 21 publicações potenciais em sete quadros Quickin. Além da Global TI, o classificador encontrou uma vaga BELTIS com 78 pontos; a descrição permite convocação presencial em São Paulo. Essa pendência não foi ocultada pelo rótulo “remoto”, e o quadro não foi habilitado.
- Mais 16 inspeções em Gestalt, Poli Conecta, Pantheon, Seekerh e Verity não liberaram outra candidatura: publicações fora da janela, pontuação abaixo do mínimo ou incompatibilidade de modalidade/localização. Datas recentes de rastreamento no buscador não foram confundidas com a data original de publicação. Detalhes em `quickin-additional-channel-yield-2026-10-23.json`.
- A busca Abler não encontrou outro e-mail elegível além da candidatura já existente da Solucionare; esse destino não foi repetido.
- Formulários próprios da adn.tech tinham publicações de 2021. Nortweb e PERIGO ZERO não confirmavam a data exigida. TemporadaLivre informava apenas o mês, insuficiente para a janela de 14 dias. WebSisti estava fora da janela e da localização. O anúncio da Ágape já não aceitava candidaturas no LinkedIn e seu canal de e-mail não foi reconfirmado.

Não foram adicionadas fontes apenas para aumentar anúncios armazenados. O relatório `artifacts/submission-channel-yield-2026-10-23.json` distingue compatibilidade, preflight e confirmação real.

## Vercel Queues real

Os testes usaram deployments dedicados do mesmo projeto Vercel, com os tópicos e consumidores configurados em `vercel.json`, contas fictícias separadas e receptor controlado. Esses deployments tinham chave de criptografia exclusiva dos arquivos fictícios e **não foram promovidos ao domínio principal**.

| Etapa | Evidência |
|---|---|
| Publicação | Produtor hospedado em produção publicou pelo SDK; publicação inicial com credencial local de desenvolvimento foi excluída da comprovação. |
| Descoberta | `empregatos-discovery` → `/api/search-worker`; tarefa `de9a0f3c-9624-4280-b7ef-f3ee324e2513` concluída, dois anúncios descobertos no receptor. |
| Resolução | `empregatos-destinations` → `/api/destination-worker`; tarefa `065399fc-2930-4cb2-926f-0f8ac61f9923` concluída e formulário nativo resolvido. |
| Submissão e continuação | `empregatos-submissions` → `/api/submission-worker`; dois recibos confirmados por fase e continuação da fila preservada no banco. |
| Falha após persistência | Mensagem `6A-1M1eB4A5TyuiZUHBpKVuGsluWyjTt2tG`: primeira entrega persistiu recibo e falhou por injeção controlada; segunda entrega retomou a continuação sem repetir o POST. |
| Falha sem recibo | Receptor aceitou os bytes e devolveu HTTP 503; resultado ficou desconhecido e não foi promovido a envio confirmado nem repetido. |
| CAPTCHA | Destino controlado com CAPTCHA permaneceu sem POST de currículo. |
| Idempotência | Contadores do receptor permaneceram em um POST por caso, inclusive após replay e reentrega. Hashes dos PDFs fictícios foram conferidos. |
| Isolamento | As duas contas fictícias e seus dados exclusivos foram removidos; a verificação final confirmou ambas ausentes. Nenhuma conta ou cota real foi modificada pelo teste. |

Artefatos: `vercel-queues-integration-2026-10-23.json`, `vercel-queues-full-cycle-2026-10-23.json`, `vercel-queues-cloud-events-2026-10-23.json`, `vercel-queues-phase1-receiver-final-2026-10-23.json` e `vercel-queues-isolation-cleanup-2026-10-23.json`. Os registros persistidos e contadores são a prova; testes locais e publicação de deployment não foram usados isoladamente como critério de sucesso.

## Alterações e validação

- `server/quickin-board.ts`: descoberta oficial com data e retorno limitado a compatíveis.
- `server/quickin-form.ts`, `ats-application.ts`, `ats-network.ts`, `ats-execution.ts`: adaptador da interface pública, preflight e isolamento de rede.
- `approved-answers.ts`, `automatic-answers.ts`, `candidate-answers.ts`: documentos explícitos com escopo exato e reconhecimento da pergunta salarial publicada.
- `submission-routing.ts`: continua procurando um destino executável quando o primeiro destino verificado não pode executar.
- `destination-page.ts`: preserva evidência do formulário nativo WP Jobs durante a resolução.
- `company-form.ts`: identifica CAPTCHA como verificação humana.
- `automation-conversion.ts`, `app.ts`, `SimpleAutomation.tsx`: indicadores autenticados por etapa, categoria e plataforma; tabela responsiva.
- Consumidores das três filas: registros de tópico, consumidor, mensagem e contagem de entrega. Injeção de falha e produtor de integração exigem configuração exclusiva de teste e conta fictícia; ficam desativados na produção normal.

Validação focada: **36 testes passaram em seis arquivos**, TypeScript sem erros, build concluído; teste de navegador confirmou histórico somente com recibo. Indicadores inspecionados em 1440 e 375 px, sem transbordamento horizontal após ajuste. O resultado real e a revisão ativa devem ser lidos no relatório final de produção, separadamente desses testes.

## Candidatura real e pendências

A busca iniciada pelo titular em 23/10 às 10h27 (Brasília), execução `a1198849-24d0-46d6-9158-e3021c4bc43a`, foi recebida pelo consumidor real `empregatos-discovery` e concluiu com cinco novas oportunidades. A Global TI foi descoberta com 85 pontos, sem bloqueios objetivos, mas inicialmente não foi preparada: o novo coletor não havia preenchido sua origem, e a regra de fontes aceitas não reconhecia Quickin após a entrevista de portais. O preflight isolado do adaptador não cobria essa regra da rotina.

Essa falha foi corrigida registrando a origem Quickin e reconhecendo o vínculo exato entre publicação e formulário oficial verificado, inclusive para o registro já descoberto. A autorização exata do quadro continua obrigatória no roteamento. Foi acrescentado teste de regressão com entrevista concluída e portais selecionados, sem alterar essa seleção; **37 testes passaram** no conjunto focado da correção. O diagnóstico somente de leitura no registro real confirmou filtros objetivos, cargos do currículo, original aprovado, entrevista, pontuação e rota `ats_browser`, sem exclusão nem candidatura anterior. Evidências: `globalti-routine-observation-2026-10-23.json` e `globalti-routing-recovery-2026-10-23.json`.

A publicação com a correção da regra de fontes está ativa no domínio principal, revisão `576f1d8035f6aa8fea30bd1636cc78789cecc16862630623e575035721cc0e7c`, deployment `dpl_5Gj1Tx3RL6zHMy82abDf2DLEn84K`, com Firestore respondendo. O navegador do agente ficou desativado nas configurações do Work. Depois da descoberta já concluída, foi solicitado ao titular acionar **Processar vagas encontradas** no próprio Empregatos; esse botão usa a fila normal sem repetir a descoberta nem enviar currículo por ferramentas do agente.

Até o último levantamento anterior a essa execução: 432 vagas preservadas, 14 compatíveis, oito exigindo autenticação, cinco com verificação humana e uma candidatura já confirmada no dia anterior. **Zero novos envios reais confirmados naquele levantamento.** O CPF aprovado e o preflight eliminam a pendência de dados da Global TI, mas só um recibo real da rotina altera esse total.

## Execução real da Global TI — continuação de 23/10

**Resultado: houve uma tentativa real pelo Empregatos, mas não houve recibo válido. A candidatura não está confirmada e não foi repetida.** Nesta continuação foram feitas consultas de diagnóstico, correção e publicação; **nenhuma nova transmissão ao empregador**. A transmissão investigada já constava do banco quando este trabalho começou.

### Estado real e prevenção de duplicidade

| Registro | Evidência persistida |
|---|---|
| Vaga descoberta pelo produto | `9a7b92d7-12b2-4fc5-942d-0cf3e4e6a071`, Global TI, Desenvolvedor Full Stack - PL/SR |
| Execução de descoberta | `a1198849-24d0-46d6-9158-e3021c4bc43a` |
| Correlação | `be02a2b0-92d8-4bcb-ab1f-71b822e00da6` |
| Candidatura | `69692d0e-e9ba-448b-bb78-0140f31dc5f5` |
| Tentativa única | `a8f0e151-72bb-43d2-b9b6-99bd7ce0a808` |
| Executor e origem | `ats_browser`, `user_triggered_automation` |
| Início da tentativa | **23/10/2026, 10:52:21.765 Brasília** (`13:52:21.765Z`) |
| Fim persistido | **10:52:39.795 Brasília** (`13:52:39.795Z`) |
| Resultado | **Resultado desconhecido**, tentativa `outcome: unknown` |
| Recibo e data de envio | `receipt: null`, `submittedAt` ausente |
| Envios automáticos confirmados hoje | **0/5**; uma tentativa incerta ocupa uma reserva, saldo quatro |

A consulta confrontou também oportunidades equivalentes pela identidade da vaga. Encontrou uma candidatura e uma tentativa. O bloqueio de resultado desconhecido permanece ativo; não foram criadas sessões de candidato, alterado o status para liberar repetição, liberada a reserva nem acionado novamente `/api/routine/process`.

### Trajeto efetivamente executado

Os logs reais, a fonte recuperada do deployment executado e o banco fornecem a seguinte sequência, com horários de Brasília:

| Horário | Componente e fato observado |
|---|---|
| 10:27–10:32 | A descoberta do próprio Empregatos encontrou a Global TI e registrou publicação, compatibilidade e execução. Evidência anterior de `empregatos-discovery` preservada. |
| 10:51:41 | O produto recebeu `POST /api/routine/process`; o processamento foi solicitado pelo titular na interface, antes desta continuação. |
| 10:51:53 | Backend preparou a candidatura e registrou `automatic_queued`. Preparação não foi tratada como envio. |
| 10:52:05 | `empregatos-submissions` entregou a mensagem `5u-1M1eB47K5ELudoSePFftcTHmfJ2ADgzy`, entrega 1, ao consumidor `api_Ssubmission-worker_Dmjs`. |
| 10:52:21 | Worker registrou `executor_started` e a tentativa acima. |
| 10:52:24–10:52:37 | Sandbox `sbx_EJZoDnCtUje6fAnr07t6nZjFB20I` executou o runner do Empregatos e foi encerrado. |
| 10:52:39 | O backend persistiu `result_unknown`, sem recibo. |

Deployment dessa tentativa: `dpl_5Gj1Tx3RL6zHMy82abDf2DLEn84K`, revisão `576f1d8035f6aa8fea30bd1636cc78789cecc16862630623e575035721cc0e7c`. Requisição do worker: `bx42d-1792763521405-3f8fe9e7b9ca`.

O envio foi executado pelo runner e pelo adaptador Quickin do Empregatos. Não houve envio manual de currículo por ferramentas de navegador do agente nesta continuação.

### Vaga, perfil, respostas e consentimentos atuais

A releitura utilizou os próprios componentes `readPublicPage`, `jobFromQuickinPage`, `analyze`, `matchesObjectiveFilters`, `matchesSelectedSites`, `applicationAnswerProfile` e `quickinFieldPlan`, sem armazenar outra vaga ou transmitir campos e arquivos.

- Publicação oficial respondeu HTTP 200, continua `active`, com candidatura publicada; data original **19/10/2026**.
- Pontuação **85**, mínimo **70**, filtros objetivos aprovados, origem aceita e nenhum bloqueio de requisito obrigatório.
- Perfil confirmado, rotina automática ativa, entrevista concluída, currículo aprovado coincidente com a entrevista e original disponível.
- Esquema público respondeu HTTP 200. Os sete campos obrigatórios têm resposta ou arquivo disponível: currículo, nome, e-mail, telefone, duas perguntas salariais e CPF.
- O CPF continua explicitamente aprovado **para a URL exata**. Seu valor não foi incluído no relatório ou nos novos artefatos.
- Não há declaração booleana obrigatória pendente. O aviso informativo de privacidade foi identificado como aviso, sem inventar aceite; perguntas sensíveis opcionais continuam sem resposta presumida.
- Essas condições **não liberam novo envio**, pois a tentativa anterior tem resultado desconhecido.

### Função, etapa e limite do diagnóstico

A fonte **efetivamente executada**, recuperada do deployment original, contém este ramo exclusivo em `server/quickin-form.ts`, função `executeQuickinForm`:

```ts
const [,applicationResponse] = await Promise.all([submit.click(), accepted]);
if (!applicationResponse.ok()) return {
  status: 'unknown',
  message: 'A Quickin não confirmou o recebimento. Confira o resultado antes de repetir.'
};
```

Essa é exatamente a mensagem persistida. Portanto, a falha demonstrável está na **resposta HTTP não aceita ao POST de candidatura `/apply`**, depois do clique normal da interface; não se trata apenas de candidatura preparada ou falha de publicação na fila. A revisão executada descartou status HTTP, código e campos da resposta. **O código HTTP exato e o motivo específico da recusa não podem ser recuperados dos registros disponíveis.** Não foram atribuídos a CPF, telefone ou qualquer outra resposta sem evidência.

Foi tentada exclusivamente a leitura de `result.json` do Sandbox original, sem retomá-lo: a infraestrutura retornou **HTTP 410**, pois a sessão já estava encerrada. O Gmail integrado ao projeto tem permissão somente de envio; não foi usado como se permitisse consultar a caixa de entrada. Não há, nessas evidências, recibo do empregador nem comprovação definitiva de ausência de candidatura no destino.

Para resolver **esta tentativa**, ainda é necessário conciliar o resultado por uma evidência do destino: recibo válido, registro da candidatura existente ou confirmação inequívoca de que não houve candidatura. Somente uma ausência comprovada permite avaliar nova tentativa e corrigir a recusa concreta. A ausência de recibo no Empregatos, isoladamente, não autoriza retransmissão. **O objetivo imediato de uma nova candidatura real confirmada continua não cumprido.**

### Correção publicada e verificação segura

Foi preservado e concluído o trabalho já preparado após a tentativa, sem refazer os adaptadores:

- `server/quickin-form.ts`: passa a aguardar e conferir a resposta do upload antes de liberar `/apply`; recusas da candidatura preservam HTTP, códigos conhecidos e nomes dos campos públicos indicados pelo destino.
- `shared/types.ts`, `server/application-verification.ts`, `server/operations.ts`: diagnóstico estruturado ligado à tentativa e log `submission_executor_result`, contendo etapa, HTTP, código conhecido, campos e SHA-256 da resposta. Valores do candidato e texto bruto do erro não são persistidos nesse diagnóstico.
- `server/automatic-cycle.ts`: progresso informa explicitamente as tentativas desconhecidas e seu bloqueio de repetição, além dos outros impedimentos.
- `scripts/inspect-globalti-real-attempt.ts`: inspeção de leitura restrita à Global TI já descoberta, com conferência atual de perfil, formulário e duplicidade; não prepara nem enfileira candidaturas.
- `tests/single-submission-worker.test.ts`: fixture atualizada para fornecer os metadados de mensagem exigidos pelo consumidor. A falha encontrada era na fixture sem `metadata`, sem evidência de falha equivalente no consumidor real.

Verificação: TypeScript e build aprovados; **64 testes focados aprovados**, sendo 58 em cinco arquivos e seis do worker após corrigir sua fixture. O teste novo comprovou persistência do diagnóstico e recusa de segunda transmissão de resultado desconhecido. Esses testes validam a correção e **não são recibos reais**. A candidatura real original permaneceu sem alteração de resultado.

Correção promovida ao domínio [curriculoautomatico.vercel.app](https://curriculoautomatico.vercel.app): deployment **`dpl_D3fkpfaC4Zz6QieFRz25LHqtWn2n`**, revisão **`ccaddb003c86f999088f6a3c33175915c38068e607fa5f6791cec1c88eef45a0`**. O diagnóstico novo vale para execuções posteriores; não reconstrói a resposta descartada da Global TI.

### Agendamento independente

O cron do backend foi preservado em **08h de Brasília diariamente** (`/api/daily-routine`). A próxima execução nominal persistida é **24/10/2026, 08h**, com a janela de precisão do plano já documentada até 09h. Não foi feita chamada manual ao cron nem antecipado `nextRun`.

**Ainda não há comprovação de candidatura confirmada pelo próximo agendamento.** Foi criado acompanhamento de leitura neste chat, `verificar-cron-real-do-empregatos`, para **24/10 às 09h15 de Brasília**, destinado a consultar banco/logs e atualizar este relatório após a janela do cron. Não aciona descoberta, processamento ou transmissão e deve encerrar após registrar o resultado ou um impedimento que exija ação do titular. A observação local depende de o computador e o aplicativo estarem disponíveis; o cron do backend continua hospedado na Vercel. [Documentação do acompanhamento local](https://learn.chatgpt.com/docs/automations).

### Evidências desta continuação

- [Estado real, duplicidade, campos e autorizações](../artifacts/globalti-real-attempt-state-2026-10-23.json).
- [Logs reais sanitizados da preparação, mensagem, worker e resultado](../artifacts/globalti-real-execution-events-2026-10-23.json).
- [Fonte executada, Sandbox original e leitura recusada com HTTP 410](../artifacts/globalti-executed-source-2026-10-23.json).
- [Publicação da correção, saúde, cron e comparação das fontes relevantes](../artifacts/globalti-real-correction-release-2026-10-23.json).

**Situação final desta continuação: uma tentativa real investigada, zero novas transmissões, zero novos recibos confirmados, nenhum reenvio da Global TI.**

## Reconciliação segura e continuação real — 23/10 após 12h30

Esta seção atualiza o levantamento anterior, sem apagar sua sequência histórica. Não houve reinício da auditoria, nova transmissão da Global TI, alteração manual de seu status ou envio manual de currículo pelo agente.

### 1. Reconciliação da Global TI: resultado ainda desconhecido

O banco continua contendo **uma candidatura, uma tentativa, nenhum recibo e nenhuma data de envio confirmado** para a Global TI. A tentativa `a8f0e151-72bb-43d2-b9b6-99bd7ce0a808` e sua reserva permanecem preservadas. O CPF aprovado para essa vaga não foi reaproveitado em outro destino.

Foram utilizados somente canais oficiais do candidato e o suporte público:

- O Gmail conectado foi pesquisado incluindo spam e lixeira. A busca ampliada encontrou dois e-mails de **acesso ao portal**, enviados por `noreply@mailquickin.com`, IDs `1a1690ffbb502c55` e `1a1693b983beb02d`. Nenhum é confirmação de candidatura. Essa leitura foi feita pelo conector Gmail do agente, distinto da integração de envio do produto mencionada no levantamento anterior.
- O login oficial em `https://jobs.quickin.io/globalti/login` confirmou o envio de acesso. O link recebido permitiu autenticação legítima. O menu observado ofereceu conta e saída, sem histórico publicado; a vaga IMW7499 foi visitada somente para leitura. Não foi enviado formulário nem arquivo. A ausência de histórico ou a presença de “Candidatar-se” **não comprovam ausência de candidatura**. Nenhum token de acesso foi salvo nos artefatos.
- Com autorização expressa do titular, foi enviada a consulta de confirmação para `contato@globalti.com.br`, endereço publicado no [site oficial](https://www.globalti.com.br/). Assunto: “Confirmação de recebimento de candidatura — IMW7499”. Envio em **23/10 às 11:43:48 Brasília** (`14:43:48Z`), mensagem/conversa Gmail **`1a16937d1e63856d`**, rótulo `SENT` conferido. Sem anexos, currículo ou CPF; o texto esclarece que não é nova candidatura. [Registro do pedido](GLOBALTI-PEDIDO-DE-CONFIRMACAO-2026-10-23.md).
- A última leitura da caixa nesta continuação encontrou apenas os dois acessos, sem resposta do suporte ou recibo. Ausência de e-mail e silêncio do suporte não autorizam retransmissão.

**Classificação: Resultado ainda desconhecido.** O bloqueio de duplicidade permanece. Será necessária confirmação verificável do destino para reconhecer recebimento, ou confirmação inequívoca de ausência para considerar outra tentativa. Não foi usado endpoint privado nem acesso de empregador.

### 2. Causa comprovada e limite do diagnóstico antigo

Permanece demonstrado o ramo de `executeQuickinForm` que tratou uma resposta HTTP não aceita ao **POST `/apply` real**. A revisão executada descartou status e corpo. A sessão Sandbox original encerrada respondeu HTTP 410 à leitura; a instrumentação posterior não reconstrói esses dados.

Portanto, não há evidência para atribuir o problema antigo a um HTTP específico, CPF, telefone, upload ou outra resposta do candidato. A consulta ao suporte busca reconciliar o registro, não reproduzir a falha na mesma vaga.

### 3. Correções do executor Quickin

Em `server/quickin-form.ts` e tipos relacionados:

- O plano de respostas rejeita campo obrigatório vazio ou só com espaços, e-mail malformado e booleano ambíguo. Opções, limites, números, CPF e respostas aprovadas continuam conferidos.
- A validade nativa do formulário é verificada antes do upload e novamente antes da submissão. Campo obrigatório adicional inválido impede `/apply`.
- O executor aguarda o resultado do upload, verifica seu HTTP e exige uma referência de mídia utilizável. Corpo vazio, objeto de erro ou ausência de referência bloqueiam a candidatura antes de `/apply`.
- Uma confirmação que já estava visível antes do envio não é reutilizada como recibo de uma tentativa nova e impede a submissão.
- Respostas não aceitas preservam HTTP exato, código conhecido permitido, nomes dos campos do esquema público e hash SHA-256 do corpo. Valores do candidato e texto livre do provedor não entram no diagnóstico. Campos aninhados, como `phones.0`, são associados ao campo conhecido sem gravar seu valor.
- O contrato observado no cliente público trata HTTP 400 com `e.data.errors ?? e.data`. Quando há campos reconhecidos, o diagnóstico distingue `validation_rejection`; os demais retornos não aceitos recebem `http_rejection`. **Rejeição de validação observada não equivale a comprovar ausência de registro no empregador.**
- HTTP aceito recebe `accepted_awaiting_confirmation`. Só a confirmação real exibida pelo destino **após esta submissão** gera `receipt_verified` e recibo. HTTP 200/201 isolado não confirma envio.
- Diagnóstico permanece ligado à tentativa persistida e ao evento `submission_executor_result`. Resultado incerto não ganha repetição automática; a rotina continua pesquisando outras vagas.

### 4. Regressões e validação

| Resposta de candidatura testada | Diagnóstico e decisão conservadora |
|---|---|
| 400 com mapa público de campos, direto ou em `errors` | Validação identificada, status e campos sanitizados; resultado desconhecido, sem recibo ou liberação automática de repetição |
| 401 | HTTP registrado; não presume rejeição anterior a qualquer efeito; resultado desconhecido |
| 403 | HTTP registrado; não presume ausência de registro; resultado desconhecido |
| 409 | Conflito não vira recibo nem prova de ausência; resultado desconhecido |
| 422 | HTTP e campos conhecidos registrados; sem inferir contrato de ausência; resultado desconhecido |
| 429 | Limitação não autoriza repetir a candidatura; resultado desconhecido |
| 500 e 503 | Falha do servidor pode ocorrer após efeitos; resultado desconhecido |
| 201 com confirmação visível posterior | Recibo produzido no receptor de teste |
| 200 sem confirmação visível | Resultado desconhecido, sem recibo |

Foram aprovados **86 testes distintos em seis arquivos**: 31 testes Quickin em dois arquivos; 54 testes de backend em quatro arquivos; mais uma regressão de continuação após resultado desconhecido. O arquivo do ciclo passou com 14 testes após a inclusão (13 já contados no grupo de 54, sem contagem duplicada). TypeScript e build aprovados.

O teste completo do executor usa Playwright com rede interceptada e dados sintéticos: comprova ordem upload → candidatura, cada HTTP solicitado, sanitização, ausência de repetição e bloqueio anterior ao `/apply` quando necessário. Também cobre upload recusado, referência de mídia inválida, obrigatório adicional inválido e confirmação preexistente. **Todos são testes controlados; nenhum conta como candidatura real.**

Arquivos: `tests/quickin.test.ts`, `tests/quickin-http-regression.test.ts`, `tests/automatic-cycle.test.ts`, além das verificações de submissão automática, worker e scheduler. Saídas locais em `.data/quickin-http-regression-results.txt`, `.data/quickin-contract-backend-tests.txt`, `.data/quickin-http-regression-typecheck.txt` e `.data/quickin-contract-build.txt`.

### 5. Oportunidades e destinos adicionais

O exame público limitado de seis quadros Quickin consultou **17 publicações**: Cadmus 4, Kalendae 4, INDT 3, Talent Four 5, eLaw 1 e EVT IT 0. Nenhum currículo foi transmitido. Apenas Cadmus, “Desenvolvedor(a) Fullstack .NET”, publicação de 20/10, recebeu classificação inicial compatível (79 pontos). Seu formulário exige foto não suportada, endereço/CEP/bairro/país/região, perguntas ainda sem resposta aprovada e consentimento explícito de privacidade. Não foi considerada submetível nem recebeu autorização inventada; requisitos técnicos adicionais também não foram presumidos.

O catálogo de descoberta em produção passou a incluir **Zup Innovation** e **CodeRoad** com o adaptador Greenhouse existente, preservando CI&T e Wellhub. A plataforma já era autorizada; não foram ampliadas permissões de submissão nem o escopo exato da Global TI. Nenhum filtro foi relaxado.

Na busca real abaixo foram adicionadas 30 vagas CodeRoad, quatro Zup e cinco CI&T. **Zero novas vagas plenamente elegíveis.** Os motivos se sobrepõem: 34 restrições geográficas, 25 publicações fora do período e seis modalidades incompatíveis. A vaga .NET da Zup tem publicação de **05/03/2025**, não uma publicação nova em 2026. O registro recente de coleta não substitui a data de publicação. Os IDs, URLs, datas e impedimentos de cada uma das 39 estão no artefato de estado.

### 6. Execução real pelo produto e resultados persistidos

Após a publicação, foi acionado **uma vez** “Buscar agora” na interface normal do Empregatos. Descoberta, resolução e decisões foram executadas pelo próprio backend. Isso é uma execução real de origem `user_triggered_automation`; **não é evidência do cron**.

| Etapa | Evidência |
|---|---|
| Solicitação de descoberta | Tarefa/execução `a9f96cbb-157e-4ab1-bc05-751a3377d22f`, criada `15:23:17.734Z` (12:23 Brasília) |
| Vercel Queues e worker | `empregatos-discovery`; mensagem `46-1M1eB3izlp0pE80aYIEfrdoN83zsSlV4`, entrega 1, consumidor `api_Ssearch-worker_Dmjs`, recebida `15:23:22.223Z` |
| Requisição do worker | `rxspj-1792768998695-93273354a7ec`, deployment atual |
| Descoberta concluída | Execução iniciada `15:23:25.628Z`; tarefa concluída `15:27:37.380Z`, uma execução, erros vazios; **469 registros consultados, 39 vagas novas sem duplicação** |
| Resolução | Tarefa `ddaaa6eb-6add-43bd-8433-37ed59c599ca`, criada `15:27:38.112Z`, concluída `15:28:45.423Z`, `attempts: 1`, sem erro persistido |
| Evidência do worker de resolução | Transições reais em `/api/destination-worker`, requisição `c55j8-1792769258525-3b08563d4fb8`, incluindo verificação de formulários do acervo. O ID da mensagem de resolução não foi recuperado nos logs consultados; `attempts: 1` da tarefa não foi tratado como contador de entregas |
| Novas candidaturas preparadas | **0** |
| Novas tentativas e transmissões | **0**; nenhum executor de candidatura foi iniciado para as 39 vagas |
| Novos recibos | **0** |

A consulta de estado distingue vaga nova por `discoveredAt`; a atualização de `automation.runId` em vagas reobservadas não é contada como descoberta nova. A consulta ampla de logs teve paginação; o artefato final usa consultas focadas sem páginas pendentes para a mensagem de descoberta e transições da requisição de resolução. Não afirma que o recorte de logs contém todo evento da plataforma.

A única tentativa Global TI continua sendo a histórica, com este resultado:

| Vaga / candidatura | Origem / executor / tentativa | Resposta / confirmação / estado |
|---|---|---|
| `9a7b92d7-12b2-4fc5-942d-0cf3e4e6a071` / `69692d0e-e9ba-448b-bb78-0140f31dc5f5` | Execução `a1198849-24d0-46d6-9158-e3021c4bc43a`, `user_triggered_automation`, `ats_browser`, tentativa `a8f0e151-72bb-43d2-b9b6-99bd7ce0a808`, 10:52:21–10:52:39 Brasília | POST `/apply` HTTP não aceito, código e corpo antigos descartados; recibo `null`, `submittedAt` ausente; **Resultado desconhecido, bloqueada contra repetição** |

### 7. Bloqueios e meta efetivamente cumprida

**Meta de 23/10: 0 de 5 candidaturas automáticas confirmadas.** A tentativa desconhecida ocupa uma reserva, com uso diário 1 e saldo 4; isso não representa um envio confirmado. O recibo histórico da Solucionare é de 22/10 e não foi contado hoje.

Permanecem: reconciliação Global TI pendente; cinco candidaturas anteriores bloqueadas por verificação humana; canais que exigem autenticação; novas vagas fora dos filtros; Cadmus sem suporte/respostas/consentimento completos. Não há correção demonstrável do erro antigo que possa ser aplicada à Global TI com segurança antes de saber se foi recebida. **O objetivo imediato de comprovar pelo menos uma nova candidatura real continua não cumprido.**

### 8. Estado da produção

Correções promovidas ao domínio [curriculoautomatico.vercel.app](https://curriculoautomatico.vercel.app), deployment **`dpl_EH6wMAqLKk5NjnnYgWgMvonGkdZu`**, revisão **`036ce1fb7afd7e0c1b045e106084b88d813db6533525fd640d3bdbdb9f3b9119`**. Health HTTP 200, Firestore disponível. Seis fontes relevantes do deployment foram comparadas byte a byte com o workspace e coincidem, incluindo executor, operações, verificação de candidatura, ciclo automático, tipos e cron. Scripts de observação e documentação posteriores não alteram esse runtime.

### 9. Agendamento: habilitado, próxima execução ainda não observada

Cron Vercel habilitado (`disabledAt: null`), associado ao deployment atual: `/api/daily-routine`, `0 11 * * *`, **08h Brasília**. Rotina do titular ativa em modo automático, mínimo 70, limite diário cinco e `nextRun: 2026-10-24T11:00:00Z`. Não foi antecipado horário nem chamado o cron manualmente.

A próxima janela normal é **24/10 entre 08h e 09h Brasília**. Ainda é futura neste levantamento: **não está comprovada a execução independente completa com recibo**. O acompanhamento local existente `verificar-cron-real-do-empregatos` permanece ativo às **09h15**, atualizado para ler a execução agendada, filas, resoluções, tentativas, recibos e a resposta do suporte. Não dispara o backend, não envia outra mensagem e não reenvia a Global TI. O acompanhamento de diagnóstico é separado do cron de produção e depende de o aplicativo local estar disponível.

### 10. Evidências desta etapa

- [Reconciliação oficial, Gmail, suporte e bloqueio preservado](../artifacts/globalti-safe-reconciliation-2026-10-23.json).
- [Exame público dos seis quadros Quickin e impedimentos](../artifacts/submittable-expansion-2026-10-23.json).
- [Alteração limitada do catálogo Greenhouse](../artifacts/submittable-expansion-config-2026-10-23.json).
- [Estado real: execução, tarefas, 39 vagas, tentativa Global TI e meta](../artifacts/real-continuation-state-2026-10-23.json).
- [Mensagem da fila, transições sanitizadas e limites da evidência](../artifacts/real-continuation-cloud-events-2026-10-23.json).
- [Produção, comparação de fontes, cron e testes](../artifacts/quickin-contract-release-2026-10-23.json).
- [Captura da interface ao encerrar](../artifacts/empregatos-continuation-final-2026-10-23.png).

**Resultado desta etapa: reconciliação pendente, bloqueio preservado, correção publicada, busca real concluída, zero novas candidaturas enviadas ou confirmadas.**

## Expansão orientada a candidaturas submetíveis — 23/10, após 13h

**AUTOMAÇÃO AINDA NÃO VALIDADA.** Esta etapa trata o gargalo de descoberta sobre os componentes existentes. Publicação, testes e reconhecimento de formulário continuam separados de candidatura transmitida e recibo confirmado.

### Problemas demonstrados e correções

O levantamento anterior misturava catálogos integrais com oportunidades aproveitáveis: os 469 registros incluíam publicações antigas e vagas de outras regiões, e só depois eram classificados. A pesquisa oficial usava cargos amplos, sem orientar a busca pelas tecnologias e pelo **único ano de experiência declarado**. O nível cadastrado permanece “Não especificado”; não foi convertido em pleno ou sênior.

Foram corrigidos problemas específicos:

1. **Filtros antecipados por titular:** `server/discovery-quality.ts` examina cada resultado depois do cache público compartilhado e antes de incorporá-lo ao acervo. Exclui incompatibilidades conhecidas de data, modalidade, região, requisitos obrigatórios e identidades já enviadas ou incertas. Dados ausentes que ainda possam ser esclarecidos na publicação são distinguidos de impedimentos demonstrados. O cache público não recebe os filtros privados de um usuário. A identificação de fechamento por ausência em um quadro ATS continua utilizando o catálogo completo, antes desse corte; uma vaga filtrada não é declarada encerrada por isso.
2. **Requisitos técnicos efetivos:** seções explícitas de requisitos passam a alimentar `requiredSkills` em Quickin e nas respostas novas dos conectores Greenhouse, Lever e Ashby. Diferenciais, negações e alternativas não são simplesmente transformados em uma lista de exigências cumulativas. Foram acrescentados reconhecedores de tecnologias ausentes, incluindo Next.js, DynamoDB, Clipper e PL/SQL. Isso impede que menções a C# como diferencial façam a vaga Clipper/PLSQL parecer adequada.
3. **Falsos positivos de cargo e qualificação:** “Technology”, isoladamente, deixou de equiparar um cargo a desenvolvimento de software. A sondagem Truelogic revelou um “Form Builder” sem programação, que havia recebido 72 pontos por menções a tecnologias que o texto dizia não exigir. A negação em inglês e a família de cargos foram corrigidas. Senioridade exigida sem confirmação no perfil bloqueia candidatura. A pesquisa de destinos também deixa de gastar orçamento tentando suprir qualificações ausentes do candidato por meio de outra página.
4. **Expansão progressiva pelo backend:** a pesquisa oficial usa as tecnologias confirmadas (C#, .NET, ASP.NET Core, Angular, SQL Server e demais competências cadastradas), experiência declarada, janela e geografia. Inclui Quickin e o formulário nativo WP Jobs Board já implementado, além dos ATS existentes. Publicações individuais são relidas; descrição, destinatário e data sugeridos pelo mecanismo de pesquisa não viram evidência. Um quadro pode ser aprendido de uma publicação oficial verificada, limitado a 12 quadros por titular. Aprender um quadro **não cria permissão de transmissão**. Consentimentos, executor e preflight continuam obrigatórios.
5. **Orçamento e produtividade:** a rotina persiste `run.sourceProductivity` e `routine.discoveryProductivity`, com registros examinados, preservados, compatíveis, canais publicados verificados e exclusões. Os indicadores de conversão acrescentam preparação, tentativas e recibos dos registros atribuídos à fonte; esses números não são inferidos da quantidade de URLs. Quadros sem oportunidade compatível aguardam a próxima janela normal, sem alterar os interruptores de fontes do usuário; uma mudança nas preferências ou qualificações permite reavaliá-los. Uma janela com todos os quadros em espera conclui sem consulta externa e preserva o agendamento.

O mínimo 70, os 14 dias, as modalidades, os regimes e as localidades não foram alterados. A assinatura dos filtros antes e depois é `22807533ea2c589be194da590b5752ea5c029335fea356ac84c2ccd70ea1bde4`.

### Cadmus: exigências concretas, sem transmissão

A [vaga oficial Cadmus](https://jobs.quickin.io/cadmus/jobs/6ad7b356cc70ac0013cd030b) respondeu HTTP 200, continua ativa e tem publicação de **20/10/2026**. O formulário foi observado somente para leitura: a interface exibe **“Foto *”**, e o esquema público também marca `photo_media_id` como obrigatório. Não se trata de uma foto opcional confundida com currículo. O executor atual não oferece upload de foto de candidato, e nenhum arquivo foi inventado ou transmitido.

| Situação | Campos ou requisito |
|---|---|
| Disponíveis e aproveitados na análise | Currículo original aprovado, nome, e-mail, telefone, cidade, estado explicitamente cadastrado, cargo do perfil e pretensão salarial PJ aprovada |
| Seleção não presumida | Nível de experiência; o perfil não declara um nível correspondente às opções. País exige seleção própria; a localidade é evidência de Brasil, mas nenhuma seleção foi fabricada nesta inspeção |
| Dados/arquivo ausentes | Foto, bairro, endereço e CEP |
| Consentimento ausente | Aceite específico do aviso de privacidade da Cadmus, obrigatório; aprovação da Global TI ou CI&T não foi reutilizada |
| Qualificações indispensáveis não confirmadas | Next.js, DynamoDB, PostgreSQL e AWS |

As respostas genéricas de “Cargo pretendido”, “Estado/Região” e pretensão como prestador agora reutilizam fatos confirmados, sem inventar endereço ou consentimento. A classificação corrigida caiu de **79 para 49**, abaixo de 70. Portanto, completar o formulário, sozinho, não tornaria esta vaga elegível. Nenhuma candidatura Cadmus foi preparada ou transmitida.

### Sondagens de fontes adicionais

Além dos seis quadros examinados anteriormente, foram sondados Starta, Verity, Beltis, Qintess, IEBT Innovation, Domvs IT e HRE Group. Cinco confirmaram a configuração pública esperada; Qintess e HRE Group falharam nessa confirmação e não foram integrados. Os cinco quadros verificáveis somaram **19 publicações de cargos examinadas**: Starta 7, Verity 3, Beltis 1, IEBT 5 e Domvs 3. Releituras para validar a classificação não são contadas como vagas novas.

O quadro Ashby oficial da Truelogic devolveu **131 registros**, dos quais a sondagem inicial chegou a classificar o “Form Builder” como compatível. Esse falso positivo foi corrigido; suas vagas .NET sêniores não autorizam presumir a experiência exigida. O quadro não foi integrado apenas para aumentar o catálogo. Nos três quadros relidos com maior detalhe (Starta, Beltis e Domvs), a classificação já resultou em **zero plenamente compatíveis**; campos pessoais e consentimentos também impediam os formulários inicialmente apontados pelo classificador anterior.

São **150 registros adicionais de sondagem** (19 Quickin + 131 Ashby), separados da busca de produção e sem transmissão ao empregador. **Zero novos quadros foram cadastrados manualmente como fontes de submissão funcional comprovada.** A expansão agora pode ser feita pelo próprio backend, a partir de publicações verificadas, sem confundir esse mecanismo com uma candidatura concluída. Não foi desenvolvido um adaptador novo para um canal sem oportunidade elegível comprovada.

### Testes e publicação

Passaram **98 testes distintos em oito arquivos**: conjunto completo de 96, mais a regressão de janela sem quadros disponíveis e a descoberta de quadro Quickin novo com tecnologias/experiência confirmadas. Também foram conferidos TypeScript e build. Os testes usam dados e respostas controlados; seus recibos não entram na meta real.

Deployment promovido ao domínio principal: **`dpl_HrKVtRWYXH216gcG8QbQevKkyMrg`**, revisão **`a9bde0b308bc48d85a11b7b629f52b6b1567cdd936f709334a0d920678cf93c5`**. Health HTTP 200, Firestore disponível e 12 fontes relevantes byte a byte iguais às publicadas. As revisões intermediárias em staging não foram usadas como evidência de execução. Nenhuma configuração de fila, cron, autorização sensível ou política de consentimento foi relaxada.

### Evidências da expansão

- [Cadmus: campos, dados disponíveis, requisitos e impedimentos](../artifacts/cadmus-requirements-2026-10-23.json).
- [Leitura da interface pública Cadmus, sem preenchimento](../artifacts/cadmus-required-fields-2026-10-23.txt).
- [Imagem dos campos obrigatórios Cadmus](../artifacts/cadmus-required-fields-2026-10-23.png).
- [Sondagens Quickin acumuladas; classificações iniciais devem ser lidas com as correções desta seção](../artifacts/submittable-expansion-2026-10-23.json).
- [Releitura técnica de Starta, Beltis e Domvs](../artifacts/targeted-source-quality-2026-10-23.json).
- [Sondagem Truelogic, incluindo o falso positivo identificado e corrigido](../artifacts/official-board-yield-2026-10-23.json).
- [Deployment, fontes, testes e cron preservado](../artifacts/discovery-quality-release-2026-10-23.json).

### Execução real, defeito adicional encontrado e correção validada

A primeira execução, **`f1bd1208-799d-4160-be22-a0bf98f006b3`**, foi acionada uma vez por “Buscar agora”, no domínio principal, depois da publicação. O Empregatos executou descoberta e resolução. Consultou **476 registros**, preservou 20 após os filtros e não acrescentou vaga nova. A busca ficou `partial`: o InfoJobs não retornou fontes verificáveis. Não houve preparação, transmissão ou recibo.

Entre os cinco registros classificados inicialmente como compatíveis, a conferência revelou **duas vagas afirmativas PcD sem declaração específica de elegibilidade**: Domo `abadeed5-dc46-45da-b48b-b91511bc8a57` e CI&T `7e98745c-6905-4b61-98f5-4d64869b9088`. A primeira não tinha candidatura; a segunda já estava bloqueada por verificação humana, sem tentativa nem recibo. Nenhuma foi enviada. Acessibilidade ou menção a PcD na vaga não estabelecem qualquer condição pessoal do candidato.

Essa falha reproduzível foi corrigida em `analyze` e no critério de pesquisa de destinos: vagas explicitamente afirmativas exigem declaração positiva aprovada para o destino exato. Uma aprovação para outra vaga, uma preferência de acessibilidade ou ausência de resposta não bastam. Avisos gerais de que a empresa recebe pessoas com deficiência não são tratados como exclusividade. A correção não inferiu nem registrou uma condição médica do titular.

Foram aprovados **99 testes em oito arquivos**, incluindo essa regressão, escopo exato da declaração, avisos inclusivos gerais, proteção de resultado incerto, descoberta de novo quadro, fatos confirmados e janela sem fontes disponíveis. TypeScript e build de produção passaram. Os 98 testes descritos acima são o estágio anterior, não um segundo conjunto somado a 99.

A correção final foi promovida ao domínio principal: **`dpl_3iMxZ3n2pYU1SRVRYTnu1vM47w3D`**, revisão **`2521c5f400cdb18f6a5a9947a35804367ae685d80defe7bfda9d7df4d7043044`**. Health HTTP 200 e 12 fontes relevantes conferidas byte a byte. A revisão `dpl_HrKVtRWYXH216gcG8QbQevKkyMrg` permanece identificada como a publicação da primeira execução desta seção, não como a produção final.

Uma **segunda e única revalidação após essa correção**, execução **`00a7e756-1a5c-4261-9f77-3a2eb78c8cca`**, concluiu sem erros. Consultou **348 registros**, preservou 15 e retornou **três oportunidades já conhecidas** compatíveis. As duas afirmativas foram bloqueadas corretamente e não consumiram pesquisa de destino para tentar suprir uma declaração pessoal ausente. Os quadros sem produtividade ficaram em espera, reduzindo em 128 os registros reprocessados nesse intervalo. **Não foram 348 vagas novas nem 824 oportunidades únicas nas duas buscas.**

| Fonte na revalidação final | Registros examinados | Preservados | Compatíveis | Canal submetível liberado |
|---|---:|---:|---:|---:|
| CI&T / Lever | 177 | 4 | 0 | 0 |
| Gupy | 156 | 10 | 3 | 0 |
| AllEasy | 10 | 0 | 0 | 0 |
| Abler / e-mail publicado | 5 | 1 | 0 | 0 |
| Pesquisa oficial, pesquisa por e-mail, LinkedIn, Glassdoor e InfoJobs | 0 registros válidos retornados | 0 | 0 | 0 |
| **Total** | **348** | **15** | **3** | **0** |

As contagens medem registros devolvidos pelos adaptadores, incluindo releituras e cache, não o número de páginas ou pesquisas internas do mecanismo de IA. As fontes pausadas não aparecem como uma nova consulta de zero vagas. Preparações, tentativas e confirmações ficam separadas desses contadores.

As três oportunidades compatíveis remanescentes são anteriores a esta etapa e mantêm estes impedimentos:

| ID da vaga | Empresa / cargo | Pontuação | Impedimento verificável |
|---|---|---:|---|
| `06c71f53-5d17-4975-84b4-9fcc7c0ebfa4` | Vem Pra Pixeon — Analista Desenvolvedor(a) C#/.NET Pleno | 92 | Destino oficial Gupy exige autenticação; nenhum executor independente autorizado ou canal alternativo verificado |
| `bb0770a9-fdaf-48ad-877e-aede1553b921` | Víssimo — Desenvolvedor(a) Full Stack, ênfase em Frontend | 70 | Mesmo impedimento de autenticação e ausência de canal independente |
| `0db3bdc1-db2e-49c6-95b3-8f46bfb6e09a` | Quadro Bancorbrás, nome publicado “Oportunidades” — Analista de Desenvolvimento de Sistemas | 78 | Mesmo impedimento de autenticação e ausência de canal independente |

Não foram contornados login, verificação humana ou a política de destino cadastrada. A existência dessas vagas não autoriza tratar uma sessão de navegador do agente como executor do produto. A frente técnica restante para esse acervo é disponibilizar um fluxo Gupy legítimo e autorizado, com sessão própria do candidato e confirmação verificável, ou encontrar outro canal oficial para a mesma vaga. Nenhuma dessas condições foi presumida como implementada nesta entrega.

### Fila, workers e persistência das duas execuções

Todos os horários abaixo estão em UTC; Brasília corresponde a menos três horas. Os IDs de mensagens foram recuperados de logs de produção filtrados pelo deployment de cada execução, sem páginas pendentes nas consultas utilizadas.

| Registro | Primeira execução | Revalidação final |
|---|---|---|
| Origem | `user_triggered_automation` | `user_triggered_automation` |
| Tarefa de descoberta | `f1bd1208-799d-4160-be22-a0bf98f006b3` | `00a7e756-1a5c-4261-9f77-3a2eb78c8cca` |
| Criação / conclusão da tarefa | `16:11:23.209Z` / `16:15:25.343Z` | `16:22:39.194Z` / `16:24:56.831Z` |
| Mensagem `empregatos-discovery` | `5x-1M1eB47QVjY4GCFOdI0gyJbjwczgdP5m` | `5G-1M1gLi5EuLTCr0Zro4xHsm7ORP4uTf3i` |
| Consumidor / entrega | `api_Ssearch-worker_Dmjs`, entrega 1 | Mesmo consumidor, entrega 1 |
| Tarefa de resolução | `e1f8dab8-b2aa-4a36-bff7-4d4042b2fa25` | `ed74b71d-f132-49fb-ad2e-c80cdee8eb4d` |
| Criação / conclusão da resolução | `16:15:26.188Z` / `16:16:38.267Z` | `16:24:57.625Z` / `16:25:34.601Z` |
| Mensagem `empregatos-destinations` | `4c-1M1hHhRvczgHDO3xAKRB4lrihi1pHDdq` | `54-1M1eB3q2q2LNYqZF2uwjEbK1ty5hUr0k` |
| Consumidor / entrega | `api_Sdestination-worker_Dmjs`, entrega 1 | Mesmo consumidor, entrega 1 |
| Novas preparações / tentativas / recibos | **0 / 0 / 0** | **0 / 0 / 0** |

Não foi iniciado executor de candidatura nessas duas execuções; por isso não existe identificador de nova tentativa ou resposta de submissão a apresentar. O resultado foi bloqueio anterior à transmissão, não um envio com retorno incerto novo. A única tentativa Global TI continua `a8f0e151-72bb-43d2-b9b6-99bd7ce0a808`, com os mesmos horários originais, `outcome: unknown`, recibo `null` e sem `submittedAt`.

Ao encerrar, as quatro tarefas estavam `completed`; o progresso da rotina passou para **`waiting` em `16:26:17.467Z`**. Houve somente renovação normal da credencial de leitura Firebase CLI do operador quando expirou; isso não criou uma candidatura nem alterou o agendamento.

### Global TI, cron e entrega efetiva

A consulta ao Gmail nesta etapa não encontrou resposta da Global TI. O pedido autorizado de suporte permanece enviado, conversa `1a16937d1e63856d`; nenhum novo contato foi enviado. **Resultado ainda desconhecido, sem reenvio e sem liberação manual de reserva.** O detalhe HTTP antigo permanece irrecuperável pelas evidências disponíveis.

Cron de produção preservado em **24/10/2026 às 08h Brasília**, janela até 09h. O observador local das 09h15 foi atualizado para consultar a produtividade, os bloqueios, as filas e os recibos. As duas buscas desta seção foram acionamentos normais pela interface para validação e **não comprovam funcionamento independente do cron**, que ainda é futuro.

| Entrega solicitada | Resultado efetivo desta etapa |
|---|---|
| Problemas de descoberta corrigidos | Filtros tardios, pesquisa sem tecnologias/experiência, requisitos técnicos ignorados, família de cargo ampla demais, senioridade presumida e elegibilidade afirmativa presumida |
| Novas fontes de submissão funcional comprovada integradas | **0**; expansão automática limitada implementada, sem conceder permissões ou alegar recibos |
| Registros adicionais sondados fora da rotina | **150**, sem candidaturas e sem contar releituras como novas vagas |
| Registros na rotina real | **476 na primeira busca; 348 na revalidação**, com sobreposição |
| Novas vagas / novas elegíveis | **0 / 0** |
| Elegíveis remanescentes no acervo reobservado | **3**, todas Gupy, sem canal submetível independente |
| Novas candidaturas preparadas | **0** |
| Novas transmissões / tentativas | **0 / 0** |
| Novos recibos reais | **0** |
| Global TI | Resultado desconhecido, bloqueio preservado, suporte pendente |
| Cadmus | Ativa; foto e consentimento obrigatórios; dados e qualificações não confirmados; sem envio |
| Produção final | `dpl_3iMxZ3n2pYU1SRVRYTnu1vM47w3D`, health e fontes verificados, cron ativo |
| Meta diária de 23/10 | **0/5 confirmadas**; uma reserva incerta, saldo quatro |

Os impedimentos atuais são concretos: falta de nova oportunidade simultaneamente compatível e submetível no conjunto verificado; fluxo autenticado Gupy sem executor independente autorizado neste estado; verificações humanas; dados e consentimentos específicos ausentes; reconciliação Global TI pendente. Não houve tentativa de completar a meta com vagas incompatíveis, bancos genéricos ou confirmações simuladas.

Evidências finais:

- [Estado completo das duas execuções, tarefas, filtros e candidaturas](../artifacts/discovery-quality-real-state-2026-10-23.json).
- [Resumo real, três vagas remanescentes, mensagens de fila e limites das consultas](../artifacts/discovery-quality-real-outcome-2026-10-23.json).
- [Reprodução segura dos dois bloqueios de elegibilidade afirmativa](../artifacts/affirmative-eligibility-regression-2026-10-23.json).
- [Publicação final da correção, 99 testes e cron](../artifacts/discovery-quality-eligibility-release-2026-10-23.json).
- [Captura final do contador diário: 0/5 e bloqueio da tentativa desconhecida](../artifacts/discovery-quality-final-2026-10-23.png).

**AUTOMAÇÃO AINDA NÃO VALIDADA: as correções reduziram resultados inadequados e foram executadas pelo backend real, mas não produziram nova candidatura confirmada. Não há recibo novo nem promessa de cinco envios quando faltam oportunidades elegíveis e submetíveis.**

## Viabilidade estrutural Gupy — 23/10, leitura às 14h47 Brasília

Conclusão detalhada e fontes oficiais: [RELATORIO-VIABILIDADE-AUTOMACAO.md](../RELATORIO-VIABILIDADE-AUTOMACAO.md).

A documentação da Gupy oferece captação externa e Candidatura Rápida mediante autorização empresarial, além de programa oficial de parceiros tecnológicos e feed para Job Boards aprovados. Não foi encontrada delegação oficial de candidaturas pelo login do candidato. Os termos atuais de R&S, de 01/07/2026, exigem acesso individual e intransferível e restringem candidaturas em nome de terceiros. A adoção comercial de uma sessão custodiada pelo Empregatos depende de esclarecimento/autorização do destino; não basta cifrar cookies ou obter consentimento no nosso produto.

Foi demonstrada somente a abertura real e anônima do login pelo `PortalBrowserService`, em Chromium local isolado, sem extensão ou importação pessoal. A tentativa de confirmar conexão sem autenticação foi recusada; nenhuma sessão foi salva. Sete POSTs da página foram bloqueados pela sondagem, sem examinar seu conteúdo; nenhuma operação de candidatura foi chamada. Autenticação, persistência autenticada, expiração, preenchimento e confirmação Gupy **não foram testados nem apresentados como PoC concluída**. [Resultado](../artifacts/gupy-managed-access-2026-10-23.json).

A leitura atual do banco confirma as mesmas três vagas compatíveis Gupy, sem candidatura, e nenhuma sessão Gupy na nuvem. Acervo de 476 publicações distintas, 146 recentes não conhecidas como encerradas, 33 com formulário observado: esses números não equivalem a oportunidades elegíveis e submetíveis. Coortes por família e limites da amostra estão no novo relatório. Filtros e política `official` foram preservados. A única tentativa Global TI continua desconhecida, recibo e `submittedAt` nulos; suporte pendente e bloqueio contra reenvio mantido. A consulta ao Gmail encontrou apenas os dois e-mails de acesso já conhecidos. [Estado atual](../artifacts/automation-viability-state-2026-10-23.json).

Produção permanece no deployment `dpl_3iMxZ3n2pYU1SRVRYTnu1vM47w3D`, health 200, cron habilitado para 24/10 às 08h Brasília. Nenhuma publicação, alteração de política ou antecipação do cron ocorreu nesta etapa. TypeScript aprovado; scripts de demonstração/leitura não são testes de candidatura. **Novas tentativas: 0. Novas confirmações: 0. Meta: 0/5.** Caminho de produto proposto: integrações com empresas parceiras e canais expressamente autorizados, com preparação e encaminhamento assistido nos demais, sem garantia universal de cinco candidaturas diárias. [Produção consultada](../artifacts/automation-viability-production-2026-10-23.json).

## Última validação dos formulários — 23/10, estado às 15h39 Brasília

O [relatório de viabilidade atualizado](../RELATORIO-VIABILIDADE-AUTOMACAO.md) contém a verificação final de Candidatura Rápida sem conta, a reavaliação dos 33 formulários e a classificação dos canais. Os três indícios de modalidade rápida encontrados no índice (wBrain .NET, Eldorado Conectividade e Panvel Mobile) estão encerrados na origem, com datas de 2025/junho de 2026. Nenhum é rápido aberto, recente e elegível. Pixeon, Víssimo e Bancorbrás continuam abertas e compatíveis, mas os links publicados levam ao login padrão.

Os 33 formulários observados são 32 Lever e a Global TI. Recálculo com os mesmos filtros: zero compatíveis para novo envio; exclusão principal de uma tentativa incerta, 24 exigências de senioridade, três afirmativas sem declaração específica e cinco pontuações insuficientes. Quatro formulários Lever tiveram acesso público HTTP 200 reconfirmado, sem dados ou arquivos carregados; suas exclusões profissionais permanecem e não foi executado preflight de envio. O melhor resultado é 60, abaixo de 70. [Recálculo completo](../artifacts/public-form-reassessment-2026-10-23.json), [páginas oficiais](../artifacts/final-public-channel-inspections-2026-10-23.json), [formulários](../artifacts/final-lever-form-inspections-2026-10-23.json).

Foi entregue [a especificação do piloto ATS](ESPECIFICACAO-PILOTO-ATS.md), com concessões reais, ingestão, envio, confirmação, revogação e deduplicação. Não há empresa participante, credencial concedida ou homologação; o piloto não foi iniciado. Nenhum adaptador novo foi implementado sem destino elegível autorizado.

O banco confirma **zero novas tentativas, zero novos recibos e 0/5 no dia**; Global TI mantém exatamente a tentativa desconhecida anterior. A reconciliação por Gmail só encontrou os dois e-mails de acesso conhecidos. Produção permaneceu no mesmo deployment, health 200, cron ativo e futura execução de 24/10 às 08h Brasília; nenhum deploy ou acionamento antecipado ocorreu. [Estado final](../artifacts/final-public-validation-2026-10-23.json), [produção](../artifacts/final-public-validation-production-2026-10-23.json), [reconciliação](../artifacts/final-public-validation-reconciliation-2026-10-23.json).
