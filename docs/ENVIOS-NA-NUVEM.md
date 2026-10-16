# Candidaturas pelo navegador na Vercel

## Fluxo publicado de login

Gupy, InfoJobs e Glassdoor oferecem uma janela separada em `/app?portal=<portal>`. Clicar em conectar no painel abre diretamente o login do portal, sem introdução, cabeçalho, botões de teclado ou controles de imagem. A pessoa interage com a página real por cliques, teclado, roda do mouse e gestos de rolagem. O painel informa que o navegador e a sessão são operados pela EmpreGatos. A confirmação do currículo e dos envios aparece somente após autenticação reconhecida. Não há instalação, extensão nem formulário de e-mail/senha recriado pelo aplicativo. Isso não equivale a OAuth oficial. Popups Google/LinkedIn são acompanhados na mesma janela e retornam ao portal quando o provedor permite o acesso. A sessão remota é separada do Chrome da pessoa: suas contas locais não aparecem automaticamente. O Google pode recusar navegadores controlados por software ([documentação oficial](https://support.google.com/accounts/answer/7675428?hl=pt-BR)). Essa recusa é detectada em português/inglês e oferece retorno à entrada do portal. Não há garantia de login social; contas somente sociais podem precisar configurar acesso por e-mail/código no site oficial.

O navegador usa Vercel Sandbox e uma sessão privada por pessoa e portal. Não precisa de computador ligado. A conexão Antigravity é independente: fornece análise e busca, sem autenticar contas de candidatos.

Use `PORTAL_CLOUD_ENABLED=true` e `PORTAL_CLOUD_SNAPSHOT_ID` apontando para a imagem com Chromium e dependências Linux. `PORTAL_CLOUD_ALL_USERS=true` libera para todas as contas autenticadas, sempre com máquinas e sessões isoladas por usuário e portal. Sem essa opção, fica restrito ao titular configurado por `PORTAL_CLOUD_OWNER_ID` (ou `ANTIGRAVITY_OWNER_ID`). `PORTAL_CLOUD_PORTALS` seleciona Gupy, InfoJobs e Glassdoor. LinkedIn permanece excluído. O recurso usa a cota Sandbox da conta Vercel; não transforma a cota de IA em computação ilimitada.

O servidor exige consentimento ao abrir e identifica cada janela por um UUID. Uma janela substituída não consegue digitar, confirmar nem encerrar a sessão atual. As ações são serializadas; falhas interrompem a fila de digitação até atualização manual. A confirmação exige autenticação efetivamente reconhecida no portal, currículo aprovado, preferências concluídas e autorização explícita de envio. Só então ativa a rotina automática e despacha as candidaturas elegíveis. Fechar uma janela sem confirmar não conecta a conta. Sessões ficam cifradas; o banco recebe apenas metadados. Desconectar remove a máquina e seus snapshots.

O login interativo usa WebSocket direto para uma porta específica do Sandbox. A API autenticada fornece um segredo temporário, limitado àquela janela e à origem do aplicativo; ele não é persistido no banco. O canal público aceita apenas cliques, texto, teclas permitidas, rolagem e atualização. Não expõe CDP, cookies, arquivos, confirmação de login ou envio de candidaturas. A imagem vem de `Page.startScreencast`, sem uma captura e uma ida à API por tecla. Os comandos podem permanecer em trânsito simultaneamente; o navegador os executa na ordem recebida. Confirmação, encerramento e automação continuam nas rotas autenticadas. O caminho HTTP anterior atende janelas antigas durante a atualização.

Cada candidatura elegível entra em `empregatos-submissions` e tem uma execução separada da busca diária. A fila contém apenas identificadores; o original aprovado é carregado no servidor. Gupy e InfoJobs também podem usar o currículo existente no perfil, com confirmação explícita de que corresponde ao currículo aprovado. O adaptador tenta os botões de candidatura e preenche nome, e-mail e outros campos pessoais confirmados. Não inventa respostas sobre experiência, testes ou declarações legais. CAPTCHA, bloqueios do portal e perguntas adicionais ficam registrados com o motivo. Não há evasão de bloqueios.

Somente uma confirmação do portal registra **Enviada**, com recibo. Uma tentativa ambígua fica **Resultado desconhecido** e não é repetida. Reservas de limite diário e um registro privado de tentativas evitam duplicação entre entregas da fila e reinícios. Uma sessão expirada exige nova conexão. Formulários externos ou não reconhecidos ainda precisam de conclusão manual.

Verificação pública sem credenciais: `npx tsx scripts/probe-cloud-portals.ts infojobs gupy glassdoor`, com arquivos de ambiente locais privados. Isso valida a abertura dos portais, não comprova candidaturas reais. Testes de envio usam formulários locais controlados; um envio real só pode ser comprovado com a conta do candidato conectada e o recibo do portal.


## Qualidade do visualizador

O navegador interativo usa densidade de 1,5 pixel por pixel CSS, até 1600 × 1000
pixels CSS. A janela informa largura e altura ao abrir e envia redimensionamentos
com debounce, inclusive para popups. Imagem e dimensões seguem juntas no canal;
os cliques usam coordenadas CSS, independentemente da densidade transmitida.
A transmissão JPEG usa qualidade 90; a abertura e capturas de recuperação usam PNG
sem perdas. A captura de recuperação aguarda uma pausa na digitação e não bloqueia
a confirmação de cada tecla. Os frames antigos de uma janela redimensionada são
descartados. Não há emulação de identidade, remoção de sinais de automação ou
contorno de verificações do provedor.

O protocolo do runner é versão 7. Ao abrir, uma instância antiga é parada e
retomada com o runner atualizado, preservando o arquivo cifrado da sessão do portal.
Não é necessário criar outra imagem-base para essas mudanças.
