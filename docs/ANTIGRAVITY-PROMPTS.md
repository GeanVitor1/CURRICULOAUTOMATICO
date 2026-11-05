# Instruções do Antigravity para o EmpreGatos

As instruções executadas estão em `server/job-search-policy.ts`. O servidor as injeta em cada busca do Antigravity e do Gemini. Conexões já existentes recebem a atualização sem reconectar. Isso fornece contexto persistente; não altera os pesos do modelo.

O Antigravity IDE/CLI também recebe as regras do projeto em `.agents/rules/empregatos.md`, com `trigger: always_on`, no formato de [regras persistentes documentado pelo Google](https://antigravity.google/docs/rules/). Esse arquivo acompanha o repositório e não altera permissões globais da ferramenta.

Cada consulta recebe os cargos, as competências confirmadas, a experiência declarada, as modalidades e as localidades da conta atual. Nome, telefone, e-mail, currículo e credenciais não entram na pesquisa. Administração, comércio, logística, saúde e outras profissões usam os mesmos conectores e verificações.

O prompt exige pesquisa pública, duas consultas separadas, empresas diferentes, anúncios individuais e JSON com URLs e citações. O backend confirma os fatos na publicação. Uma resposta da IA não comprova envio.

O Antigravity pesquisa. O envio continua no worker do projeto, com currículo aprovado, critérios, autorização da conta, limite diário, verificação do formulário e confirmação do destino. O bloqueio de uma empresa deve permitir a próxima oportunidade, preservando o histórico e evitando duplicação.

Para manutenção no Antigravity IDE, use:

> Trabalhe no fluxo de produção do EmpreGatos, da busca agendada ao recibo. Reproduza o defeito e corrija a causa no código. Não fixe cargos, tecnologias, empresas ou IDs de um candidato nos conectores. Valide profissões diferentes e isolamento entre contas. Não relaxe filtros nem invente respostas para produzir um envio. Testes controlados e recibos reais devem permanecer distintos. Continue pela próxima oportunidade elegível quando houver bloqueio individual. Ao concluir, informe a mudança publicada, os testes executados e a evidência de envio ou o bloqueio exato ainda existente.

Para validar a descoberta sem enviar dados a empregadores: `npx tsx scripts/verify-discovery-coverage.ts --search --board=identificador-verificado`. O script usa o contexto privado local da conta inspecionada; não muda preferências nem transmite candidaturas.
# LinkedIn: verificação local a partir da extensão 2.0.6

Ao trabalhar na conexão LinkedIn, preserve `browserConnectionMode('linkedin') === 'local-browser'`. Reconheça o login pela página já aberta no Chrome e registre somente o resultado e a data na conta autenticada. Não leia cookies ou armazenamento de autenticação, não exporte tokens e não reutilize a sessão num navegador da nuvem. O antigo sinalizador de reteste foi aposentado após desconexões repetidas. Gupy, InfoJobs e Glassdoor mantêm seus fluxos próprios.

No painel, uma observação recente aparece como “Login reconhecido no Chrome”, com envio automático indisponível. Nunca transforme essa observação em `connected: true`, currículo aprovado ou autorização de candidatura. Preserve consentimento, destino conferido antes e depois da leitura e validação de `expectedUserId` no servidor. Teste duas contas independentes, recusa de credenciais no corpo, expiração do registro, erro de salvamento e rejeição do fluxo antigo. Use testes controlados para o código; não apresente esses testes como uma conexão real do titular.

