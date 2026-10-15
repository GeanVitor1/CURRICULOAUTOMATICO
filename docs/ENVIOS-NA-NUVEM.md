# Candidaturas pelo navegador na Vercel

## Fluxo publicado de login

Por escolha do produto, Gupy, InfoJobs e Glassdoor agora abrem o login no domínio oficial, em outra aba. O painel não solicita e-mail ou senha desses portais e suas rotas HTTP de login remoto (`open`, `action`, `confirm`) recusam novas conexões. Fechar a aba ou voltar ao painel não comprova autenticação e não ativa os envios. Não há extensão de compartilhamento de sessão instalada nem OAuth de candidato configurado. A busca diária continua; candidaturas sem uma integração ou sessão já válida ficam pendentes. Os componentes de navegador descritos abaixo permanecem como infraestrutura, sem serem usados para pedir credenciais nesse fluxo.

O navegador usa Vercel Sandbox e uma sessão privada por pessoa e portal. Não precisa de computador ligado. A conexão Antigravity é independente: fornece análise e busca, sem autenticar contas de candidatos.

Habilitação inicial restrita ao titular configurado por `PORTAL_CLOUD_OWNER_ID` (ou `ANTIGRAVITY_OWNER_ID`), com `PORTAL_CLOUD_ENABLED=true` e `PORTAL_CLOUD_SNAPSHOT_ID` apontando para a imagem com Chromium e dependências Linux. `PORTAL_CLOUD_PORTALS` seleciona Gupy, InfoJobs e Glassdoor. LinkedIn permanece excluído. O recurso usa a cota Sandbox da conta Vercel; não transforma a cota de IA em computação ilimitada.

O fluxo anterior usava login interativo na máquina remota e confirmação do currículo do perfil. Esse fluxo não é mais oferecido no painel para Gupy, InfoJobs ou Glassdoor. Sessões já existentes continuam cifradas; o banco recebe apenas metadados. Desconectar remove a máquina e seus snapshots.

Cada candidatura elegível entra em `empregatos-submissions` e tem uma execução separada da busca diária. A fila contém apenas identificadores; o original aprovado é carregado no servidor. Gupy e InfoJobs também podem usar o currículo existente no perfil, com confirmação explícita de que corresponde ao currículo aprovado. O adaptador tenta os botões de candidatura e preenche nome, e-mail e outros campos pessoais confirmados. Não inventa respostas sobre experiência, testes ou declarações legais. CAPTCHA, bloqueios do portal e perguntas adicionais ficam registrados com o motivo. Não há evasão de bloqueios.

Somente uma confirmação do portal registra **Enviada**, com recibo. Uma tentativa ambígua fica **Resultado desconhecido** e não é repetida. Reservas de limite diário e um registro privado de tentativas evitam duplicação entre entregas da fila e reinícios. Uma sessão expirada exige nova conexão. Formulários externos ou não reconhecidos ainda precisam de conclusão manual.

Verificação pública sem credenciais: `npx tsx scripts/probe-cloud-portals.ts infojobs gupy glassdoor`, com arquivos de ambiente locais privados. Isso valida a abertura dos portais, não comprova candidaturas reais. Testes de envio usam formulários locais controlados; um envio real só pode ser comprovado com a conta do candidato conectada e o recibo do portal.
