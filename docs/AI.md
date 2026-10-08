# Gemini no EmpreGatos

A integração usa generateContent da API oficial, com a chave em header apenas no servidor. Configure GEMINI_API_KEY, GEMINI_MODEL e GEMINI_SEARCH_MODEL em .env. Ambos os modelos usam gemini-2.5-flash por padrão. Não há troca automática de modelo por erro de cota.

Cada conta autoriza e ativa a análise externa em Configurações. Contato, documentos pessoais e links pessoais são removidos antes da extração, das sugestões de cargos e da apresentação para candidatura. A extração e as sugestões usam evidência literal conferida no currículo. Se Gemini falhar, a leitura local continua disponível e o método é indicado na tela.

Meu currículo mostra os tipos de vaga sugeridos, a relação com sua experiência e os requisitos a conferir. A confirmação dos cargos atualiza a busca. As versões existentes têm Analisar novamente. Uma candidatura usa o arquivo aprovado original e pode ter uma apresentação preparada pelo Gemini com trechos conferidos.

A busca consulta Google Search por cargo, cidade e portal. Só aceita anúncios individuais cujo link corresponda a uma fonte citada pelo Gemini. Não tem acesso a anúncios privados nem garante todos os resultados do portal. Se nenhuma referência individual for verificável, o app informa isso e oferece uma busca direta no portal. Os anúncios têm disponibilidade desconhecida e precisam de conferência no original. As sugestões de pesquisa do Google aparecem em iframe isolado.

Gemini não oferece função própria de enviar currículos ao LinkedIn/InfoJobs/Indeed/Gupy. A candidatura é preparada para revisão e finalização no portal. O envio automático depende do adapter autorizado já existente, configurado pelo operador, com recibo real.

A API aceitou a chave e a análise com texto fictício funcionou nesta instalação. Os testes reais de busca de auxiliar administrativo em São Paulo no LinkedIn e InfoJobs não retornaram anúncios individuais verificáveis. Esse resultado não é apresentado como descoberta bem-sucedida. Modelos Gemini 3 testados responderam com erro de cota; o padrão continua no modelo 2.5 validado.

Documentação: [generateContent](https://ai.google.dev/api/generate-content), [Google Search](https://ai.google.dev/gemini-api/docs/google-search), [saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output), [termos](https://ai.google.dev/gemini-api/terms).
