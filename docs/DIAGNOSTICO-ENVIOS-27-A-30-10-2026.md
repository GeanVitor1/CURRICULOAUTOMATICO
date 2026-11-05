# Por que não houve novos envios após 27/10/2026

Conferência somente de leitura feita em 30/10/2026, entre 15h14 e 15h19 de Brasília. Foram consultados o diagnóstico autenticado da conta e o workspace da mesma conta no Firestore. A credencial existente do Firebase CLI foi renovada por uma consulta de índices, sem alteração de índices ou permissões. Não foram alterados filtros, perfil, rotina, cotas, filas ou sessões, nem iniciadas candidaturas.

## Resultado

A rotina está habilitada em modo automático, com limite de cinco envios diários. O agendamento e os consumidores das filas executaram nos dias 28, 29 e 30. O estado operacional atual é `waiting`: nenhum novo envio passou por todos os critérios. A indicação de rotina ativada representa a configuração/autorização, não confirmação de que haja uma candidatura pronta ou em transmissão.

| Dia | Registros consultados na descoberta | Novos registros salvos | Envios automáticos confirmados |
| --- | ---: | ---: | ---: |
| 27/10 | 475 | 6 | 3 |
| 28/10 | 635 | 0 | 0 |
| 29/10 | 634 | 4 | 0 |
| 30/10 | 15 | 0 | 0 |

Os três envios confirmados de 27/10 pertencem a FCamara, Víssimo e Pixeon. Existem duas outras tentativas desse dia sem recibo confirmado; continuam como resultado desconhecido. O diagnóstico conserva quatro envios confirmados no total, contando um anterior em 22/10.

Nos dias 28 a 30 não houve consumo de cota de transmissão. Algumas tarefas de submissão podem concluir uma preparação sem iniciar o envio: isso ocorreu com Jobgether no dia 29, quando o formulário exigiu verificação humana. Conclusão de um callback de fila não é confirmação de recebimento de candidatura.

## Critérios que impediram novos envios

O perfil está confirmado, há currículo aprovado, as preferências estão concluídas e a conexão Gupy continua associada ao currículo escolhido. Não foi observada uma pendência geral de currículo/perfil que explique esses três dias sem envio.

A conta conserva 488 registros de vagas; 34 passam pelos filtros básicos atuais. A rotina exige também nota mínima de **70/100**, em `routine.minScore`. O filtro geral `filters.minScore` está em zero: são campos diferentes, e o corte da rotina continua sendo aplicado.

Quatro registros passam hoje pelo corte da rotina e pelos demais critérios de compatibilidade usados nesta conferência:

| Publicação | Nota atual | Impedimento |
| --- | ---: | --- |
| FCamara — Desenvolvedor Back .NET ESPECIALISTA | 92 | Envio já confirmado em 27/10; não repetir. |
| Pixeon — Analista Desenvolvedor(a) C#/.NET Pleno | 92 | Envio já confirmado em 27/10; não repetir. |
| Lanlink — Analista de Sistemas de Automação | 90 | Resultado desconhecido desde 27/10, sem recibo; não repetir automaticamente. |
| Jobgether — Desenvolvedor Back .NET ESPECIALISTA | 92 | Preparação de 29/10 recusada por exigência de verificação humana. |

Dos quatro registros novos de 29/10, os dois registros V.tal receberam nota 46 e o da CI&T/Databricks recebeu 22. Ficaram abaixo do corte 70. Jobgether recebeu 92, mas parou na verificação humana. Portanto os quatro novos registros não produziram uma nova transmissão.

Há seis candidaturas atualmente marcadas com bloqueio por verificação humana no histórico, duas com resultado desconhecido e uma tentativa antiga reconciliada como não recebida. Esses bloqueios são individuais; não impedem por si só que outra vaga apta seja enviada. Também não são prova de recebimento.

## Limitação de descoberta observada hoje

A implementação atual limita o total diário de anúncios examinados a três vezes a meta diária. Para cinco envios, o limite foi de 15 anúncios. Essa contagem inclui registros que depois são recusados pelos filtros. Em 30/10, só a Gupy apareceu na produtividade da rodada:

- Dez registros recusados por localização.
- Três recusados por preferências objetivas.
- Um associado a candidatura existente ou incerta.
- Um registro preservado após filtros antecipados, sem nova oportunidade salva e sem compatibilidade suficiente para um novo envio.

A rodada terminou com cinco vagas na cota de envio ainda livres. Isso demonstra uma amostra limitada; não demonstra inexistência de vagas compatíveis no mercado. A rotina de pesquisa de destinos também terminou suas tarefas sem um novo formulário liberado. O contador `researchBudget.used` estava em oito na conferência; não se deve interpretar a mensagem genérica de progresso como prova de que 15 pesquisas de destinos foram consumidas.

No dia 28 houve ainda erro parcial da busca InfoJobs/Antigravity: a busca não retornou fontes verificáveis. Os demais canais completaram a rodada. Não há nos registros examinados evidência de que esgotamento da cota diária de transmissão tenha causado a ausência de envios após o dia 27.

A última busca agendada de 30/10 foi concluída por volta de 08h10; a atualização final do estado de espera foi às 08h15. Próximo agendamento salvo: **31/10 às 08h de Brasília**.

## Evidências e limites

Arquivos locais ignorados pelo Git: `.data/why-no-submissions-2026-10-27.json`, `.data/why-no-submissions-2026-10-28.json`, `.data/why-no-submissions-2026-10-29.json`, `.data/why-no-submissions-2026-10-30.json` e `.data/why-no-submissions-workspace.json`.

Os relatórios diários usam execuções/tarefas e datas de tentativas persistidas. O workspace e a compatibilidade recalculada refletem o estado atual da conta; não são snapshots completos dos filtros e notas de cada dia histórico. Os resultados desconhecidos não foram reconciliados com os portais nesta consulta.
