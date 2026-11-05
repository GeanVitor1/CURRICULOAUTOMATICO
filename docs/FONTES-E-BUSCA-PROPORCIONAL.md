# Fontes e busca proporcional — 29/10/2026

Publicado no domínio de produção `https://curriculoautomatico.vercel.app`, deployment `dpl_FufzewLTD5bZJabcU7RCPzP6eZhm`, com estado READY e compilação TypeScript, frontend, verificação de segredos e workers concluídas na Vercel. A aprovação da Chrome Web Store não é necessária para esta mudança no servidor.

## Fontes

- Global TI/Globalti está excluída da descoberta, do aprendizado de quadros e dos envios. Um domínio de ATS reconhecido e uma permissão antiga não reabrem essa fonte.
- O produto seleciona anúncios diretos de Gupy, LinkedIn, InfoJobs, Glassdoor, Indeed e plataformas de recrutamento reconhecidas pelo código (como Greenhouse, Lever, Ashby, SmartRecruiters, Quickin e Abler). Isso não garante legitimidade de cada anúncio: as verificações de publicação, empresa, data, compatibilidade e destino continuam necessárias.
- Agregadores genéricos e formulários em sites avulsos deixam de participar da automação. Jobicy, Adzuna e Jooble não são oferecidas para novas fontes. O servidor recusa seu cadastro como fontes de descoberta.
- Histórico, recibos e evidências de publicações antigas são preservados. Uma candidatura antiga de uma fonte retirada é bloqueada antes da transmissão; não é repetida para testar a mudança.
- A política é geral, sem IDs ou e-mails de um usuário particular.

## Orçamentos

O saldo considera o menor limite entre preferência e plano, o uso registrado no servidor, tentativas com resultado incerto e candidaturas já na fila. Um resultado incerto continua consumindo sua reserva e não é repetido.

| Situação | Nova descoberta |
| --- | --- |
| Cinco vagas disponíveis no saldo | Até 15 candidatos examinados no dia |
| Duas vagas restantes, sem orçamento anterior consumido | Até seis candidatos na rodada, dentro do teto diário |
| Fila já preenche o saldo ou há vagas aptas suficientes com canal disponível | Usar o conjunto existente antes de pesquisar |
| Cota utilizada ou orçamento de pesquisa esgotado | Não iniciar novas consultas externas de descoberta |
| Plano maior | Até três candidatos por vaga diária, com teto de 30 por rodada |

Cada rodada consulta no máximo seis fontes. O contador de descoberta é persistido por conta e dia de São Paulo; as continuações não o zeram. A Gupy recebe tamanho de consulta compatível com o orçamento. Quickin preserva página e posição ao interromper uma leitura.

A pesquisa de destinos é um orçamento separado, também limitado a três vagas pesquisadas por vaga diária. Para limite de cinco envios, são até 15 verificações de destino no dia. Uma verificação pode exigir mais de uma página para confirmar publicação e formulário. A configuração opcional `DESTINATION_RESEARCH_AUTOMATIC_DAILY_LIMIT` pode reduzir esse teto, mas não aumentá-lo além da proporção do plano.

Uma fonte pública pode fornecer um catálogo compartilhado por API. Seu total de registros não é a quantidade examinada para uma pessoa; a rotina limita a avaliação individual e informa anúncios examinados e preservados.

## Validação

136 testes distintos passaram nos arquivos de limite, seleção de fontes, execução da descoberta, paginação pública Gupy/Quickin, qualidade, ciclo automático, anúncios oficiais, roteamento e regressão Quickin. Incluem isolamento de 20 contextos simultâneos, cota consumida, plano anterior maior, orçamento entre continuações e bloqueio de uma candidatura antiga antes de qualquer transmissão. A interface teve compilação remota; nenhum navegador local ou componente nativo de captura foi iniciado para estes testes.

A verificação autenticada de produção recusou o cadastro de uma fonte Global TI com HTTP 400. A conta verificada retornou plano gratuito, limite diário cinco e saldo cinco. Nenhuma busca, candidatura ou transferência de sessão de portal foi iniciada por essa verificação. Evidência sanitizada: `artifacts/source-budget-production-2026-10-29.json`.

Esses testes validam o comportamento de seleção e custo, não comprovam envio ou recebimento de novas candidaturas. Conexão de portal e executor de candidaturas continuam sendo capacidades distintas; LinkedIn permanece com verificação local de login, sem envio automático.
