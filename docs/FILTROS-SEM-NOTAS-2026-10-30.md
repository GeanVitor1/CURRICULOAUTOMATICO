# Busca por preferências e requisitos, sem notas

30/10/2026. Alteração solicitada pelo usuário após o diagnóstico dos envios de 27 a 30/10.

## Comportamento

- Modalidade e localização são condições da busca e da elegibilidade, sem pesos ou pontos.
- Consultas de remoto no Brasil são separadas de presencial/híbrido nas localidades escolhidas. Uma consulta sem resultados não amplia essas preferências.
- Gupy recebe `workplaceType` e, quando aplicável, a cidade; LinkedIn recebe `f_WT` e localização. As buscas públicas com IA e as de publicações oficiais recebem o mesmo escopo separado.
- Na Gupy, metadados de modalidade/localidade incompatíveis são descartados antes de consumir a cota de candidatos examinados. No LinkedIn, a lista já permite conferir a localidade; a modalidade é conferida novamente quando a descrição individual está disponível.
- Uma API sem filtro correspondente, ou que ignore o parâmetro, ainda exige validação da resposta. Isso não permite candidatar a vagas fora das preferências.
- Para remoto em qualquer cidade, a sede da empresa não limita a busca à cidade do candidato. A regra existente de território de contratação continua sendo verificada.

## Competências

Uma lista em “Requisitos e qualificações” não é uma conjunção obrigatória de todas as tecnologias citadas. Competências em comum e competências ainda não declaradas são apresentadas como informação, sem proporção de acertos, pontuação ou corte mínimo.

Exigências explicitamente obrigatórias continuam impedindo a candidatura quando não confirmadas. O leitor distingue seções obrigatórias, seções de diferenciais, negações e alternativas: “Java ou .NET” aceita uma das duas; “Java ou .NET e AWS obrigatórios” também exige AWS. Escolaridade e CNH explicitamente obrigatórias são verificadas, enquanto qualificações desejáveis não geram esse bloqueio.

Dados estruturados de obrigatoriedade anteriormente inferidos são relidos a partir da descrição publicada. Exigências inseridas manualmente continuam sendo respeitadas. Preferências de cargo/especialização e exigências que a própria pessoa escolheu também continuam valendo.

## Remoção da nota

Não há cálculo, ordenação ou decisão de envio baseada em `match.score`, `routine.minScore` ou `filters.minScore`. Os campos antigos permanecem apenas para compatibilidade de dados/clientes; a análise devolve `score: 0` e `criteria: []`. Uma conta com corte legado 70 ou 100 segue a política nova; a atualização normal das análises zera esses campos antigos.

Listagem, painel, cartões, detalhe, candidaturas, preferências e recuperação após reconciliação deixam de mostrar notas. As vagas são ordenadas por data. A explicação complementar por IA recebe instruções para não atribuir notas/percentuais; assinaturas versionadas invalidam explicações anteriores da política de pontuação.

## Proteções preservadas

Permanecem as verificações de dados e currículo aprovados, consentimentos, vagas/empresas excluídas, fonte e destino permitidos, disponibilidade da vaga, cotas, perguntas obrigatórias, bloqueios humanos, prevenção de duplicatas e resultados de envio desconhecidos. Retirar a nota não autoriza repetição de tentativa incerta nem elimina CAPTCHA.

## Evidência na conta

Simulação de leitura em 30/10/2026 às 19:08 UTC, com checagem de que o operador autenticado e o workspace observado pertencem à mesma conta. Nenhum workspace foi alterado e nenhuma candidatura foi transmitida.

Entre 400 vagas ativas/não descartadas, 4 passavam pelo corte anterior; 15 passam pelas preferências e requisitos da política nova. Dessas, 11 não têm tentativa protegida pelos critérios da simulação. Esses números não garantem envio: formulário, currículo, respostas, disponibilidade, cota e verificações do portal ainda precisam ser validados no fluxo normal. Os exemplos da V.tal e CI&T/.NET passam sem exigir todas as tecnologias mencionadas.

Evidência minimizada local: `.data/preference-policy-account-dry-run.json` (não publicada).

## Validação e publicação

- TypeScript e build completos aprovados, incluindo verificação de segredos no frontend.
- Resultado consolidado: 993 testes aprovados e 11 integrações Firestore desabilitadas por dependerem de ambiente específico. Sem falhas de casos ou inicialização de suites no resultado final.
- A primeira execução completa detectou expectativas antigas de pontuação e estouros de tempo no início do subprocesso PDF e na inicialização do teste de worker. As expectativas foram atualizadas para a política nova; os limites de tempo desses testes passaram a refletir a inicialização do processo. Os arquivos afetados foram executados novamente por inteiro, sem falhas. Consolidação por arquivo em `.data/preference-policy-consolidated.json`.
- Teste Playwright com dados fictícios, todas as APIs interceptadas: preferências visíveis, ordenação por data, ausência de notas, ação disponível com três competências em comum, modal acessível no computador/celular e nenhum POST de candidatura. Inspeção visual das capturas em `artifacts/preferences-no-score-{desktop,mobile}.png`.
- A recuperação Quickin foi validada com transporte de fila simulado e todas as requisições Chromium interceptadas, preservando concorrência, idempotência e o histórico original.

Publicado em [curriculoautomatico.vercel.app](https://curriculoautomatico.vercel.app), deployment `dpl_22AcB9AwJeidvu2x5dxCqagi3v1U`. Saúde e observador do endereço principal responderam HTTP 200 em 30/10 às 19:22 UTC, com revisão `80cd4ad7f8a5f918b0cb5a2764f538408e5baabe9216dea7bbd28e894e9664f3`, Node 26.13.0 e Undici 8.12.2.

Os 377 arquivos de código enviados foram comparados por SHA-1 com os arquivos locais validados, sem diferenças. Evidência em `.data/preference-candidate-source-verification.json`. O teste Playwright também passou no endereço principal depois da promoção, com todas as chamadas de API substituídas por respostas fictícias e sem transmissões reais.

O endereço temporário de validação exigia autenticação Vercel; sua proteção foi preservada. A saúde foi consultada pelo CLI autenticado, e a verificação visual remota foi concluída no domínio principal após a promoção.
