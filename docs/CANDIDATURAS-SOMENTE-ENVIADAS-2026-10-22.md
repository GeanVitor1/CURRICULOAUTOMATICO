# Candidaturas concluídas

Em 22/10/2026, o histórico de Candidaturas passou a exibir apenas registros com recibo não vazio e data de envio válida. A tela não tem criação manual, troca manual de status, filas de revisão ou pendências. A Automação usa o mesmo critério no contador e não exibe contador de pendentes. Tentativas internas continuam necessárias para execução, idempotência e diagnóstico; elas não são apresentadas como sucesso.

O motor não cria mais candidaturas assistidas para anúncios sem rota de envio. Ele continua pesquisando destinos e processando vagas compatíveis. Perguntas sem informação usam uma alternativa negativa; perguntas pessoais priorizam a opção de não informar. Informações já confirmadas não são substituídas. A IA recebe o currículo e preferências confirmadas e suas respostas continuam exigindo evidência literal.

Se um executor retorna uma pausa definitiva antes de submeter, com novas perguntas, o servidor prepara respostas e continua o formulário por até quatro rodadas adicionais. O fluxo respeita a autorização existente e não repete resultados desconhecidos. Perguntas repetidas sem progresso encerram a tentativa, permitindo continuar com outras vagas. Isso não contorna CAPTCHA, login ou aceites jurídicos sem autorização específica.

## Limpeza solicitada

O script `scripts/clear-owner-history.ts` usa as credenciais existentes do operador no Firebase CLI e exige um e-mail exato. Sem `--apply`, apenas inspeciona. A limpeza transacional remove vagas, candidaturas, buscas, avisos e tarefas de descoberta/resolução somente do espaço real desse titular. Recusa limpar um envio em execução. Preserva currículo, preferências, integrações e assinatura. Não cancela candidaturas já recebidas por empregadores.

Resultado verificado no banco: 479 vagas e 48 candidaturas removidas; zero vagas e zero candidaturas restantes. Respostas automáticas ativadas conforme pedido do titular. Permanecem apenas impressões unidirecionais de URLs já enviadas ou com tentativa iniciada, para evitar reaplicar às mesmas vagas após nova descoberta. Registros de uso da cota são mantidos para evitar zerar limites por uma limpeza de histórico.

Validação: testes de respostas automáticas, histórico confirmado, limpeza, envio automático, formulários Gupy, ciclo e fila de destinos; build de produção e TypeScript. Envios dos testes usam destinos controlados. Nenhuma nova candidatura a empregador foi enviada para testar esta mudança.

Publicação final: `dpl_CzMrbYQ1zziSSw2WR8c2dkG5xRgY`, no domínio `https://curriculoautomatico.vercel.app`. A conta autenticada mostrou zero anúncios encontrados e zero candidaturas enviadas; a rotina permaneceu ativa. Gemini habilitado e com consentimento confirmado no banco. O teste de navegador validou que uma tentativa em fila fica invisível e aparece sem recarregar somente depois de receber recibo e data. Evidência: `artifacts/confirmed-only-empty-production-2026-10-22.jpg`.
