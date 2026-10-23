# Continuação da rotina no mesmo dia

O ciclo de 22/10 enviou uma candidatura nova para a Solucionare e parou após 20 verificações. A cota persistente registrava dois usos (incluindo um envio anterior à limpeza), deixando três disponíveis. Não havia tarefa em execução quando o titular pediu a correção.

## Correções

- A rotina automática percorre o conjunto finito de vagas elegíveis em lotes de quatro. O orçamento manual de diagnóstico não encerra mais o ciclo após vinte verificações.
- URLs protegidas contra duplicação após uma limpeza não gastam verificações de destino.
- A continuação e a criação de novas tarefas consultam a cota persistente, além do histórico atual. Uma limpeza não cria saldo adicional.
- Uma resolução alternativa sem e-mail não apaga um canal de candidatura anteriormente validado. A validade do canal continua sendo conferida antes de enviar.
- O saldo exibido inclui os usos anteriores à limpeza, sem contabilizar tentativas incertas como candidaturas confirmadas.

O ciclo continua respeitando currículo e preferências aprovados. Não repete resultados incertos, não resolve CAPTCHA e não registra sucesso sem recibo. Quando não há vagas novas elegíveis para pesquisa ou o provedor recusa a consulta, a rotina precisa informar o impedimento real.

## Validação

Build e TypeScript aprovados. Testes cobrem continuação além da vigésima verificação, término do conjunto de vagas, cota persistente após limpeza, proteção contra duplicação e preservação do canal de e-mail. Os testes usam dados e destinos controlados. O resultado em produção deve ser registrado abaixo apenas após observação dos respectivos recibos.

A correção publicada também passou a priorizar vagas acima da compatibilidade mínima antes da diversificação por empresa. As consultas públicas usam concorrência limitada a dois destinos por lote; os testes verificaram que duas atualizações concorrentes preservam os resultados da conta. A coleta Abler foi ampliada de 24 para até 120 publicações correspondentes, mantendo o orçamento de tempo do worker e a validação do conteúdo do publicador.

Publicações observadas: `dpl_GzfWTfLKwpUQt9TJGkWhdzfyTi73` (continuação e cota), `dpl_9NVyJYwinVQW2VUE5hrEYybB5X9z` (prioridade e concorrência), `dpl_DdYgGY86md2fHX9FyXy6CmcXLtUz` (cobertura de coleta). A última terminou com estado Ready. A CLI perdeu temporariamente a autorização ao acompanhar essa última publicação; a consulta posterior confirmou sua conclusão, sem alterar permissões.

Às 16h16 de Brasília, a execução já havia atingido 44 verificações, superando o corte anterior de vinte. Duas novas candidaturas CI&T pararam no preflight por exigência de verificação humana, sem recibo e sem consumir a cota. Isso comprova a continuação da fila, mas não comprova mais envios concluídos.

## Resultado em produção

Verificação às 16h24 de Brasília: 68 vagas com pesquisa de destinos registrada; zero vagas elegíveis aguardando pesquisa e nenhuma tarefa de resolução em execução. A busca adicional `4ca93b29-e0b9-4b0c-b0d9-b758fad9e28d` terminou e adicionou 12 vagas novas. Quatro novas tentativas CI&T pararam antes do envio por verificação humana (Angular, .NET/Next.js, .NET Senior e Senior Angular). Não consumiram cota nem receberam recibo.

O histórico novo continua com um único envio confirmado: Solucionare, às 12h51. A cota persistente continua com dois usos, incluindo o envio anterior à limpeza; três ainda disponíveis. **A meta de cinco não foi atingida nesta entrega.** As correções passaram a percorrer as alternativas disponíveis, mas as integrações atuais não conseguiram concluir os formulários restantes. Não houve alteração de preferências para forçar pontuação, duplicação de envios antigos ou preenchimento artificial do contador.

Diagnósticos: `artifacts/cycle-before-continuation-2026-10-22.json`, `artifacts/cycle-after-continuation-2026-10-22.json`. Uma sondagem local adicional da Abler com janela de 30 dias também não identificou outro anúncio que simultaneamente atingisse a pontuação mínima e os demais filtros. Essa sondagem foi somente de leitura e não alterou as preferências nem enviou candidaturas.
