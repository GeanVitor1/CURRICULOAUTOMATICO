# Fontes de vagas e validação de descoberta

As consultas externas acontecem no servidor. A IA interpreta dados; ela nunca fornece vagas. Não há fallback de oportunidade fictícia nos conectores. A falha de uma fonte gera erro persistido na execução e no cadastro da fonte, enquanto as outras podem concluir.

## Contratos implementados

| Fonte      | Documentação oficial                                                                                   | Escopo e comportamento                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse | [Job Board API](https://docs.greenhouse.io/job-board.html)                                             | Board configurado por organização, `content=true`, URL original e identificador por board. Não trata `updated_at` como data de publicação.                                                                                                                                                                     |
| Lever      | [Postings API](https://github.com/lever/postings-api)                                                  | Board por organização; paginação `skip`/`limit=100`, modalidade e compensação somente quando fornecidas.                                                                                                                                                                                                       |
| Ashby      | [Public Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)                  | Board por organização, `includeCompensation=true`, omite `isListed=false`, preserva localização/URL. Salário vem de componente Salary, separado de equity/bônus.                                                                                                                                               |
| Jobicy     | [API e uso permitido](https://jobicy.com/jobs-rss-feed)                                                | Feed remoto público com cursor; sincronização compartilhada no máximo uma vez por hora. Usa URL Jobicy canônica e atribuição. Nunca envia chave comercial nem gera cobranças de links diretos. `jobGeo` conserva elegibilidade, sem assumir Brasil.                                                            |
| Adzuna     | [Overview](https://developer.adzuna.com/overview) e [Search](https://developer.adzuna.com/docs/search) | Opcional: exige `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, país explícito e `ADZUNA_ALLOWED_COUNTRIES`. O operador deve confirmar cobertura e licença da conta. Não presume suporte a Brasil. Ignora salários previstos (`salary_is_predicted=1`). Janela máxima de 10 páginas de 50 resultados por busca configurada. |

Não existe envio automático de candidatura nesses cinco conectores. Abrir uma vaga não é confirmação de envio. A integração de envio autorizada existente continua exigindo contrato, idempotência e recibo verificável.

## Catálogo, limites e isolamento

`source_catalog` guarda somente vagas públicas e metadados de fontes. O cache de boards ATS dura 15 minutos; Jobicy e Adzuna, uma hora. Uma reserva transacional impede duplicar consultas entre workers; chamadas simultâneas no mesmo processo compartilham a promessa. Preferências, currículos, status salvos, candidaturas e pontuações ficam no workspace de cada pessoa. Os objetos retornados pelo cache são cópias independentes.

Adzuna contém um termo de busca configurado, não uma organização; seus metadados são excluídos da listagem pública do catálogo para não expor preferências de usuários. Identificadores de origem ATS incluem board. A deduplicação considera origem, URL e combinação de empresa/cargo/localização, preservando histórico e estados pessoais.

Timeout: 20 segundos por chamada. GETs podem receber uma retentativa após erro de rede/HTTP 5xx; Jobicy não faz retry imediato. HTTP 429 respeita `Retry-After` e persiste pausa. Falhas de boards geram pausa mínima de um minuto; Jobicy, uma hora. Não ocorre fallback silencioso para cache expirado após erro. Registros já salvos continuam sendo dados reais anteriores; o estado da última consulta informa a falha.

Os limites operacionais de paginação impedem execuções intermináveis. Lever/Jobicy rejeitam paginação excedida/circular; Adzuna tem janela limitada documentada. Greenhouse e Ashby retornam o board inteiro sem cortar arbitrariamente em 500 vagas. O workspace mantém o limite existente de 2.000 registros; o catálogo preserva a resposta completa. PostgreSQL + Redis/BullMQ são necessários para workers separados; a agenda local usa PostgreSQL embarcado persistente em um processo.

## Cobertura verificável

`server/source-registry.ts` oferece organizações verificadas, setor, referência pública, data e restrições de cobertura. Em 08/10/2026 foram verificadas Cloudflare, Lalamove, Ashby, Quince, Unlock Health, Khan Academy e SpaceX. Há logística, varejo/produção, serviços para saúde, educação e indústria além de tecnologia. Isso não representa cobertura completa de profissões ou cidades brasileiras. Cada anúncio exige revisão de requisitos geográficos, de autorização de trabalho e licenças profissionais.

O token histórico Warby Parker respondeu HTTP 404. A página oficial de carreiras hoje aponta para Oracle; ele não foi cadastrado como board Greenhouse válido. O caso evidencia por que identificadores históricos precisam de nova verificação.

## Evidências executáveis

A descoberta iniciada pela API entra em `discovery_tasks`, com registro `queued` no histórico do workspace. Um worker do servidor consulta a fila a cada 1,5 segundo, reclama uma tarefa com lock transacional e renova a reserva durante a paginação. Ao reiniciar, tarefas pendentes continuam na fila; tarefas interrompidas podem ser recuperadas depois de expirar a reserva de seis minutos, até uma recuperação. Erros definitivos ficam como `failed`, exigindo uma nova busca do usuário. As rotinas diárias mantêm o agendamento BullMQ/Redis quando configurado. O esquema de workspace JSONB e a concorrência conservadora servem à arquitetura atual; indexação individual de vagas e workers dimensionados continuam necessários para escala pública maior.

`npm run verify:connectors` consulta APIs reais e salva `artifacts/connectors-live.json`. Não repetir uma sincronização Jobicy antes de uma hora. A verificação realizada às 09:29 de São Paulo retornou 426 registros Greenhouse/Cloudflare, 181 Lever/Lalamove, 68 Ashby e 697 Jobicy. A busca exata por Auxiliar administrativo presencial resultou em zero nessa amostra. Foram identificados 12 cargos de desenvolvimento com .NET/C# nos requisitos; nenhum júnior nessa amostra. Os anúncios internacionais conservam as restrições geográficas. Os números são evidência pontual de teste, não métricas de produto.

`npx tsx scripts/verify-persistence.ts seed` usa exclusivamente `artifacts/persistence-test-db`, consulta Lalamove/Khan Academy e persiste registros, execuções e notificações. Depois de encerrar o processo, `npx tsx scripts/verify-persistence.ts verify` abre o banco em outro processo, compara origens e históricos e salva `artifacts/persistence-after.json`, sem fazer consulta externa nem candidatura.

Os testes `tests/connectors.test.ts` e `tests/catalog.test.ts` verificam contratos normalizados, URL/origem, elegibilidade, compensação, cursor, 429, JSON/registro inválido, restrições Adzuna, isolamento e coalescência. Mocks ficam apenas nessas suítes automatizadas. Testes reais e simulações são evidências distintas.

`queue-seed` e `queue-verify`, no mesmo script de persistência e executados em processos separados, verificam a recuperação de uma tarefa realmente enfileirada. Na validação realizada, a tarefa preservou seu identificador, concluiu após reiniciar o processo e manteve 183 vagas reais sem candidaturas. Os arquivos `artifacts/queue-before.json` e `artifacts/queue-after.json` registram essa evidência.
