# Candidaturas pelo navegador na Vercel

## Fluxo publicado de login

Gupy, InfoJobs e Glassdoor abrem o login no domínio oficial, em outra aba. O painel não solicita e-mail ou senha desses portais e suas rotas HTTP de login remoto (`open`, `action`, `confirm`) recusam novas conexões. Fechar a aba ou voltar ao painel não comprova autenticação. **Conectar com a automação** usa uma extensão opcional para compartilhar a sessão do portal após autorização explícita. A conexão não usa OAuth do candidato.

O botão **Baixar conector** fornece `/empregatos-conector.zip`, gerado a partir de `browser-connector/` em cada build. A versão inicial exige instalar a pasta extraída no modo desenvolvedor do Chrome ou Edge; não foi publicada na loja. O manifesto contém uma identidade pública fixa e permissões opcionais apenas para os três portais. A extensão não lê campos de senha, não solicita acesso ao Google, não persiste cookies e não faz envios de currículos. Uma janela própria explica o acesso e exige autorização antes de ler a sessão. Cookies seguros, armazenamento local relacionado à autenticação e o banco de autenticação Firebase, quando existente, são enviados somente à página do painel que iniciou o pedido.

O painel transmite a sessão à rota autenticada `/api/connections/:portal/import`, com proteção de origem, confirmação do currículo e consentimento. O servidor restringe todos os domínios, verifica a sessão na página de conta do portal e só salva uma sessão confirmada. Estado autenticado e comunicação com a máquina remota são cifrados; nunca aparecem no retorno da API nem no banco do workspace. Após validação, a rotina muda para automática e as preparações elegíveis entram na fila. Portais podem recusar a sessão transferida, pedir nova autenticação ou bloquear a nuvem; isso é informado, sem marcar conexão ou envio fictícios.

Depois da conexão, o computador e a extensão podem ser fechados. **Desconectar** remove a sessão da nuvem. Remover somente a extensão não revoga uma sessão já compartilhada; use também Desconectar no painel. Se a sessão expirar, entre novamente no portal e repita a conexão explícita.

O navegador usa Vercel Sandbox e uma sessão privada por pessoa e portal. Não precisa de computador ligado. A conexão Antigravity é independente: fornece análise e busca, sem autenticar contas de candidatos.

Habilitação inicial restrita ao titular configurado por `PORTAL_CLOUD_OWNER_ID` (ou `ANTIGRAVITY_OWNER_ID`), com `PORTAL_CLOUD_ENABLED=true` e `PORTAL_CLOUD_SNAPSHOT_ID` apontando para a imagem com Chromium e dependências Linux. `PORTAL_CLOUD_PORTALS` seleciona Gupy, InfoJobs e Glassdoor. LinkedIn permanece excluído. O recurso usa a cota Sandbox da conta Vercel; não transforma a cota de IA em computação ilimitada.

O fluxo anterior usava login interativo na máquina remota e confirmação do currículo do perfil. Esse fluxo não é mais oferecido no painel para Gupy, InfoJobs ou Glassdoor. Sessões já existentes continuam cifradas; o banco recebe apenas metadados. Desconectar remove a máquina e seus snapshots.

Cada candidatura elegível entra em `empregatos-submissions` e tem uma execução separada da busca diária. A fila contém apenas identificadores; o original aprovado é carregado no servidor. Gupy e InfoJobs também podem usar o currículo existente no perfil, com confirmação explícita de que corresponde ao currículo aprovado. O adaptador tenta os botões de candidatura e preenche nome, e-mail e outros campos pessoais confirmados. Não inventa respostas sobre experiência, testes ou declarações legais. CAPTCHA, bloqueios do portal e perguntas adicionais ficam registrados com o motivo. Não há evasão de bloqueios.

Somente uma confirmação do portal registra **Enviada**, com recibo. Uma tentativa ambígua fica **Resultado desconhecido** e não é repetida. Reservas de limite diário e um registro privado de tentativas evitam duplicação entre entregas da fila e reinícios. Uma sessão expirada exige nova conexão. Formulários externos ou não reconhecidos ainda precisam de conclusão manual.

Verificação pública sem credenciais: `npx tsx scripts/probe-cloud-portals.ts infojobs gupy glassdoor`, com arquivos de ambiente locais privados. Isso valida a abertura dos portais, não comprova candidaturas reais. Testes de envio usam formulários locais controlados; um envio real só pode ser comprovado com a conta do candidato conectada e o recibo do portal.
