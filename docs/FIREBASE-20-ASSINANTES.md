# Plano gratuito do Firestore para 20 assinantes

Análise em 16/10/2026. Banco Standard, Spark, São Paulo. O objetivo é reduzir o
consumo sem diminuir os limites comerciais de 50/100 tentativas por dia.

## Limites e orçamento

O projeto inteiro compartilha 50.000 leituras/dia, 20.000 gravações/dia,
20.000 exclusões/dia, 1 GiB armazenado e 10 GiB de saída/mês.
As cotas são do projeto, incluindo usuários gratuitos e testes.
Fontes: [cotas](https://firebase.google.com/docs/firestore/quotas) e
[cobrança por documentos, índices e transferência](https://firebase.google.com/docs/firestore/pricing).

20 Essencial usando 50 tentativas por dia somam 30.000 tentativas em 30 dias.
20 Pro usando 100 por dia somam 60.000. Nesse segundo caso, os 10 GiB permitem
somente **174,8 KiB de transferência total do banco por tentativa**, antes de
considerar pesquisas, visitas ao painel, usuários gratuitos e outras operações.
Ler novamente um arquivo de 1 MiB em cada tentativa já ultrapassa esse orçamento.
Criptografia/base64 também aumenta os bytes; compressão não elimina esse custo.

## Economias implementadas

- Currículos, vagas e candidaturas são partes independentes do workspace.
  Partes idênticas reutilizam o manifesto existente. Uma mudança de status
  deixa intactos os blocos da análise e das vagas que não mudaram.
- Uma mutação sem alteração de dados não grava o workspace nem muda a revisão.
- Arquivos maiores que 8 KiB comprimidos ficam fora do documento principal.
  Assim, validar o manifesto não baixa novamente o original inteiro.
- Cache privado por processo: até 64 MiB de bytes comprimidos, por 10 minutos.
  A chave contém documento, versão e checksum; o manifesto é sempre consultado
  no banco. Arquivos só entram no cache de escrita depois do commit.
- Reinícios, expiração, despejo por memória e novas instâncias provocam novas
  leituras. **O cache não tem uma taxa de acerto garantida na Vercel.**
- A fila lê uma projeção pequena da próxima candidatura, sem carregar todo o
  currículo e as descrições. A checagem de envios interrompidos em cada mensagem
  consulta somente a conta daquela candidatura; o cron faz recuperação geral.
- Painel parado continua sem polling. Durante uma busca, consulta a revisão a
  cada 5 segundos; durante envios, a cada 15 segundos. Digitação no navegador
  remoto usa seu canal próprio e não depende desse intervalo do painel.
- Índices desativados para conteúdo comprimido, projeções e sessões de portal
  que não são usados em filtros. Originais permanecem criptografados.

Nenhum histórico de usuário foi apagado para economizar espaço. Registros de
quota e recibos de candidaturas continuam preservados para impedir duplicidades.
O formato anterior continua legível e é atualizado na próxima alteração real.

## Cenários de capacidade — não são consumo medido de produção

Reproduza com `npx tsx scripts/firestore-capacity.ts`.

Hipóteses: 20 usuários, 30 dias, 14 leituras e 6 gravações por tentativa,
24 KiB de tráfego não relacionado ao arquivo por tentativa, arquivo original de
200 KiB, fator de armazenamento/transferência do arquivo de 1,4 e 90% de acerto
no cache de arquivos. Cada pessoa acompanha o painel por 20 minutos/dia.
O modelo reserva quatro leituras por consulta autenticada de revisão e usa
15 segundos entre consultas durante envios.

| Cenário | Leituras/dia | Gravações/dia | Saída/mês |
|---|---:|---:|---:|
| 20 Essencial, 50 tentativas/dia | 20.400 | 6.000 | 1,49 GiB |
| 20 Pro, 100 tentativas/dia | 34.400 | 12.000 | 2,98 GiB |
| 20 Pro, arquivo 200 KiB, sem cache | 34.400* | 12.000 | 17,40 GiB |
| 20 Pro, arquivo 1 MiB, sem cache | 34.400* | 12.000 | 83,40 GiB |
| 20 Pro, portais lentos: 24 leituras/18 gravações por tentativa | 54.400 | 36.000 | 2,98 GiB* |

\* Modelos de sensibilidade que mantêm os demais parâmetros fixos: leituras de
blocos, tentativas de transação e tráfego extra de heartbeats podem elevar os
valores. Pesquisas públicas, navegação de vagas, downloads manuais, refreshes
completos, entrada de novos usuários e leituras de índices não estão incluídos;
precisam caber na margem restante. Os parâmetros são metas de operação, não
resultados de um teste de carga com 20 clientes reais.

**Conclusão:** 20 assinantes com uso moderado são uma meta viável para testar no
Spark. Não há base para prometer 20 Pro no uso máximo de todos os recursos sem
medir cache, tamanho dos históricos e duração dos portais. O tamanho do arquivo
e a frequência de leituras pesam mais que a quantidade de contas cadastradas.

## Armazenamento e operação

Para começar, recomendo uma política comercial de até três versões de currículo
por pessoa e arquivos preferencialmente abaixo de 300 KiB. Isso é uma proposta:
o código continua aceitando os limites existentes e não remove versões antigas.
20 contas guardando 20 arquivos de 5 MiB cada não cabem em 1 GiB, mesmo sem vagas.

Metas de alerta: 30.000 leituras/dia, 12.000 gravações/dia, 600 MiB armazenados
e 6 GiB de saída/mês. São metas para acompanhamento, não alertas automáticos já
configurados. Conferir o painel Usage do projeto diariamente nas primeiras
semanas e medir dias com filas completas; o contador oficial prevalece sobre o
modelo. Medir separadamente horas em que o painel fica aberto.

Se a transferência continuar alta, o próximo passo é manter o currículo uma vez
no navegador remoto privado do usuário ou em armazenamento privado apropriado,
para não baixá-lo do Firestore a cada envio. Isso requer uma implementação e
avaliação próprias; não está sendo contado como economia já entregue.

IA, navegador remoto, Vercel, filas e taxas de pagamento têm limites e custos
separados. Permanecer no Spark não torna toda a operação gratuita. Não foi
ativado billing/Blaze nem contratado outro serviço nesta otimização.
O [Hobby da Vercel](https://vercel.com/docs/plans/hobby) é destinado a uso pessoal
não comercial; receber assinaturas exige também uma hospedagem que permita uso
comercial. Esta análise não inclui contratar ou mudar o plano da hospedagem.

## Evidências de validação

- Teste real com análise de currículo de aproximadamente 1,5 MB: consultas de
  status/portal transferiram 398 bytes de metadados do workspace.
- Mudar o status de uma candidatura produziu uma gravação, sem regravar os
  blocos do currículo. Mutação sem alterações produziu zero gravações.
- Compatibilidade do formato anterior, arquivo de 5 MiB, cache privado,
  concorrência de quotas, fila e exclusão foram verificados em contas QA.
- Esses testes não fizeram candidaturas reais nem representam a fatura mensal.

Após workspaces serem gravados em partes, um rollback precisa manter o leitor
de `_sections`; versões anteriores à otimização não entendem esse formato.
