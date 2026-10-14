# Busca diária na Vercel

A API publica o ID da busca no tópico `empregatos-discovery`. A função `api/search-worker.mjs` recebe a mensagem e executa a tarefa persistida no PostgreSQL. Não é preciso instalar Redis ou manter uma VM para essa busca.

Ao concluir as preferências com “Iniciar busca e preparação”, a primeira busca começa imediatamente. `/api/daily-routine` inicia as rotinas vencidas todos os dias às 11h UTC, durante a janela entre 8h e 9h de Brasília no plano Hobby. “Buscar agora” continua disponível. Horários flexíveis continuam disponíveis quando a API usa o servidor permanente/Redis.

Configure `CRON_SECRET` como Secret de Production antes do deploy. A Vercel envia o segredo no cabeçalho Authorization. Sem o segredo, a função rejeita a solicitação; o endpoint público e chamadas POST não executam rotinas. `VERCEL_QUEUES_ENABLED=false` desativa a fila Vercel; não configure esse bloqueio na instalação que depende dela.

O consumidor recebe apenas um UUID, sem currículo, contato ou credenciais. A tarefa precisa estar pendente ou ter a lease expirada. A publicação usa idempotência; o consumidor usa a claim persistida e recusa entregas concorrentes. Tarefas concluídas não se repetem. A fila tenta novamente após interrupção; o banco permite uma recuperação antes de registrar falha. A rotina diária também republica tarefas que ficaram pendentes durante uma falha de publicação.

A função tem duração máxima de 300 segundos e as consultas compartilham um orçamento de 240 segundos. Anúncios já encontrados são preservados quando uma fonte excede esse limite, com o erro no histórico. Envio automático depende das integrações autorizadas, aprovação do currículo e limite do plano; uma busca concluída não implica que alguma candidatura foi enviada.

Verificações: testes da API em ambiente Vercel simulado, seleção da tarefa por ID, entrega repetida/concorrente, recuperação, falha de publicação com nova tentativa, autorização da rotina e orçamento de consultas. `scripts/verify-vercel-automation.ts` verifica produção com uma conta e um currículo fictícios, sem autorizar envios, e remove a conta ao terminar.

Validação de produção em 14/10/2026: preferências salvas; tarefa consumida e concluída com 8 vagas da Gupy e nenhum erro de fonte; zero candidaturas enviadas; conta fictícia removida. O endpoint diário respondeu 401 sem autorização e 200 com o segredo do servidor. O deploy registrou o consumidor e o cron `0 11 * * *`. A execução agendada futura permanece dependente da disponibilidade dos serviços e das fontes.

Referências: [Queues](https://vercel.com/docs/queues), [SDK](https://vercel.com/docs/queues/sdk), [cron e precisão](https://vercel.com/docs/cron-jobs/usage-and-pricing), [duração](https://vercel.com/docs/functions/configuring-functions/duration), [limites da fila](https://vercel.com/docs/queues/pricing).
