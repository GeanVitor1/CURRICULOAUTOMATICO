# Auditoria de qualidade do produto — 9 de outubro de 2026

Esta revisão parte do workspace existente, preserva as alterações anteriores e acrescenta correções verificadas de backend, interface, performance e ferramentas de QA. Os relatórios anteriores continuam disponíveis para consulta histórica. A revisão não certifica ausência de bugs nem capacidade para milhares de usuários simultâneos.

## Correções desta revisão

| Área               | Problema confirmado                                                                                     | Comportamento implementado                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Autenticação       | O cálculo síncrono da senha bloqueava outras tarefas do servidor                                        | `scrypt` assíncrono, mantendo formato e parâmetros dos hashes existentes; contas inexistentes também executam a derivação  |
| Autenticação       | Hash inválido podia provocar exceção; senha de exclusão sem limite adequado                             | Hash inválido falha de forma controlada; senha limitada a 128 caracteres antes do cálculo                                  |
| Fila               | Um worker substituído podia publicar anúncios antigos ou alterar o histórico de uma tarefa recuperada   | Propriedade da tarefa verificada sob bloqueio na transação; resultados e erros tardios de workers antigos são rejeitados   |
| APIs               | O workspace inteiro era carregado para verificar existência e novamente para atender a rota             | A verificação inicial consulta apenas o ID; relações entre vagas e candidaturas usam mapas                                 |
| IA                 | Apresentação podia converter experiência explicitamente negada em afirmação positiva                    | Evidências negadas, inclusive entre linhas, são recusadas antes de compor o texto                                          |
| Consultas públicas | O limite de tamanho só era aplicado depois de ler a resposta inteira                                    | Leitura em stream limitada a 3 MB; respostas excessivas ou com erro são canceladas                                         |
| Consultas públicas | HTTP 429 nos detalhes do LinkedIn permitia continuar consultando outros cargos                          | A busca interrompe as próximas consultas e preserva anúncios já obtidos                                                    |
| Produção           | Navegações, imagens e fontes consumiam a mesma cota de requisições das APIs                             | Recursos públicos ficam fora da cota; APIs e o limite específico de autenticação continuam protegidos                      |
| Cache              | Arquivos com hash não tinham cache persistente no navegador                                             | Cache imutável de um ano para assets com hash; HTML revalida e APIs continuam `no-store`                                   |
| Carregamento       | A página pública e a privacidade consultavam a sessão e podiam manter consultas privadas desnecessárias | Autenticação só consulta a sessão no acesso, cadastro ou app; o workspace só é consultado no app                           |
| Transferência      | Servidor entregava HTML/JS/CSS sem compressão                                                           | Build gera Brotli e gzip com bibliotecas nativas; servidor negocia formato e mantém fallback original, `Vary` e cache      |
| Navegação          | Menus mobile permitiam foco em conteúdo oculto e não fechavam com Escape                                | Menu privado controla foco, bloqueia o fundo e devolve foco ao botão; menu público fecha com Escape e clique externo       |
| Página pública     | Abas não tinham navegação por setas; a prévia de modalidade perdia foco                                 | Abas oferecem setas/Home/End e foco único; modalidade fecha com Escape, seleção ou clique externo e restaura foco          |
| Formulários        | Cliques consecutivos podiam repetir autenticação, exclusão e confirmação                                | Guardas imediatas e estados ocupados evitam submissões simultâneas; campos ficam protegidos durante salvamento             |
| Currículo          | Tipo, tamanho e arquivo vazio só geravam falha após tentativa de envio                                  | Validação local informa o problema antes de enviar o arquivo; API mantém suas próprias validações                          |
| Vagas              | A escolha de currículo de uma vaga permanecia ao abrir outra                                            | Cada detalhe reinicia a seleção; buscas durante digitação são agrupadas e filtros recebem validação                        |
| Recuperação        | Falha de consulta dos sites ou de carregamento de módulo não oferecia continuação clara                 | Botões de nova tentativa, mensagens úteis e ErrorBoundary com recarregamento; pausa continua disponível                    |
| Sessão             | Resposta HTTP 401 com corpo não JSON perdia o status e não redirecionava                                | Status HTTP é preservado mesmo quando o corpo não é JSON                                                                   |
| UI/UX              | Inconsistência entre jornada, automação, conta, formulários e controles                                 | Tipografia, cartões, espaçamentos, estados de erro, alvos de toque e foco aprimorados, mantendo mascote e identidade verde |
| Ferramentas        | Scripts e testes E2E estavam fora da checagem de tipos                                                  | Typecheck inclui scripts, browser-tests e configuração Playwright; fixtures e scripts corrigidos                           |
| Diagnóstico        | Um script de provedor podia imprimir respostas de erro externas                                         | Diagnóstico registra status sem expor corpo externo potencialmente sensível                                                |

## Método e evidências

A revisão visual final também corrigiu as transições de entrada da capa para quem usa movimento reduzido: o conteúdo aparece imediatamente, além de usar uma imagem estática. O Tailwind passou a varrer somente `src`, evitando que HTML de testes, documentos e artefatos adicionem estilos e alterem o tamanho do CSS. A varredura foi verificada pelo compilador instalado: caiu de 167 para 31 arquivos, mantendo as fontes do frontend.

O baseline tinha 169 testes unitários/API aprovados e passou a navegação pública em cinco larguras. Novos testes demonstraram falhas de teclado antes das correções. A execução posterior do build de produção, em PGlite temporário e sem chaves de IA nem webhook de envio, revelou o bloqueio indevido de recursos estáticos pelo rate limiter. Esse achado foi corrigido no código, sem relaxar a proteção de login.

Foram usados dados sintéticos, bancos temporários e interceptações identificadas nos testes. Os adaptadores de envio são exercitados com formulários controlados; isso verifica a lógica, não comprova envio com contas reais. Testes de fontes públicas, quando executados, preservam a possibilidade de indisponibilidade e não inventam anúncios.

Evidências de desempenho e aparência:

- [Disponibilidade do event loop durante autenticação](../artifacts/product-auth-performance.json)
- [Medições do build de produção](../artifacts/product-performance.json)
- [Página pública no desktop](../artifacts/product-landing-1440.png)
- [Página pública no celular](../artifacts/product-landing-375.png)
- [Minha conta no desktop](../artifacts/audit-account-1440.png)
- [Minha conta em 320 px](../artifacts/audit-account-320.png)

O experimento de autenticação usou oito hashes em cada modo. O primeiro heartbeat ficou em **207,5 ms** com `scryptSync` e **0,8 ms** com derivação assíncrona. Trata-se de uma amostra local da disponibilidade do event loop, não de um benchmark de capacidade HTTP.

## Validação final

A suíte completa de navegador foi repetida contra o build definitivo de produção: **44 testes aprovados em 12 arquivos**, sem falhas. Ela cobre telas públicas/privadas, cadastro temporário, currículo PDF/DOCX, preferência persistida, fontes públicas, login público real sem autenticação e adaptadores com tráfego controlado. O banco da instância de auditoria é temporário e separado de `.data`. A suíte completa unitária/API também foi repetida depois dos ajustes finais, com todos os 190 testes aprovados.

| Verificação              | Resultado                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| TypeScript               | Aprovado, incluindo frontend, backend, scripts e testes de navegador                                |
| Build                    | Aprovado; frontend e servidor, com 40 variantes Brotli/gzip de 20 arquivos de texto                 |
| Testes unitários/API     | **190 testes em 19 arquivos aprovados**, incluindo negociação real de compressão e limites HTTP     |
| Formatação               | Prettier aprovado nos arquivos de código/configuração modificados nesta revisão                     |
| Diferenças               | `git diff --check` aprovado; apenas avisos locais de conversão CRLF                                 |
| Dependências de produção | `npm audit --omit=dev` reportou **zero vulnerabilidades** na consulta desta sessão                  |
| Segredos no frontend     | 78 arquivos compilados verificados; nenhum segredo configurado encontrado; `.env` ignorado pelo Git |

Medições de frontend:

A auditoria de produção fez três pares de navegação com cache vazio e reutilizado, sem erros de JavaScript, console ou HTTP. O LCP mediano foi **440 ms** no primeiro carregamento e **348 ms** na navegação repetida, neste computador e nesta janela de observação. Os 11 recursos com hash passaram de **439.136 bytes transferidos para zero** na repetição; o total de recursos caiu de **673.154 para 600 bytes**.

| Arquivo principal |      Original |  Gzip servido | Brotli servido |
| ----------------- | ------------: | ------------: | -------------: |
| JavaScript        | 464.607 bytes | 148.452 bytes |  129.032 bytes |
| CSS               |  88.089 bytes |  16.873 bytes |   14.790 bytes |

O JavaScript principal transfere **72,2% menos bytes com Brotli**. Os testes HTTP verificaram as variantes, ausência de `Accept-Encoding`, `Vary`, política de cache e igualdade do conteúdo descompactado. Isso comprova redução de transferência; o bundle JavaScript não foi reduzido artificialmente nem foram removidas funcionalidades.

Para reproduzir:

```powershell
npm run typecheck
npm test
npm run build
# Com os servidores locais em execução:
npm run test:browser
# Também é possível apontar os testes para um build de produção isolado:
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3109'
npm run test:browser
# APP_ORIGIN do servidor precisa corresponder à origem acima.
npm run audit:production
```

O navegador integrado falhou ao conectar nesta sessão; a verificação visual foi executada com Chromium/Playwright local. A checagem estática usa TypeScript e Prettier; o projeto não possui uma configuração ESLint.

O servidor de produção temporário foi encerrado e `.data` foi preservado. A revisão automática de aprovação recusou a exclusão da pasta de QA e informou apenas bloqueio por política. Os dados sintéticos permanecem em `%TEMP%\empregatos-product-audit-4100c789522d446ca1001af66dd0aa7a`; a limpeza desse diretório é a única etapa local de encerramento pendente.

## Limites e pendências de lançamento

- Envio com contas reais e formulários atuais de LinkedIn, Gupy, InfoJobs e Glassdoor exige validação específica após conexão. Nenhuma candidatura real foi enviada nesta revisão.
- PostgreSQL e Redis separados, tolerância a falhas de infraestrutura e carga de milhares de usuários não foram verificados neste ambiente.
- Vagas e candidaturas continuam em JSONB por workspace, com o limite existente de 2.000 vagas. As melhorias de leitura reduzem trabalho repetido, mas não substituem tabelas e índices relacionais para escala maior.
- O cache de consultas públicas limita quantidade de entradas e duração; ainda não possui um orçamento global em bytes.
- Pagamentos reais continuam dependendo da configuração já documentada do projeto. Esta revisão não acrescenta checkout fictício.
- As medições de frontend são locais, sem limitação artificial de CPU/rede; não equivalem à experiência em celular com rede lenta.
- A validação visual e E2E usou Chromium no Windows, em larguras de 320 a 1440 px. Safari, Firefox e aparelhos físicos não foram exercitados.

Não foram adicionadas dependências, removidas funcionalidades nem modificados contratos de API ou regras de candidatura.
