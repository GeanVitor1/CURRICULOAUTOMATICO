# QA de extensão e site — 29/10/2026

## Correções

- **Conta não reconhecida após login:** o conector consulta novamente a conta ao receber foco e oferece atualização explícita. O consentimento é limpo e a conta de destino continua visível. Retomar uma verificação não solicita permissões nem coleta dados sozinho.
- **Aba recarregada ou inexistente:** abrir novamente o mesmo endereço do conector apenas dá foco. O desaparecimento comprovado da aba permite uma única criação, sem tratar falhas desconhecidas como autorização para duplicá-la.
- **Espera indefinida:** a importação tem prazo de 75 segundos e apresenta uma mensagem de conferência quando o resultado não chega. Mensagens de progresso são avisos opcionais, sem tentativas repetidas que atrasem a operação principal.
- **Sucesso sem confirmação:** respostas de importação sem login autenticado e visualizador válido são rejeitadas. O LinkedIn só informa registro após receber a observação local válida da API. HTML de erro não aparece como erro técnico de JSON.
- **Operação repetida por canal interrompido:** tanto a importação quanto o registro local deixam de repetir a requisição quando o navegador não confirma seu resultado.
- **Portal perdido ao entrar no site:** a página preserva apenas destinos internos permitidos entre login e cadastro. A sessão da aba preserva o destino no retorno completo do Google. Destinos externos e parâmetros alheios são descartados.
- **Tela em branco por armazenamento bloqueado:** leitura e gravação de tema são opcionais. Login com e-mail continua conservando o portal pelo endereço mesmo sem armazenamento local ou de sessão.
- **Dados em cache da conta anterior:** a identidade é atualizada ao retornar à aba. Uma troca de titular remove consultas privadas anteriores; o workspace tem chave por usuário.

## Verificação

Regressões executam os arquivos reais `background.js`, `content.js` e `popup.js` em ambiente VM, com respostas e sessões sintéticas. A bateria dirigida tem 84 testes em oito arquivos; outros 34 testes em quatro arquivos cobrem domínios de sessão, observações locais, fontes permitidas e limites de descoberta. Todos passaram. O build remoto faz a checagem completa de tipos e valida os fluxos visuais com Playwright: cadastro até preferências, quatro retornos de portal, retorno simulado do Google, troca de conta, recuperação de 503, armazenamento bloqueado e interface do conector com APIs Chrome simuladas.

Os testes não usam sessões reais de portais, não enviam candidaturas e não comprovam que um portal aceitará uma sessão real. O LinkedIn continua sendo observado localmente, sem leitura de cookies ou tokens e sem executor de candidaturas. A extensão não foi publicada na Chrome Web Store nesta auditoria.

Os relatórios e capturas da validação remota ficam em `artifacts/`. A publicação só deve ocorrer após o relatório remoto indicar sucesso e a inspeção das capturas.

## Resultado publicado

Publicado em `https://curriculoautomatico.vercel.app` pelo deployment `dpl_ARJiDkDJFAnbR97meBGjAWw8dRWL`. O relatório visual passou, as capturas foram inspecionadas e login, cadastro, privacidade, saúde e relatório retornaram HTTP 200 no domínio canônico. Evidências: `artifacts/qa-extension-site-2026-10-29.json` e `artifacts/qa-production-2026-10-29.json`.

Os pacotes do domínio canônico foram baixados e verificados: desenvolvimento 2.0.9, canal de loja 2.0.9 sem `alarms`, e compatibilidade do ZIP antigo. Os 22 testes pertinentes ao empacotamento e à instalação também passaram após essa verificação; fazem parte dos 118 cenários já contados, sem duplicá-los na soma.

Os arquivos do projeto e da pasta existente `C:/Users/geand/Downloads/Extensao/empregatos-conexoes-chrome` foram atualizados, escrevendo o marcador local por último. Não houve reinício do Chrome nem leitura da sessão real. A versão carregada no runtime do Chrome não foi inspecionada. O atualizador da instalação de desenvolvimento aplica os arquivos quando o conector está fechado; isso não publica a extensão na loja nem atualiza cópias remotas de outras pessoas.
