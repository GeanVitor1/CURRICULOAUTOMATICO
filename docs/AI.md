# Gemini no EmpreGatos

## Respostas automáticas de candidatura

A pessoa pode autorizar uma vez o uso do currículo e das preferências para responder perguntas das vagas. A autorização registra explicitamente a regra de responder negativamente quando faltar informação, inclusive para parentesco e acessibilidade. Dados confirmados têm prioridade: uma necessidade de acessibilidade informada nunca é substituída por “não”. A origem da vaga vem do anúncio, e escolhas de formulário precisam corresponder a opções reais.

Nos formulários oficiais compatíveis, a preparação lê as perguntas, reaproveita respostas confirmadas, consulta o Gemini para respostas profissionais com evidências e aplica a regra negativa autorizada às demais. Falha da IA não impede esse último passo. Aceites jurídicos e formulários sem opção compatível ficam como exceção; outras candidaturas continuam. A regra não autoriza aceitar termos de terceiros.

O histórico distingue respostas preparadas de respostas efetivamente preenchidas. Registra texto, origem (perfil, IA, origem do anúncio ou regra negativa), currículo e destino. “Não” por ausência de informação é identificado como regra do usuário, não como fato extraído do currículo. Apenas recibo verificável confirma envio. A autorização pode ser revogada e respostas preparadas não são reaproveitadas para outro currículo ou destino.

A integração usa generateContent da API oficial, com a chave em header apenas no servidor. Configure GEMINI_API_KEY, GEMINI_MODEL e GEMINI_SEARCH_MODEL em .env. Ambos os modelos usam gemini-2.5-flash por padrão. Não há troca automática de modelo por erro de cota.

Cada conta autoriza e ativa a análise externa em Configurações. Contato, documentos pessoais e links pessoais são removidos antes da extração, das sugestões de cargos e da apresentação para candidatura. A extração e as sugestões usam evidência literal conferida no currículo. Se Gemini falhar, a leitura local continua disponível e o método é indicado na tela.

Meu currículo mostra os tipos de vaga sugeridos, a relação com sua experiência e os requisitos a conferir. A leitura distingue competências de programação de funções e usuários dos sistemas desenvolvidos. Repository Pattern não comprova reposição de mercadorias; consultas a vendedores ou perfis de recepção não comprovam essas profissões. A mesma verificação de contexto se aplica às citações de cargos do Gemini. Currículos com formação clínica não recebem cargos operacionais apenas por citar tarefas incidentais, e formação em andamento não sustenta habilitação concluída.

A confirmação dos cargos atualiza a busca. As versões existentes têm Analisar novamente. As sugestões antigas são revistas uma vez ao carregar a conta: cargos inválidos deixam de orientar a busca, e é solicitado confirmar as sugestões corrigidas. A aprovação do arquivo original é preservada. Uma candidatura recebe uma apresentação local com trechos do currículo, sem depender do Gemini; a apresentação pode ser atualizada pelo Gemini quando a pessoa autoriza. Falha, falta de consentimento ou cota não impedem a apresentação local.

A Gupy consulta a listagem pública usada pelo próprio portal, sem credenciais: `/api/job-search/jobs`. O LinkedIn consulta sua listagem pública e lê os requisitos de até 12 anúncios individuais. As respostas são validadas; links fora do domínio, anúncios com prazo encerrado e dados inválidos são descartados. São aceitos os links antigos `/jobs/ID` e novos `/job/TOKEN` da Gupy. O cache dura cinco minutos, com limite de 128 consultas distintas na memória de cada processo. Essa leitura depende do formato público atual do portal e não constitui integração autenticada ou garantia de cobertura completa.

Para InfoJobs/Indeed, e como alternativa a uma falha de consulta pública, a busca consulta Google Search por cargo, cidade e portal. Só aceita anúncios individuais cujo link corresponda a uma fonte citada pelo Gemini. Não tem acesso a anúncios privados nem garante todos os resultados do portal. Se nenhuma referência individual for verificável, o app informa isso e oferece uma busca direta no portal. Os anúncios têm disponibilidade desconhecida e precisam de conferência no original. As sugestões de pesquisa do Google aparecem em iframe isolado.

Gemini não oferece função própria de enviar currículos ao LinkedIn/InfoJobs/Indeed/Gupy. A candidatura é preparada para revisão e finalização no portal. O envio automático depende do adapter autorizado já existente, configurado pelo operador, com recibo real.

A API aceitou a chave e a análise com texto fictício funcionou nesta instalação. Os testes reais de busca de auxiliar administrativo em São Paulo no LinkedIn e InfoJobs não retornaram anúncios individuais verificáveis. Esse resultado não é apresentado como descoberta bem-sucedida. Modelos Gemini 3 testados responderam com erro de cota; o padrão continua no modelo 2.5 validado.

Documentação: [generateContent](https://ai.google.dev/api/generate-content), [Google Search](https://ai.google.dev/gemini-api/docs/google-search), [saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output), [termos](https://ai.google.dev/gemini-api/terms).
