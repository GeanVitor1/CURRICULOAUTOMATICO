# Auditoria de integração da API — 08/10/2026

Esta auditoria parcial foi feita antes da retomada final: **79 testes passaram em sete arquivos** naquele momento. A suíte final tem 86 testes aprovados e três fluxos de navegador; consulte [REFATORACAO.md](REFATORACAO.md). A verificação HTTP com serviços reais foi executada separadamente, sem mocks, sem consultar Jobicy novamente e sem realizar candidaturas.

## Evidência do fluxo real

`scripts/verify-workflow.ts` criou duas contas temporárias em um runtime estável, selecionou Lalamove e Cloudflare a partir do registro autenticado e iniciou a descoberta pela API. Uma segunda chamada de descoberta devolveu o mesmo identificador da tarefa. O worker publicou 587 oportunidades após deduplicar os 607 registros públicos consultados. As respostas informaram 181 registros Lalamove em cache e 426 Cloudflare na consulta oficial. A paginação funcionou; a segunda conta manteve vagas, fontes e execuções vazias. As duas contas foram apagadas ao concluir. O relatório é `artifacts/workflow-live.json`.

A consulta exata Auxiliar administrativo + Presencial retornou zero. A consulta .NET com os filtros objetivos atuais também retornou zero nessa amostra de duas organizações, inclusive com filtro Júnior. A verificação anterior de conectores identificou 12 cargos com .NET/C# em um conjunto maior que incluía Jobicy, sem equivaler a recomendações filtradas no endpoint. A diferença entre amostra externa, filtro objetivo e recomendação individual deve permanecer explícita; nenhum resultado foi fabricado.

## Segurança e integridade revisadas

O registro e o catálogo exigem autenticação: a tentativa sem sessão retornou HTTP 401. As rotas mutativas mantêm verificação de origem e cabeçalho de solicitação. O workspace vem da identidade da sessão; não aceita um identificador de outro usuário no corpo da busca. A fila confere o workspace, a existência de fontes e a proibição de demonstrações em produção antes de registrar a tarefa. A segunda conta confirmou isolamento de conteúdo e configuração.

Os destinos de conexão ATS são fixos no servidor e recebem apenas identificadores validados, não URLs arbitrárias do cliente. Segredos Adzuna ficam em variáveis do servidor; mensagens de erro não incluem URLs com credenciais. A API pública Jobicy preserva sua atribuição, URLs e elegibilidade e não usa links comerciais cobrados. Mocks aparecem somente em testes; falhas não geram vagas nem confirmação de candidatura.

O catálogo central guarda dados públicos. Seus metadados não incluem os termos de busca Adzuna, currículos ou preferências pessoais. O endpoint de catálogo foi otimizado para selecionar metadados e contar vagas com `jsonb_array_length` no PostgreSQL, sem carregar todas as descrições para calcular números. O teste específico do catálogo e fila permaneceu aprovado após a mudança.

## Correções identificadas e incorporadas

A validação de board agora distingue o token ATS de um termo Adzuna com espaços. Vagas retiradas de snapshots ATS e marcadas `closed` são excluídas dos filtros e contagens de vagas ativas. O registro de organizações conserva Educação como categoria válida. As configurações vazias de país representam cobertura internacional a confirmar, sem presumir elegibilidade brasileira.

## Limites atuais

O esquema JSONB e os scans de compatibilidade por workspace continuam limitados a 2.000 registros pessoais. A API de resumo reduz a quantidade de vagas enviada à interface, mas ainda precisa ler e analisar o workspace; escala pública maior exige indexação de vagas e recomendações separadas. A fila usa PostgreSQL, uma reserva com renovação e concorrência conservadora; a configuração PostgreSQL/Redis para workers separados não foi validada com serviços disponíveis nesta execução. Adzuna depende de credenciais/cobertura/licença. Na retomada, uma chave Zen foi configurada, mas o teste autenticado respondeu HTTP 403 por restrição do plano gratuito ao uso dentro do OpenCode. Nenhuma análise externa concluída foi presumida.
