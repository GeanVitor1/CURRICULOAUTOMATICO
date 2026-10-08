# Validação — 08/10/2026

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm run build` | Aprovado; React em produção; páginas em chunks separados |
| `npm test` | 86 testes, sete arquivos, aprovados |
| `npm run test:browser` | Três fluxos aprovados; não enviam candidaturas |
| Fonte real selecionada na interface | Khan Academy/Greenhouse: sete anúncios com URL e origem reais, fila concluída, detalhes e salvar/recarregar verificados |
| Desktop/notebook/tablet/mobile | 1440, 1280, 768, 430, 375 px; sem rolagem horizontal geral |
| Detalhes/filtros | Modais nas cinco larguras; filtros em painel inferior mobile |
| Guia didático | Aparece no primeiro uso após onboarding, pausa/retoma, continua após reload e conclusão persistida |
| Currículo PDF | Gerado, texto com acentos extraído, PNG renderizado e inspecionado |
| Mascote | Hash original/público idêntico; título e favicon no navegador verificados |
| Persistência | 183 anúncios reais, execuções/notificações/origens preservados ao reabrir banco em processo novo |
| Fila persistente | Tarefa queued preservada após encerrar processo e concluída com mesmo ID |
| Isolamento | Segunda conta não acessa currículo, rascunho, guia, candidaturas ou preferências da primeira |
| Zen | Catálogo acessível; análise autenticada recusada HTTP 403 pelo plano gratuito restrito ao OpenCode |
| Adzuna | Conector opcional implementado; acesso real pendente de credenciais/licença |

Greenhouse, Lever, Ashby e Jobicy foram consultados em APIs oficiais. Resultados e amostras estão em `artifacts/connectors-live.json`; o caminho HTTP completo em `artifacts/workflow-live.json`. A busca administrativa presencial e a consulta .NET filtrada na amostra de duas organizações retornaram zero, sem dados artificiais. Consulte as diferenças entre amostras no [relatório](REFATORACAO.md).

Falhas encontradas durante QA e corrigidas: Content-Type JSON enviado sem corpo; vagas não atualizadas após concluir busca; identificação acessível errada do primeiro botão numa seleção; estado de demo/tecnologia como padrão; períodos salariais/idiomas/especializações; recomendações fora dos filtros; fontes com país internacional vazio; construção com React em desenvolvimento. A rotina de persistência agora captura o estado atual antes de comparar após reinício, para não comparar uma execução nova com um snapshot histórico anterior ao teste da fila.

A conexão com o navegador integrado falhou no ambiente; a inspeção visual e os fluxos foram executados com o Chromium do Playwright do projeto. Capturas atuais estão em `artifacts/`. Capturas antigas `preview-*.png` não representam esta entrega.

PGlite foi validado em modo local. PostgreSQL/Redis separados não foram executados. A análise Zen não é apresentada como validada: o erro real do provedor está em `artifacts/zen-live.json`, com apenas texto sintético utilizado. Nenhuma chave é impressa nos diagnósticos.

```powershell
npm run dev
# Em outro terminal:
npm run test:browser
npm test
npm run build
node scripts/verify-secrets.mjs
```

Persistência independente, usando apenas o banco de evidência:

```powershell
# Só na primeira execução, consulta fontes reais no banco dedicado:
npx tsx scripts/verify-persistence.ts seed
# Captura/fecha/reabre/compara em processos separados, sem nova consulta externa:
npm run verify:persistence
```

## EmpreGatos e Gemini — 08/10/2026

Marca atualizada no app, landing, autenticação, título, mascote e exportação. Catálogo principal substituído por LinkedIn, InfoJobs, Indeed e Gupy, com buscas por cargo e cidade e links para pesquisa no próprio portal.

Gemini: chave aceita pelo Google; extração do currículo e sugestões de cargos verificadas no fluxo real da API com dados fictícios. O esquema enviado ao Google foi simplificado para evitar limite de complexidade; a validação Zod completa continua no servidor. Sugestões sem citações literais são descartadas. A preparação de apresentação mantém apenas trechos conferidos do currículo e não altera o status para enviada. O teste real de apresentação atingiu a cota do Gemini, e a proteção contra qualificações inventadas passou no teste isolado.

Busca real de teste no LinkedIn/InfoJobs: não houve anúncios individuais verificáveis. O app informa a limitação, não cria anúncios artificiais e oferece o portal diretamente. Não há integração de envio ao LinkedIn/InfoJobs; a pessoa conclui a candidatura no site.

Validação: TypeScript, build, 95 casos unitários/API e quatro cenários de navegador, incluindo o catálogo, os cargos confirmados e os layouts em computador e celular. Chave ausente dos 27 arquivos do frontend compilado; .env ignorado. As contas e os dados fictícios usados nos testes foram removidos ao final.
