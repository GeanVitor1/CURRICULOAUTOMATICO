# Relatório de envio automático de candidaturas — 26/10/2026

Emitido às 11h44 de Brasília. Base: observação de produção registrada em 26/10 às 07h12, execuções persistidas de 24 e 25/10 e reconciliação oficial da Global TI.

## Resultado

A busca agendada e a resolução de destinos funcionaram nas duas execuções observadas. O envio automático completo a empregadores continua sem validação nessas execuções: nenhuma preparação, tentativa ou confirmação nova. A meta foi 0/5 em cada dia.

| Indicador | 24/10 | 25/10 |
|---|---:|---:|
| Início da execução, Brasília | 08h09 | 08h09 |
| Registros examinados, incluindo releituras | 480 | 479 |
| Registros preservados após filtros antecipados | 13 | 13 |
| Vagas novas | 2 | 0 |
| Vagas compatíveis reobservadas | 3 | 3 |
| Novos canais de envio liberados | 0 | 0 |
| Preparações / tentativas / recibos novos | 0 / 0 / 0 | 0 / 0 / 0 |
| Tarefas de resolução concluídas | 4 | 5 |
| Meta de candidaturas confirmadas | 0/5 | 0/5 |

Os 959 registros consultados não representam 959 vagas novas distintas. Em 25/10, a execução ficou parcial porque LinkedIn/Antigravity não retornou fontes verificáveis; descoberta e resolução tiveram processamento persistido.

## Impedimentos observados

As três vagas compatíveis reobservadas estavam na Gupy, sem canal independente liberado no indicador de fonte. As duas novas vagas de 24/10 ficaram abaixo do mínimo de 70 pontos: FCamara, Full Stack Java/React, 42; CI&T, Node.js Full Stack Developer, 39. Identificar formulário não comprova elegibilidade nem aprovação do preflight.

Preferências registradas: meta diária de cinco, mínimo de 70 pontos, publicação conhecida nos últimos 14 dias, remoto ou presencial em Ilhéus, CLT/PJ e destinos oficiais. Não houve relaxamento de filtros na observação usada como base.

## Global TI

A empresa respondeu oficialmente em 23/10 às 16h18 de Brasília que a candidatura IMW7499 não foi recebida. A reconciliação documental passou a ser **confirmadamente não recebida**. O registro técnico foi preservado com resultado desconhecido, tentativa única e sem recibo. Não houve reenvio. Essa divergência entre evidência externa e estado interno precisa ser reconciliada antes de eventual nova tentativa, com revalidação da vaga e das condições de envio.

## Situação de 26/10 e limites

Na leitura anterior às 08h de 26/10, a rotina estava habilitada e previa execução às 08h. Essa leitura não permite afirmar se a execução de hoje ocorreu nem qual foi seu resultado.

A nova consulta de produção feita para este relatório falhou porque a credencial Firebase CLI estava expirada ou inválida. Portanto, os números acima são os últimos comprovados disponíveis no projeto; não são uma fotografia atualizada às 11h44. Não foi disparada busca, candidatura ou alteração de produção para produzir este relatório.

Os logs HTTP e IDs históricos de mensagens de 24–25/10 não foram recuperados por limites de retenção/observabilidade. A persistência comprova origem agendada, descoberta e resolução; não comprova o rastreio completo de transporte nem submissão com recibo.

## Próximas verificações necessárias

1. Restabelecer a credencial de leitura e consultar a execução de 26/10, tentativas, recibos e consumo de cota.
2. Reconciliar a resposta oficial da Global TI com o estado interno antes de considerar nova tentativa.
3. Validar um destino novo que passe pelos filtros, possua executor disponível e produza recibo real vinculado à rotina. Testes controlados já registrados não substituem essa evidência.

## Evidências locais

- [Resumo da observação](../artifacts/scheduled-automation-summary-2026-10-26.json).
- [Estado persistido e tarefas](../artifacts/scheduled-automation-observation-2026-10-26.json).
- [Reconciliação oficial Global TI](../artifacts/globalti-official-reconciliation-2026-10-26.json).
- [Investigação e cronologia detalhadas](DESTINOS-SUBMETIVEIS-2026-10-23.md).
