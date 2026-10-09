# Correções da revisão ampliada de QA

Data: 9 de outubro de 2026. Revisão do workspace com as alterações locais existentes preservadas.

## Resultado

Os oito defeitos da auditoria inicial foram corrigidos. A revisão ampliada também corrigiu quinze problemas adicionais em persistência, automação, correspondência de vagas, privacidade e interface.

| ID | Problema corrigido | Comportamento atual |
| --- | --- | --- |
| QA-01 | Vagas sem URL sobrescreviam oportunidades diferentes | URL vazia não identifica duplicata; a importação retorna o ID efetivamente persistido |
| QA-02 | Filtros aceitavam salário máximo inferior ao mínimo | A API rejeita o intervalo; máximo zero continua significando ausência de teto |
| QA-03 | Cards omitiam a candidatura existente | A listagem paginada inclui a candidatura e seu status |
| QA-04 | Troca de currículo mantinha rotina ativa sem controle de pausa | Upload e criação de currículo pausam a rotina e removem o agendamento; estados legados ativos continuam oferecendo Pausar |
| QA-05 | Novo currículo mantinha experiência e senioridade antigas | Dados profissionais são reconstruídos a partir do documento selecionado, preservando zero, vazio e desconhecido |
| QA-06 | Capacidade de 2.000 vagas interrompia inserções e atualizações | Registros descartados/fechados sem candidatura nem marcação de salvo liberam espaço; atualizações continuam; saturação produz aviso |
| QA-07 | Consentimento da IA não podia ser revogado pela interface | Currículo e Minha conta permitem habilitar e desabilitar; revogação persiste `enabled: false` e `consent: false` |
| QA-08 | Textos dos campos não direcionavam o foco | `Field` usa label HTML associado à entrada e preserva a descrição acessível |
| QA-09 | Editar preferências incompletas substituía a seleção já confirmada | Rascunhos de edição são separados dos critérios ativos e persistem para continuação |
| QA-10 | Registro manual usava apenas as oito vagas do resumo; Adicionar não abria formulário | Modal pesquisa e pagina a coleção completa, independentemente dos filtros de busca, e oferece importação real |
| QA-11 | Limite diário convertia candidaturas ainda não tentadas em ação manual | O processamento interrompe os envios ao atingir a cota e mantém as demais candidaturas na fila |
| QA-12 | Buscas agendadas e manuais tinham caminhos concorrentes de execução | Ambas entram na fila persistente com a mesma reserva e renovação; chamadas repetidas não criam novas tarefas pendentes |
| QA-13 | Erros internos retornavam 400 e podiam expor mensagens de execução | Erros de solicitação recebem mensagens deliberadas; falhas internas retornam 500 com mensagem genérica |
| QA-14 | Cadastro podia persistir usuário sem criar seu workspace | Usuário e workspace são criados na mesma transação; falha de inicialização desfaz a conta |
| QA-15 | Competências técnicas negadas eram extraídas como qualificações | Extração local e validação de evidências de IA rejeitam qualificações negadas, incluindo frases quebradas entre linhas |
| QA-16 | Truncar nomes longos removia a extensão usada no envio nativo | O nome é limitado preservando `.pdf` ou `.docx` |
| QA-17 | Localização aceitava substrings e ignorava estados conflitantes | Cidade precisa corresponder ao componente da localização; estado explícito diferente é rejeitado |
| QA-18 | Sessão expirada no workspace deixava a interface autenticada presa em erro | HTTP 401 limpa o cache privado e volta ao login; erro no logout recebe feedback |
| QA-19 | Cargo, empresa e cidade iguais fundiam anúncios com URLs diferentes | URLs ou identidades de origem diferentes são preservadas; metadados textuais não substituem identidade publicada |
| QA-20 | Telefones sem pontuação escapavam da minimização antes da IA | Números brasileiros com DDD, inclusive prefixo 55 sem formatação, são removidos |
| QA-21 | Reanálise mantinha aprovação de currículo e rotina ativa | Currículo reanalisado perde aprovação; perfil ativo exige revisão e a rotina é pausada |
| QA-22 | Envio automático não reaplicava todos os critérios objetivos atuais | Preparação automática e envio verificam critérios atuais, confiança e currículo confirmado antes da chamada externa |
| QA-23 | Ativar perfil salvo podia mudar rotina ativa para envio automático | Aplicação do perfil pausa a rotina e remove seu agendamento; habilitação exige nova ativação |

## Implementação

As mudanças principais estão em `server/app.ts`, `server/operations.ts`, `server/career-interview.ts`, `server/resume-state.ts`, `server/errors.ts`, `server/engine.ts` e `server/intelligence.ts`.

A interface foi ajustada em `src/IntelligenceControl.tsx`, `src/SimpleResume.tsx`, `src/SimpleAccount.tsx`, `src/SimpleAutomation.tsx`, `src/CareerInterview.tsx`, `src/App.tsx`, `src/components.tsx` e `src/pages/Applications.tsx`. O formulário de importação só é carregado quando aberto para manter a tela de candidaturas leve.

Mensagens esperadas em validação foram identificadas como `RequestError`; mensagens de execução não são expostas ao cliente. O erro específico de limite diário permite distinguir uma cota temporária de uma candidatura que exige intervenção.

## Validação

- Suíte unitária: **169 testes em 15 arquivos**.
- Testes de navegador selecionados: **25 testes** em oito arquivos, incluindo adaptadores com tráfego simulado, conexão com campos e verificação, layout, consentimento, sessão e fluxo de candidatura.
- `npm run typecheck` e `npm run build`, incluindo checagem de tipos do servidor e frontend.
- `npm audit --omit=dev`: **zero vulnerabilidades reportadas** nas dependências de produção no momento da consulta. Isso não substitui revisão de segurança da aplicação.
- Scripts `audit-qa.ts` e `audit-ui.ts`: verificam agora as correções e geram evidências novas, mantendo as evidências originais da auditoria.

Os testes acrescentados são `tests/qa-regression.test.ts` e `browser-tests/qa-regression.spec.ts`. Eles cobrem corrupção de dados, rollback de cadastro, privacidade, filas, critérios, paginação de vagas para registro e comportamento da interface.

As primeiras execuções de navegador revelaram atraso na atualização visual do checkbox de IA, corrigido com estado imediato e restauração em caso de falha. As verificações de fluxo com a API também foram repetidas com o código estabilizado após recarregamentos do servidor de desenvolvimento.

Evidências após correções:

- [Backend](../artifacts/qa-fixed-backend.json)
- [Interface](../artifacts/qa-fixed-ui.json)
- [Auditoria de dependências](../artifacts/qa-dependency-audit.json)
- [Controle de IA no desktop](../artifacts/qa-fixed-ai-resume-1440.png)
- [Controle de IA no celular](../artifacts/qa-fixed-ai-resume-375.png)
- [Pausa disponível em estado legado](../artifacts/qa-fixed-pause-375.png)

## Comportamentos que precisam ser considerados

Enviar ou reanalisar um currículo pausa a rotina. A pessoa revisa e confirma o documento e depois ativa novamente a busca/preparação ou o envio. Análises externas já enviadas antes de revogar o consentimento não são canceladas retroativamente.

Ao atingir 2.000 vagas, apenas registros fechados/descartados sem candidatura e sem marcação de salvo podem ser removidos para receber resultados novos. Histórico de candidaturas e vagas salvas permanecem protegidos.

Esta revisão não validou envio de candidaturas em contas reais dos portais, nem operação com PostgreSQL e Redis separados ou testes de carga. Os adaptadores foram exercitados com tráfego simulado; os fluxos `developer-regression` e `simple-career` consultam anúncios públicos sem enviar candidaturas. A conexão do navegador integrado continuou indisponível, então a validação visual usou Playwright local.
