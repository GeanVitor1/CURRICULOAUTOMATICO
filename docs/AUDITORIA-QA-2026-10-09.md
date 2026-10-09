# Auditoria de backend, frontend e experiência de uso

Data: 9 de outubro de 2026. Revisão do estado atual do workspace, incluindo alterações locais existentes.

**Atualização:** os oito defeitos abaixo foram corrigidos na revisão seguinte, junto com quinze problemas adicionais. Leia [Correções e validação](CORRECOES-QA-2026-10-09.md). Este documento preserva as evidências do diagnóstico inicial; os scripts de auditoria agora verificam o comportamento corrigido.

## Resultado

Foram confirmados **8 defeitos**: 4 de prioridade alta, 3 de prioridade média e 1 de prioridade baixa. A aplicação compila e os testes existentes executados passam, mas não cobrem os casos abaixo.

| ID | Prioridade | Defeito |
| --- | --- | --- |
| QA-01 | Alta — P1 | Vagas diferentes sem URL sobrescrevem o mesmo registro |
| QA-04 | Alta — P1 | Trocar currículo mantém rotina ativa e esconde o botão de pausa |
| QA-05 | Alta — P1 | Confirmar um novo currículo mantém experiência e senioridade antigas |
| QA-07 | Alta — P1 | Interface permite autorizar IA, mas não revogar a autorização |
| QA-02 | Média — P2 | Filtros aceitam salário máximo inferior ao mínimo |
| QA-03 | Média — P2 | Cards de vagas perdem o status da candidatura existente |
| QA-06 | Média — P2 | Limite de vagas paralisa novas inserções e pode interromper atualizações |
| QA-08 | Baixa — P3 | Clicar no texto de um campo não direciona o foco para a entrada |

## Evidências e correções recomendadas

### QA-01 — Deduplicação corrompe vagas sem URL

Local: `server/operations.ts:131`, na função `mergeJobs`; entrada aceita em `server/validation.ts:5`.

Reprodução: importar uma vaga de Auxiliar administrativo da Empresa A com `url: ""`; depois importar Operador de caixa da Empresa B, também sem URL. Os dois POSTs retornam sucesso, mas sobra apenas um registro: ele conserva o ID da primeira vaga e recebe cargo e empresa da segunda. O ID retornado pelo segundo POST não corresponde ao registro armazenado.

Causa: `old.url === j.url` considera duas strings vazias como a mesma oportunidade. `Object.assign` sobrescreve os dados do registro encontrado. Uma candidatura ligada ao primeiro ID pode passar a exibir outro cargo/empresa.

Correção: comparar URLs somente quando ambos os valores forem não vazios; manter a deduplicação por identidade efetiva e devolver o registro realmente persistido.

### QA-04 — Rotina ativa desaparece da tela após substituir currículo

Locais: `server/app.ts:1047` e `src/SimpleAutomation.tsx:15`, `:54`, `:113`.

Reprodução: partir de entrevista concluída com rotina automática ativa e enviar outro DOCX. O backend mantém `routine.enabled: true`, `mode: "automatic"` e a próxima execução; a entrevista continua apontando para o currículo antigo. Na tela Automação, aparece “Vamos conhecer suas preferências” e há **zero botões Pausar**.

O upload invalida a confirmação do perfil, o que bloqueia candidaturas pelos critérios atuais. A evidência não demonstra envio indevido. O defeito é a rotina continuar habilitada e programada enquanto a interface esconde seu estado e o controle para interrompê-la.

Correção: pausar e sincronizar o agendamento quando um novo currículo exigir revisão; exibir o estado real da rotina e oferecer pausa independentemente da conclusão da entrevista.

Evidência visual: [Automação sem botão de pausa](../artifacts/qa-04-automation-375.png).

### QA-05 — Perfil confirmado mistura dados de currículos diferentes

Local: `server/career-interview.ts:76–90`; atualização parcial durante upload em `server/app.ts:1063–1074`.

Reprodução controlada: perfil anterior com 12 anos, nível Sênior e experiência em outra área; novo currículo com sugestão de 0 anos, nível Júnior e experiência vazia. Concluir a entrevista retorna HTTP 200 e deixa o perfil **confirmado com 12 anos, Sênior e a experiência antiga**.

Causa: a entrevista não copia `years` e `level`; os campos copiados só substituem valores anteriores se o novo valor for verdadeiro. Assim, uma experiência vazia não limpa a anterior. A entrevista confirma o perfil resultante sem expor esses dados para revisão.

Correção: definir explicitamente quais dados vêm do currículo ativo e quais foram informados manualmente; reconstruir ou revisar os campos derivados ao trocar currículo, incluindo zero, vazio e desconhecido. Confirmar o conjunto efetivamente mostrado ao usuário.

### QA-07 — Autorização de IA não tem revogação acessível

Locais: `src/SimpleResume.tsx:31–38`, `:119`; `src/SimpleAccount.tsx`; `src/App.tsx:28–50`.

Reprodução visual com estado controlado: com IA habilitada e consentimento ativo, a tela Currículo não exibe o checkbox de autorização. Minha conta oferece exportação e exclusão, mas nenhum controle de IA. A antiga rota `#configuracoes` abre Minha conta. O código da antiga tela Settings continua no repositório, mas não integra as páginas acessíveis.

Causa: o consentimento do upload é salvo como configuração persistente; o checkbox só aparece quando a IA está desabilitada. A API permite desabilitar a análise, porém o usuário não consegue realizar essa operação pela interface atual. Próximos uploads e reanálises continuam usando a configuração salva.

Correção: mostrar o estado da análise externa e permitir desativá-la/revogar o consentimento em Currículo ou Minha conta; esclarecer que a autorização se aplica também a análises futuras.

Evidências visuais: [desktop](../artifacts/qa-07-ai-1440.png) e [mobile](../artifacts/qa-07-ai-375.png). Esta é uma falha de controle do produto; esta auditoria não faz avaliação jurídica.

### QA-02 — Faixa salarial inválida é persistida

Locais: `server/validation.ts:28–49`, `server/app.ts:625`; ajuste de mínimo em `src/pages/Jobs.tsx`.

Reprodução: PUT `/api/filters` com mínimo R$ 9.000 e máximo R$ 1.000 retorna **HTTP 200**. A entrevista valida essa relação, mas o endpoint de filtros não. Alterar apenas o mínimo pela tela de vagas pode preservar um máximo incompatível salvo anteriormente.

Correção: aplicar a mesma validação de intervalo no schema de filtros, considerando máximo zero como ausência de teto; exibir erro antes de persistir uma faixa inconsistente.

### QA-03 — Listagem informa “Descoberta” para uma vaga com candidatura

Locais: `server/app.ts:332–375`, `src/components.tsx:467`.

Reprodução: com candidatura existente, GET `/api/jobs/:id` inclui `application.status`, mas GET `/api/jobs` omite `application`. O card usa `job.application?.status` e, na ausência, informa “Descoberta” ou “Salva”. O detalhe consulta o workspace e encontra a candidatura, criando uma inconsistência entre os dois lugares.

Correção: incluir um resumo da candidatura na listagem paginada ou resolver o status no frontend por `jobId`. O botão do detalhe já impede duplicação com base no workspace; a falha confirmada está no status do card.

### QA-06 — Saturação de 2.000 vagas impede renovação e atualização

Local: `server/operations.ts:153`.

Reprodução: workspace com 2.000 vagas descartadas; `mergeJobs` recebe uma vaga nova e, depois, uma atualização de vaga existente. A vaga nova não entra. O `break` também impede processar a atualização seguinte.

O limite de 2.000 registros está documentado. O defeito é a ausência de renovação/aviso de saturação e a interrupção do processamento das atualizações restantes. Descartar uma vaga mantém o registro na coleção; excluir fontes também não libera essa capacidade.

Correção: continuar processando atualizações ao atingir o limite, informar a saturação e permitir liberar espaço ou arquivar registros, preservando as vagas relacionadas ao histórico de candidaturas.

### QA-08 — Texto do campo não funciona como label clicável

Local: `src/components.tsx:327–332`, componente `Field`.

Reprodução: na tela de login, clicar no texto “E-mail” não coloca o foco na entrada correspondente.

Causa: o texto é um `span`, associado por `aria-labelledby`. A associação dá nome acessível ao campo, mas não implementa o comportamento de foco de um `label` HTML.

Correção: usar `label` com `htmlFor` e um `id` correspondente na entrada; preservar a descrição auxiliar. O problema afeta os campos que usam esse componente.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm test` | 14 arquivos e 151 testes passaram |
| `npm run build` | Passou, frontend e servidor |
| Playwright: `workflow`, `simple-career`, `first-job-flow`, `developer-regression` | 4 testes passaram |
| Landing, larguras 375, 430, 768, 1280 e 1440 px | Verificações existentes de overflow passaram |
| `npx tsx scripts/audit-qa.ts` | 6 defeitos de backend reproduzidos em banco temporário |
| `npx tsx scripts/audit-ui.ts` | 3 verificações de interface reproduzidas; nenhuma exceção de página |

Os scripts de auditoria verificam a existência dos defeitos; seu sucesso **não significa que os defeitos foram corrigidos**. O script de interface usa respostas controladas para reproduzir os estados retornados/permitidos pelo backend. Não cria contas reais e não envia candidaturas. O script de backend bloqueia chamadas externas e remove seu banco temporário.

Evidências estruturadas: [backend](../artifacts/qa-audit-backend.json), [interface](../artifacts/qa-audit-ui.json). A conexão do navegador integrado falhou na ferramenta; as verificações visuais foram realizadas com Playwright local.

## Limites e entrega

Esta revisão não validou envio em contas reais de LinkedIn/Gupy/InfoJobs/Glassdoor, carga de produção, PostgreSQL e Redis separados, nem toda a suíte de testes de navegador. Os testes aprovados não certificam esses ambientes ou integrações.

As alterações anteriores do usuário foram preservadas. Foram adicionados este relatório, dois scripts de reprodução e suas evidências. Nenhuma correção foi aplicada à lógica do produto durante a auditoria. A ordem recomendada de correção é QA-01, QA-04, QA-05, QA-07 e depois os itens de prioridade média e baixa.
