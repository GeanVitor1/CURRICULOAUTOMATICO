# Diagnóstico de candidaturas automáticas — 20/10/2026

Inspeção somente de leitura na produção, pelo Chrome conectado à conta do usuário, e revisão do código local. Nenhuma candidatura enviada e nenhuma configuração alterada nesta auditoria.

## Estado confirmado na produção

- Curriculo.pdf aprovado; perfil confirmado; dados básicos completos.
- Entrevista incompleta, etapa interna 4: interface na pergunta 5 de 6, seleção de sites LinkedIn e Gupy.
- Rotina desativada, modo discovery, limite 5/dia, nota mínima 80, horário 08:00; lastRun e nextRun nulos; histórico de buscas vazio nesta conta.
- Infraestrutura informa Cloud Firestore, Vercel Queues, worker disponível e janela diária entre 8h e 9h de Brasília. Isso informa configuração, sem comprovar uma execução atual de ponta a ponta.
- Todos os portais retornam automatic:false e independentAutomatic:false.
- Gupy, InfoJobs e Glassdoor: navegador de nuvem disponível, mas conta desconectada e nenhuma sessão salva.
- LinkedIn: integration_missing, sem navegador de envio nem OAuth configurado.
- Gemini: gemini-2.5-flash, chave configurada, enabled:true, consent:true. Health not_tested, zero chamadas contabilizadas na instância consultada. Contadores são em memória; não provam ausência histórica de uso.
- Antigravity: available:false, connected:false para a conta atual. O código exige ANTIGRAVITY_ENABLED=true e correspondência exata do usuário com ANTIGRAVITY_OWNER_ID. A resposta não distingue recurso desabilitado de titular divergente; não permite concluir que o login remoto expirou.
- Histórico: uma candidatura SmartTravel enviada em modo assistido, em 19/10. O artefato smarttravel-real-submission.json registra execução pelo assistente no Chrome, não pelo worker publicado.

## Papel da IA

Gemini analisa o currículo e ajuda na preparação. Antigravity foi implementado para pesquisas públicas verificáveis, restritas ao titular configurado. Nenhum deles substitui o executor de envio, a autenticação privada nos portais, as preferências e os consentimentos. A conexão Google do EmpreGatos não conecta automaticamente a Gupy. O Chrome do assistente também não fornece automaticamente sua sessão ao runner.

## O que falta

1. Concluir a entrevista e revisar a confirmação final, mantendo os filtros desejados.
2. Conectar a Gupy dentro do projeto e confirmar correspondência do currículo estruturado ao aprovado. O código local também contém conector Chrome; aceitação da sessão real no runner continua precisando de validação.
3. Conferir no ambiente publicado ANTIGRAVITY_ENABLED e ANTIGRAVITY_OWNER_ID, se esse provedor deve atender esta conta. Depois verificar uma pesquisa real, sem tratar conexão como prova de resultados.
4. Revisar uma nova vaga elegível e validar um único envio pelo produto: fila, worker, portal real e recibo. Não reutilizar a SmartTravel já enviada.
5. Após validar, ativar a rotina automática e conferir execução agendada. Perguntas sem resposta, sessão expirada e resultado incerto precisam continuar visíveis e impedir repetição indevida.

Gupy é o primeiro caminho operacional disponível. LinkedIn continua dependendo de uma integração autorizada adicional. O adaptador Gupy e a cadeia de envio possuem verificações locais com portais simulados; os resultados controlados não comprovam submissão em produção.

## Observações de produto

Validação local desta auditoria: 32 testes passaram em 5 arquivos, cobrindo adaptador Gupy, despacho, worker individual e Antigravity (protocolo e descoberta). São testes controlados, sem envio real.

- Antigravity indisponível desaparece da interface, dificultando distinguir configuração ausente de restrição de conta.
- A tela inicial resume vários requisitos em “responder às perguntas”; um checklist de entrevista, conexão, currículo do portal e rotina tornaria os bloqueios mais claros.
- Saúde da IA é volátil por processo; telemetria persistente de último sucesso/erro ajudaria no diagnóstico.

Fontes: páginas Automação, Preferências, Minha conta e Candidaturas; GET /api/automation/sites, /api/intelligence, /api/antigravity e /api/workspace; server/automation-capabilities.ts, server/submission-eligibility.ts, server/antigravity.ts, server/intelligence.ts e vercel.json.
