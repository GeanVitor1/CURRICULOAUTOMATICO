# Antigravity CLI remoto

A instalação usa o CLI oficial `agy` 1.3.5 em um Vercel Sandbox Linux chamado `empregatos-antigravity`, no mesmo projeto da aplicação. O computador do titular não precisa ficar ligado. Não utiliza a chave Gemini nem ativa faturamento do Google Cloud.

## Conectar a conta

1. Entre na EmpreGatos com a conta do titular e abra **Automação** ou **Minha conta**.
2. Em **Antigravity na nuvem**, clique em **Conectar conta Google**.
3. Abra **Entrar na conta Google** e escolha a conta com o plano Pro.
4. Cole o código de autorização apenas no campo da aplicação e confirme. Não envie códigos, senhas ou tokens em conversas.
5. Clique em **Buscar agora**. A rotina diária já configurada chama o mesmo caminho.

O CLI aguarda a autorização por cerca de 60 segundos. Se expirar, gere outro link. A aplicação só registra a conexão depois que o CLI termina uma consulta curta com sucesso. O titular concluiu o login e a conta respondeu a consultas reais após a retomada do Sandbox.

Teste da fila de produção em 14/10/2026: tarefa concluída sem erros, 57 anúncios armazenados, 3 dentro dos filtros mantidos e 5 candidaturas em ação manual (uma nova preparada nesta execução). A Gupy retornou 56 anúncios públicos; LinkedIn, Glassdoor e InfoJobs concluíram as consultas pelo Antigravity, com zero anúncios individuais confirmados nesse teste. Próxima busca preservada em 15/10/2026 às 08:00 de Brasília. Não houve envio automático de candidaturas.

## Funcionamento

- Gupy continua pela consulta pública já disponível, sem gastar a cota de IA.
- Outras consultas públicas usam `agy -p ... --output-format stream-json --print-timeout 55s` quando habilitado para o titular. O servidor executa comandos com argumentos separados, sem interpolar filtros em shell.
- Anúncios só entram se a URL pertencer ao portal correto e tiver uma fonte verificável. CLI 1.3.5 registra a execução da busca, mas omite o conteúdo nativo de `search_web` no stream. Nesse caso, a IA fornece a referência opaca `vertexaisearch.cloud.google.com/grounding-api-redirect/...`: o backend resolve a referência no Google e exige um anúncio individual do portal solicitado. Referências inválidas, páginas de listas e URLs diferentes do destino confirmado são rejeitadas. Uma URL direta declarada apenas pela IA continua insuficiente. Datas e salários não são inventados.
- O modelo de busca é escolhido no catálogo oficial `agy models`, preferindo Gemini Flash Low para concluir dentro do orçamento do worker. `ANTIGRAVITY_SEARCH_MODEL` permite configurar outro modelo disponível. A saída segue um esquema JSON obrigatório.
- O worker da fila Vercel continua responsável pela busca iniciada no botão e pelo cron diário. Nenhum daemon roda no computador do usuário.
- O Sandbox é retomado sob demanda e parado ao concluir as tarefas. Uma abertura da tela de conexão pode deixá-lo ativo até o timeout configurado de 10 minutos. A política mantém apenas o último snapshot, com expiração desativada para esse snapshot, dentro da cota de armazenamento.
- O login fica no perfil privado do CLI e no Secret Service Linux dentro do Sandbox. O backend usa OIDC Vercel para controlar a máquina; essas credenciais, a chave Gemini e a conexão do banco não são passadas ao CLI. O código OAuth vai pelo stdin de um terminal com echo desativado; não é salvo no banco, exportado ou colocado em argumentos de processo.
- `useG1Credits: false` impede fallback para créditos extras. Há permissões de leitura somente nos domínios de busca e vagas; comandos, leitura/escrita de arquivos pelo agente, MCP e atuação em páginas estão bloqueados.
- `ANTIGRAVITY_ENABLED=true`, `ANTIGRAVITY_OWNER_ID` e o nome opcional `ANTIGRAVITY_SANDBOX_NAME` são configuração de servidor. A cota pessoal não é compartilhada com outras contas da aplicação. Desconectar remove o perfil Google e substitui o snapshot anterior.

## Limites e candidaturas

O plano Hobby Vercel confirmado nesta instalação inclui 5 horas mensais de CPU ativa, 420 GB-horas de memória, 5.000 criações e 15 GB de snapshots. Ao exceder o limite, pausa a criação de máquinas, sem cobrança de excedentes. Não significa capacidade ilimitada nem que esses limites serão suficientes para uma instalação com muitos usuários. Se o plano da hospedagem mudar para Pro, reveja a configuração antes de continuar: Sandbox no Pro é cobrado por uso.

A assinatura e as cotas do Antigravity continuam sujeitas à conta Google conectada. O CLI não substitui permissões de candidatura dos portais. Esta instalação permanece com envio assistido: prepara os materiais e o usuário conclui no anúncio oficial. A análise do currículo ainda usa o provedor configurado nela; esta alteração troca o provedor das buscas do titular.

Referências oficiais:

- https://www.antigravity.google/docs/cli/install/
- https://www.antigravity.google/docs/cli/headless/
- https://www.antigravity.google/docs/cli/credits/
- https://vercel.com/docs/sandbox/pricing

Verificações: `npx tsx scripts/verify-antigravity-cloud.ts` testa o OAuth real em nuvem e limpa o login de teste. Recusa executar se uma conta Google já estiver conectada. `scripts/verify-antigravity-routine.ts --apply --deployment dpl_...` publica uma tarefa real na fila do deployment de produção verificado, preserva filtros e acompanha sua conclusão; exige que o workspace informado seja único e permaneça em modo assistido. Testes locais incluem `tests/antigravity.test.ts`, `tests/antigravity-discovery.test.ts`, `tests/api.test.ts` e `browser-tests/antigravity-connection.spec.ts`.
