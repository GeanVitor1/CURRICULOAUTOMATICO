# Automação: um envio automático confirmado em 22/10/2026

## Resultado final verificado

A busca geral `25d66dbd-5770-4fff-afc2-6cba09e728d4` descobriu 12 anúncios novos e preparou uma candidatura compatível sem seleção individual. O worker enviou o currículo aprovado para **Desenvolvedor (a) .Net Sênior — AllEasy**, publicado em **13/10/2026**, remoto, pontuação 77. A candidatura `9f9ff318-d3d4-44c6-a8e0-cec1fcbd4f56` ficou **Enviada** às **10h18min10s de Brasília**, com recibo `Formulário da empresa: candidatura foi enviada [resposta 583f8048644ed030]`.

Histórico observado: preparação pelo Sistema às 10h17min29s; início pelo Sistema às 10h17min58s; confirmação pelo Sistema às 10h18min10s. Não houve comando de preparar/enviar uma vaga individual na interface. A descoberta usou o índice público da empresa, e o adaptador nativo revalidou o formulário e transmitiu o arquivo pela fila de produção. A interface confirmou **Automático**, **Enviada** e contador **1 de 5 hoje**.

Evidências: `artifacts/automatic-receipt-confirmed-2026-10-22.png`, `artifacts/automatic-receipt-confirmed-2026-10-22.txt` e `artifacts/automatic-count-confirmed-2026-10-22.png`. Rotina segue ativa para 23/10 às 08h; esse disparo futuro ainda não foi observado. Os 14 dias e os demais filtros continuam preservados. Restam quatro envios para a meta de hoje; candidaturas com CAPTCHA, perguntas/consentimentos pendentes ou outros bloqueios não contam como envio.

## Retomada: integração Abler publicada, nova execução pendente de confirmação

O deployment `dpl_GLLEoy7cznxXF9BJE7oPBgYVn7Pk` terminou com estado **READY** e alias de produção `https://curriculoautomatico.vercel.app`. Inclui `ABLER_EMAIL_DISCOVERY_ENABLED=true`, descoberta pelo sitemap público da Abler e revalidação do endereço específico de candidatura exibido no anúncio. A data original da publicação continua obrigatória e limitada aos 14 dias configurados; `lastmod` do sitemap não substitui essa data.

A sondagem pública encontrou **Analista de Sistemas Sênior — Solucionare**, anúncio `https://candidatos.abler.com.br/vagas/analista-de-sistemas-senior-724236`, publicado em 21/10/2026, remoto, CLT, pontuação 90 na reprodução. O canal explicitamente publicado é `vaga-400246@vagas.abler.in`. Esse achado e a publicação do código **não comprovam uma candidatura enviada**. Nenhuma vaga foi inserida ou enviada individualmente nesta retomada.

Após a publicação, o acesso ao Chrome retornou `Local browser use is disabled in Work settings`, inclusive após o usuário informar que o habilitou e após reiniciar a ferramenta. A credencial administrativa local de cron não autenticou (401) e a identidade federada de desenvolvimento foi recusada pela condição do provedor. Não foram criadas sessões artificiais, alteradas permissões ou adicionadas rotas administrativas para contornar esses bloqueios. A próxima ação é iniciar **Buscar agora** na sessão autenticada e acompanhar a fila normal até um recibo real. O último resultado comprovado permanece **um envio automático hoje**, da AllEasy.

Verificação na retomada: **50 testes passaram** nos arquivos `abler-discovery`, `official-careers`, `antigravity` e `automatic-submission`; `tsc --noEmit` passou. O arquivo temporário de diagnóstico com variáveis de produção foi removido.

## Evidência anterior à correção

Conta real inspecionada em GET /api/workspace no Chrome autenticado. A busca iniciada em 22/10 às 09h14 de Brasília terminou, mas o contador permaneceu em zero candidaturas confirmadas no dia. O último ciclo não foi um sucesso de envio.

- As 20 verificações de destinos do dia consultaram anúncios da CI&T, todos no Lever. O limite de pesquisa acabou antes de diversificar empresas.
- Cinco candidaturas novas com formulário verificado foram preparadas pelo executor e pararam antes do envio por verificação humana. Destino encontrado não significa formulário disponível para envio sem intervenção.
- Outras candidaturas anteriores aguardam respostas/consentimentos específicos. Não devem ser consideradas enviadas nem repetidas de forma incerta.
- O histórico inclui envio assistido pelo Chrome e envios por e-mail provocados individualmente. Isso não comprova uma rotina agendada encontrando e concluindo uma nova candidatura sozinha.

## Falhas corrigidas nesta investigação

1. Seleção de pesquisa distribuída entre empresas, levando em conta as verificações anteriores do dia e preservando prioridade de um pedido explícito.
2. Compatibilidade recalculada a partir da descrição completa, incluindo tecnologias móveis e de dados antes omitidas. Tecnologias citadas no título entram na pontuação; competências genéricas como Git/API não devem sozinhas produzir aderência alta a uma especialidade diferente.
3. Mensagem de espera distingue verificação humana, perguntas/consentimentos pendentes e limite de pesquisa, em vez de resumir tudo como falta de destinos.
4. Busca separada por anúncios oficiais que pedem currículo por e-mail. URLs retornadas pela pesquisa são pistas, e o conteúdo do publicador continua obrigatório para validar a vaga e o destino.
5. Atualizações públicas das empresas com canal de e-mail já verificado, sem login ou dependência da pesquisa com IA. URLs diferentes do mesmo post LinkedIn são deduplicadas pelo identificador da publicação.
6. Descoberta de páginas oficiais com WP Jobs Board e adaptador multipart nativo. A fila revalida o formulário e envia o currículo original, sem conta ou navegador. Resultado ambíguo bloqueia repetição.

Reprodução com os dados públicos dos anúncios de produção e perfil sem identificação: Android/Kotlin passou de 78 para 29; iOS passou de 87 para 58; Azure/Databricks passou de 87 para 60. Nenhuma preferência foi relaxada.

## Limite desta entrega

As correções foram publicadas em produção, deployment `dpl_HMTLo6eZMviJNZq3jyXxsqPHFrn3`. O resultado comprova a descoberta e o envio pela fila para um formulário nativo de empresa, e não a entrega de cinco candidaturas ou funcionamento universal. As mudanças não removem CAPTCHA nem aprovam consentimentos, e não comprovam funcionamento de LinkedIn/Gupy.

Validação inicial: 125 testes passaram em seis arquivos de motor, pesquisa de destinos, ciclo, envio e regressão. A primeira execução paralela atingiu o limite de inicialização do banco de teste; execução sequencial passou. Nesta etapa, mais 66 testes passaram em seis arquivos, incluindo o novo formulário e atualizações das empresas. Verificação de tipos e build de produção passaram. O filtro de 14 dias e as demais preferências foram preservados.
