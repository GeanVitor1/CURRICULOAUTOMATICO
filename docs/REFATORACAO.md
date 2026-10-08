# Entrega da refatoração — EmpreGatos

Data: 08/10/2026. O repositório existente foi mantido; não foi criado um projeto separado. A retomada incluiu as pendências da implementação anterior e os pedidos de novo nome, mascote no ícone da aba, didática e movimento na página pública.

## Produto e interface

- **EmpreGatos** substitui Órbita na marca, título da aba, páginas e mensagens novas. O mascote original é usado no favicon, marca, landing, acesso, guia e estados vazios. O SHA-256 do asset público é idêntico ao arquivo original.
- `/` apresenta a landing pública completa; `/login`, `/register` e `/app` mantêm acesso separado.
- Tema claro/escuro com tokens verdes, tipografia Manrope/Inter local e componentes compartilhados. Login/cadastro, dashboard, currículo, perfil, vagas, candidaturas, rotina, análises, notificações e configurações usam essa base visual.
- Onboarding progressivo, com revisão, etapas salvas e escolha opcional de uma fonte verificada para executar a primeira busca real. Se a pessoa deixa a fonte para depois, a ação se chama **Concluir configuração**: não promete uma pesquisa que não executou.
- Construtor de currículo com perguntas simples, formação, experiência informal e habilidades. Rascunho privado salvo na conta; PDF real, revisável e exportável. O documento começa sem aprovação automática.
- Guia de seis etapas depois da configuração, com instruções concretas sobre os botões e o significado das ações. Pode ser pausado, retomado após recarregar e reaberto no menu. Não exige concluir o tutorial para usar o produto.
- Configurações com navegação vertical: **Onde procurar**, **Análise do currículo**, **Meus dados**. Empresas verificadas têm setor, link oficial e explicação de cobertura; a ação **Adicionar e pesquisar** não exige digitar tokens ATS.

## Movimento

A página inicial tem entrada do hero, revelações ao rolar, sequenciamento visual de currículo → oportunidades → acompanhamento, reprodução opcional das etapas, transições com presença animada, indicador de leitura, menus que expandem a partir do seletor, troca de organização e feedback em CTAs. O mascote inteiro recebe apenas deslocamento discreto acompanhando o ponteiro; a imagem, expressão e anatomia não são modificadas.

Tabs de vagas possuem indicador compartilhado; cards, modais e estados de busca têm transições. Modais largos viram painel inferior em mobile. `prefers-reduced-motion` reduz/desativa movimentos, e a reprodução automática é opcional. Nenhum progresso de busca é inventado em porcentagens.

## Correções funcionais

1. Removidos cargos, tecnologias, modalidade e senioridade de desenvolvimento como padrões universais. O gerador de demonstrações foi removido e `demo=true` é rejeitado.
2. Acrescentados conectores reais Ashby, Jobicy e Adzuna opcional, preservando Greenhouse e Lever. Paginação, identificação de origem, URLs canônicas, salários desconhecidos, período salarial e elegibilidade geográfica são tratados explicitamente.
3. Criado catálogo central persistente de dados públicos, com cache, cooldown, leases e compartilhamento entre contas sem compartilhar seus perfis/análises.
4. Criada fila PostgreSQL persistente para buscas manuais, com marcador queued/running, coalescência por conta e recuperação limitada após interrupção. A rotina existente e o caminho Redis/BullMQ foram preservados.
5. Busca consultada no backend, deduplicada e persistida. Fonte com falha registra erro e não produz registros artificiais; outras fontes podem concluir. Ausência em snapshots completos ATS marca vagas como fechadas; isso não é aplicado à ausência numa janela parcial Jobicy.
6. Filtros e paginação de vagas são aplicados no servidor. A interface usa TanStack Query e atualiza a listagem quando a execução muda de estado. Salvar e abrir detalhes funcionam com itens fora do resumo do dashboard.
7. Corrigido cabeçalho JSON em solicitações sem corpo, que impedia iniciar busca pela interface. Corrigida a lista que mantinha zero resultados em cache mesmo depois de o backend concluir a consulta.
8. Recomendações do dashboard usam os mesmos filtros do backend. Dados insuficientes têm estado próprio; score não é probabilidade de contratação. Competências selecionadas, idioma citado e especializações explícitas não são ignorados.
9. Motor local inclui atendimento, varejo, administrativo, logística, saúde, educação, transporte e outras famílias. Escolaridade, registros profissionais, CNH e experiência informal recebem tratamento próprio. Alertas obrigatórios não são removidos pela IA.
10. Candidaturas assistidas e manuais preservam história e confirmação de envio. Uma vaga fechada não pode ser preparada/enviada automaticamente. Abrir o anúncio não marca envio; nenhuma candidatura externa foi realizada na validação.
11. Rascunho, currículo, preferências, guia, candidaturas e downloads são protegidos no backend por conta. Exportação inclui dados profissionais e preferências públicas da análise; exclusão remove dados e arquivos da conta.
12. Build garante React em produção mesmo com `.env` de desenvolvimento. Páginas carregam por demanda; dashboard recebe resumo e contagens, não a lista inteira de anúncios.

## Fontes reais verificadas

Os números abaixo são evidência técnica da consulta em 08/10/2026, não promessas de vagas compatíveis nem métricas de sucesso do produto.

| Conector | Organização/amostra | Resultado |
|---|---|---|
| Greenhouse | Cloudflare | 426 anúncios públicos |
| Greenhouse | Quince | 147; varejo/produção |
| Greenhouse | Unlock Health | 12; serviços de saúde |
| Greenhouse | Khan Academy | 7; educação; caminho completo até a interface validado |
| Greenhouse | SpaceX | 2.683; indústria/engenharia; localização/restrições nos anúncios |
| Lever | Lalamove | 181; logística; paginação validada |
| Ashby | Ashby | 68; compensação somente quando informada |
| Jobicy | Agregador remoto | 697 em sete páginas; frequência e país respeitados |
| Adzuna | Opcional | Sem validação autenticada: faltam credenciais e cobertura/licença confirmadas |

Um token histórico Warby Parker retornou HTTP 404; foi excluído do registro de empresas verificadas. A falha foi registrada, não substituída por vagas.

**Busca administrativa presencial:** zero resultados correspondentes na amostra consultada. A cobertura regional atual é limitada. **Busca .NET:** o conjunto externo ampliado continha 12 cargos com .NET/C#, sem júnior nessa amostra; a consulta filtrada pela API com apenas Lalamove/Cloudflare retornou zero. São conjuntos e filtros distintos, sem garantia de cobertura brasileira.

## IA: configuração e bloqueio real

A chave fornecida na retomada foi salva apenas em `.env`, ignorado pelo controle de versão. A varredura do frontend verifica que ela não está no bundle. O modelo preparado é `ling-3.1-flash-free`; a conta individual precisa consentir antes de analisar documentos externamente.

O catálogo Zen foi consultado de verdade. Entretanto, **Ling, LongCat e Muse Contributor retornaram HTTP 403**, com a mensagem de que o plano gratuito só pode ser usado dentro do OpenCode. A integração externa está implementada, mas **não foi possível validar uma análise autenticada funcional com esse plano**. A chave presente não implica acesso permitido a essa aplicação.

Não foi selecionado um modelo pago nem burlada a restrição. O sistema mostra esse erro e mantém extração/regras locais. Muse Contributor é listado no Zen com uso de prompts/respostas para treinamento e contrato `/responses`; o conector de currículo atual usa modelos compatíveis de chat. Não foi presumido MiniMax gratuito nem superioridade de um modelo que não pôde ser avaliado. Consulte [docs/AI.md](AI.md).

## Testes e evidências

- 86 testes unitários/de integração aprovados em sete arquivos: incluem contratos de conectores, falhas/429, cache, fila, deduplicação, profissões, filtros, licenças, JSON/citações, consentimento, concorrência, sessões, isolamento, PDF, exclusão e persistência.
- Três fluxos Playwright aprovados: landing/interações/rotas; onboarding/construtor/guia/temas/páginas; fonte oficial selecionada na UI → fila → sete anúncios reais → detalhes → salvar → recarregar.
- Larguras 1440, 1280, 768, 430 e 375 px verificadas. Cards reais e modais testados nas cinco larguras, filtros em painel mobile e navegação sem rolagem horizontal geral.
- Banco fechado/reaberto em processos separados: 183 vagas reais, origens, execuções e notificações preservadas. A fila enfileirada também sobreviveu e foi concluída pelo mesmo ID. A verificação usa banco dedicado, sem alterar contas reais.
- PDF sintético renderizado como PNG e inspecionado: uma página, acentos legíveis, experiência informal preservada, sem campos inventados.
- SHA-256 do mascote público e original iguais. Favicon/título verificados no navegador.
- TypeScript e build de produção aprovados. A chave configurada não foi encontrada nos arquivos frontend; `.env` está ignorado.

Evidências: `artifacts/connectors-live.json`, `workflow-live.json`, `persistence-before.json`, `persistence-after.json`, `queue-before.json`, `queue-after.json`, `zen-live.json`, `landing-*.png`, `dashboard-*.png`, `jobs-real-*.png`, `guide-welcome.png`, `guide-active.png`, `settings-zen.png`, `mobile-filters.png`, `resume-qa.pdf` e `resume-qa-1.png`. O PDF é uma fixture explicitamente sintética de QA, não o documento de um usuário.

## Arquivos alterados/criados

| Área | Arquivos principais |
|---|---|
| Marca e design | `index.html`, `public/mascot-original.jpeg`, `src/styles.css`, `src/landing.css`, `src/product.css`, `src/Landing.tsx`, `src/components.tsx` |
| Fluxos/frontend | `src/App.tsx`, `src/lib.tsx`, `src/main.tsx`, `src/Dashboard.tsx`, `src/Onboarding.tsx`, `src/GuidedTour.tsx`, `src/ResumeBuilder.tsx`, `src/JobForms.tsx` |
| Páginas | `src/pages/Settings.tsx`, `Jobs.tsx`, `Resume.tsx`, `Profile.tsx`, `Automation.tsx`; demais telas herdam os componentes/tokens comuns |
| API/documentos | `server/app.ts`, `server/workspace.ts`, `server/resume-pdf.ts`, `shared/types.ts`, `server/validation.ts`; `server/demo.ts` removido |
| Busca e persistência | `server/connectors.ts`, `server/operations.ts`, `server/source-catalog.ts`, `server/source-registry.ts`, `server/discovery-queue.ts`, `server/schema.ts`, `server/index.ts`, `server/worker.ts`, migrations `0003`, `0004`, `0005` |
| IA | `server/intelligence.ts`, `server/engine.ts`, `scripts/verify-zen.ts`, `scripts/compare-zen.ts` |
| QA/execução | `tests/api.test.ts`, `tests/catalog.test.ts`, `tests/connectors.test.ts`, `tests/refactor-api.test.ts`, `tests/universal-engine.test.ts`, `tests/zen.test.ts`, `browser-tests/workflow.spec.ts`, `browser-tests/real-source.spec.ts`, `scripts/build.mjs`, `verify-connectors.ts`, `verify-workflow.ts`, `verify-persistence.ts`, `verify-persistence.mjs`, `verify-resume.ts`, `verify-secrets.mjs` |
| Config/documentação | `package.json`, `package-lock.json`, `vite.config.ts`, `.env.example`, `.gitignore`, `.env` privado, `README.md`, `docs/API.md`, `AI.md`, `VALIDATION.md`, `REFATORACAO.md`, `connectors.md`, `api-audit.md` |

## Pendências e limites

A análise Zen autenticada depende de acesso que autorize a API fora do OpenCode. Adzuna depende de credenciais/licença. APIs públicas ATS não são buscadores globais; é preciso ampliar continuamente o catálogo regional, especialmente para comércio, primeiro emprego e funções administrativas no Brasil.

PostgreSQL servidor/Redis/BullMQ separados não foram validados com infraestrutura ativa nesta sessão. As coleções individuais continuam em JSONB e são limitadas a 2.000 vagas: a paginação é no servidor, mas o filtro ainda percorre a coleção. Escala pública maior requer tabelas/indexação SQL próprias, armazenamento privado compartilhado de arquivos, operação de backups e informações específicas do controlador de dados. OCR de PDFs escaneados não foi implementado; o erro informa a necessidade de texto selecionável.

Essas pendências não são declaradas concluídas. Instruções de execução e diagnóstico estão no [README](../README.md).
