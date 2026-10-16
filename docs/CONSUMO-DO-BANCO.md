# Consumo do banco

Em 16/10/2026, a API do projeto `curriculoautomatico-db` informou 6.511.083.890 bytes de transferência no período, 15.801 CU-segundos de processamento e 32.874.496 bytes de tamanho lógico. O limite gratuito excedido foi o de transferência, não o de espaço ou processamento.

## Correções

- `resume_files` guarda os originais criptografados por workspace e currículo. O estado do painel contém somente metadados, texto e análise. Downloads e envios consultam apenas o arquivo selecionado, com os dois identificadores.
- A migração `0008_resume_files.sql` copia arquivos antigos e remove as cópias do JSON dentro do próprio Postgres, sem transportar os arquivos pela aplicação. A transação e as chaves estrangeiras preservam consistência e exclusão por conta.
- `empregatos_schema_migrations` registra nome e checksum das migrações: reinícios consultam o registro, sem repetir as migrações. Não editar migrações aplicadas; criar outra. Checksums normalizam CRLF/LF.
- O painel verifica `/api/workspace/version` durante buscas e envios, lendo apenas `updated_at`. Só uma mudança dispara a atualização completa. Em repouso, o próximo acionamento acompanha o horário da busca diária; abas em segundo plano não mantêm polling periódico.
- Cobrança e conexões não possuem mais polling permanente. A cobrança reconcilia por até um minuto após o checkout; ações, mudanças de versão e retorno à janela atualizam os dados necessários.
- A cobrança projeta apenas candidaturas para compatibilidade com o histórico anterior ao ledger; conexões consultam somente os metadados de cada portal e o identificador do currículo. O worker lê somente a rotina ao reconciliar agendas.

## Regressões

`tests/database-egress.test.ts` usa o motor SQL real, um arquivo de 2 MiB e metadados grandes. Verifica que status, cobrança e metadados de portais retornam, juntos, menos de 10 KB em linhas SQL (sem incluir overhead do protocolo). Também valida migração de arquivos antigos, preservação do original em mutações, isolamento entre contas, limpeza e migrações não repetidas.

Medição da execução de 16/10/2026: status retornou 264 bytes, cobrança retornou 240 bytes e o conjunto, incluindo os dois metadados de portais consultados, retornou 642 bytes. É uma medição do cenário controlado, não uma projeção do consumo mensal de produção.

`tests/api.test.ts` valida download do original após remover a cópia temporária. `tests/automatic-submission.test.ts` verifica o conteúdo efetivamente entregue ao adaptador. `browser-tests/vercel-automation.spec.ts` verifica atualização por versão durante buscas, ausência de polling de cobrança/conexões em repouso e despertar na próxima busca diária.

Essas mudanças reduzem o desperdício. Não zeram o consumo já acumulado nem eliminam limites do provedor. A migração só pode executar quando o banco voltar a aceitar conexões. A escolha e migração para outro provedor ficam para uma etapa separada.
