# Candidaturas pelo navegador na Vercel

## Fluxo publicado de login

Gupy, InfoJobs e Glassdoor oferecem uma janela separada em `/app?portal=<portal>`. Após aceitar o navegador remoto, a pessoa interage com a página real do portal por imagem, cliques e teclado. Não há instalação, extensão nem formulário de e-mail/senha recriado pelo aplicativo. A janela informa que o navegador e a sessão são operados pela EmpreGatos, e que isso não equivale a OAuth oficial do portal. Entradas externas, como Google, não estão habilitadas nessa janela; use o acesso do próprio portal.

O navegador usa Vercel Sandbox e uma sessão privada por pessoa e portal. Não precisa de computador ligado. A conexão Antigravity é independente: fornece análise e busca, sem autenticar contas de candidatos.

Use `PORTAL_CLOUD_ENABLED=true` e `PORTAL_CLOUD_SNAPSHOT_ID` apontando para a imagem com Chromium e dependências Linux. `PORTAL_CLOUD_ALL_USERS=true` libera para todas as contas autenticadas, sempre com máquinas e sessões isoladas por usuário e portal. Sem essa opção, fica restrito ao titular configurado por `PORTAL_CLOUD_OWNER_ID` (ou `ANTIGRAVITY_OWNER_ID`). `PORTAL_CLOUD_PORTALS` seleciona Gupy, InfoJobs e Glassdoor. LinkedIn permanece excluído. O recurso usa a cota Sandbox da conta Vercel; não transforma a cota de IA em computação ilimitada.

O servidor exige consentimento ao abrir e identifica cada janela por um UUID. Uma janela substituída não consegue digitar, confirmar nem encerrar a sessão atual. As ações são serializadas; falhas interrompem a fila de digitação até atualização manual. A confirmação exige autenticação efetivamente reconhecida no portal, currículo aprovado, preferências concluídas e autorização explícita de envio. Só então ativa a rotina automática e despacha as candidaturas elegíveis. Fechar uma janela sem confirmar não conecta a conta. Sessões ficam cifradas; o banco recebe apenas metadados. Desconectar remove a máquina e seus snapshots.

Cada candidatura elegível entra em `empregatos-submissions` e tem uma execução separada da busca diária. A fila contém apenas identificadores; o original aprovado é carregado no servidor. Gupy e InfoJobs também podem usar o currículo existente no perfil, com confirmação explícita de que corresponde ao currículo aprovado. O adaptador tenta os botões de candidatura e preenche nome, e-mail e outros campos pessoais confirmados. Não inventa respostas sobre experiência, testes ou declarações legais. CAPTCHA, bloqueios do portal e perguntas adicionais ficam registrados com o motivo. Não há evasão de bloqueios.

Somente uma confirmação do portal registra **Enviada**, com recibo. Uma tentativa ambígua fica **Resultado desconhecido** e não é repetida. Reservas de limite diário e um registro privado de tentativas evitam duplicação entre entregas da fila e reinícios. Uma sessão expirada exige nova conexão. Formulários externos ou não reconhecidos ainda precisam de conclusão manual.

Verificação pública sem credenciais: `npx tsx scripts/probe-cloud-portals.ts infojobs gupy glassdoor`, com arquivos de ambiente locais privados. Isso valida a abertura dos portais, não comprova candidaturas reais. Testes de envio usam formulários locais controlados; um envio real só pode ser comprovado com a conta do candidato conectada e o recibo do portal.
