# Conector EmpreGatos 2.0.9

A versão 2.0.9 corrige a recuperação da conta ao voltar do login e acrescenta **Atualizar conta do EmpreGatos**. Atualizar a conta limpa o consentimento anterior, sem ler o portal. Reabrir uma aba já direcionada ao mesmo portal apenas dá foco, sem recarregar a operação; se a aba tiver sido fechada entre a procura e o foco, uma nova aba é criada uma única vez.

A importação de Gupy, InfoJobs e Glassdoor tem prazo de 75 segundos. A resposta precisa conter um visualizador autenticado utilizável; a verificação local do LinkedIn exige um registro válido do servidor. Respostas vazias, HTML de erro ou um canal interrompido não viram confirmação. Uma operação com resultado incerto não é repetida automaticamente. O site também conserva o portal escolhido após login, cadastro e retorno do Google, quando há armazenamento de sessão disponível.

A versão 2.0.7 acrescenta os ícones necessários para a distribuição na loja. O site agora apresenta um guia ilustrado em três passos, cópia do endereço `chrome://extensions` e um estado específico quando a extensão é detectada. Quando houver uma publicação real na loja, `VITE_CHROME_WEB_STORE_URL` habilita o botão **Instalar no Chrome**. Sem essa configuração, o site informa que a versão da loja ainda não foi publicada e mantém a instalação manual. O material para o primeiro envio está em `docs/CHROME-WEB-STORE.md`.

A versão 2.0.6 substitui o fluxo antigo do LinkedIn por **verificação local no Chrome**, disponível para todas as contas autenticadas. A extensão reconhece o login na página aberta e envia somente consentimento, versão, resultado e conta de destino ao endpoint `/api/connections/linkedin/local-browser`. Não lê nem transfere cookies, tokens ou armazenamento de autenticação do LinkedIn.

O servidor registra a observação separadamente por usuário. Ela aparece como verificação recente por 15 minutos; depois, o painel identifica o registro como histórico e uma nova verificação continua opcional. “Login reconhecido no Chrome” não comprova sessão ativa na nuvem, não autoriza envios e não garante que o login continue válido em todo momento. Esta versão continua sem executor de candidaturas pelo LinkedIn.

O fluxo de cópia foi desativado no servidor e no navegador privado, mesmo com o antigo `LINKEDIN_SESSION_RETEST_ENABLED=true`. Gupy, InfoJobs e Glassdoor mantêm seus fluxos próprios. A causa específica das desconexões anteriores não foi comprovada; a nova arquitetura remove a reutilização em outro navegador, mas testes controlados não validam a conta real.

O conector mostra andamento e carregamento durante a verificação. Só informa registro concluído após resposta positiva da API. Remover a observação no projeto não faz requisições ao LinkedIn nem encerra o login no Chrome.

Após o registro, a página mostra **Verificação do LinkedIn concluída** e **Concluir e voltar ao painel**, sem repetir os passos iniciais ou a instalação. Reabrir a página conserva esse resultado. **Verificar novamente** é uma ação opcional; um registro antigo aparece como histórico, sem comprovar que o login continua ativo. Essa correção está no site e não exige outra versão da extensão 2.0.6.

## Histórico anterior à versão 2.0.6

Atualização 2.0.5: a extensão exibe o motivo específico de indisponibilidade informado pelo servidor. Por solicitação do titular, a conexão é uma funcionalidade geral: `LINKEDIN_SESSION_RETEST_ENABLED` libera o teste para todas as contas autenticadas, sem lista pessoal de IDs ou e-mails. Cada conta mantém seu navegador e sessão separados; o destino é obtido da autenticação e não de um ID fornecido pelo cliente. A página consulta esse estado em vez de impor uma suspensão fixa. Essa liberação permite testar novamente e não comprova resolução da saída de login, nem libera candidaturas automáticas. A extensão 2.0.4 também recebe a liberação do servidor ao ser reaberta; não exige reinstalação.

Em 28/10/2026, novas transferências da sessão do **LinkedIn** foram suspensas após um relato de saída do login no Chrome original. O salvamento no servidor foi confirmado, mas não comprova que a sessão permaneceu válida; a causa da saída não foi estabelecida. O contexto da extensão informa indisponibilidade, o servidor rejeita importação, abertura, ações e confirmação desse portal antes de usar o navegador, e registros antigos são apresentados como suspensos. Gupy, InfoJobs e Glassdoor continuam com seu fluxo. A contenção é feita no servidor e no site, sem exigir outra versão da extensão. Não trate essa contenção como solução definitiva da conexão LinkedIn, nem reative o reuso da sessão sem resolver e validar o comportamento no navegador original.

Atualização 2.0.4: corrige `No tab with id` depois da autorização no Chrome. O conector procura novamente a aba do projeto e confere o mesmo titular antes de ler credenciais e antes da transferência. Se uma aba desaparece entre a procura e a mensagem, há uma recuperação limitada; abas do portal fechadas durante a leitura são ignoradas. Só uma falha comprovadamente anterior à entrega permite tentar outra aba. Uma resposta incerta do servidor ou o fechamento do canal após a transferência não permite repetir automaticamente.

Atualização 2.0.3: o ícone da extensão abre uma aba própria para a conexão, em vez de uma janelinha que desaparece ao mudar de foco. Depois de transferir a sessão, o conector ativa a aba do projeto para a confirmação final. A versão instalada, o andamento e os erros são mostrados também na página do EmpreGatos. A comunicação com abas já abertas é reinstalada após atualizações e reparada quando não há receptor; reinjetar o conector não deve duplicar envios de sessão.

Atualização 2.0.2: acrescenta recarga automática para a instalação de desenvolvimento e mostra a versão no conector. Ao voltar do login, a extensão lembra que ainda é necessário autorizar **Conectar sessão** e confirmar o salvamento no projeto.

Atualização 2.0.1: reconhece também o menu de conta do feed atual do LinkedIn, que não usa as classes `global-nav` antigas. O reconhecimento exige o menu com avatar e os links de navegação privada; um avatar isolado não confirma login. A correção é compartilhada pela extensão e pelo navegador do servidor.

A mesma extensão conecta Gupy, InfoJobs, Glassdoor e LinkedIn. Cada portal solicita acesso aos seus próprios domínios somente quando a pessoa escolhe conectar. O login no portal, a conta de destino no EmpreGatos e a autorização de envio são etapas separadas.

## Atualização da instalação existente

A pasta `browser-extension/gupy-session` foi mantida para atualizar a extensão instalada sem trocar seu identificador. Se você carregou essa pasta original do projeto, não precisa extrair outro ZIP: os arquivos são atualizados nela. Se já ativou a recarga automática na versão 2.0.2, feche o conector anterior para receber a 2.0.4. Em uma versão mais antiga, abra `chrome://extensions` e clique em **Recarregar** uma vez. Atualize também as abas do projeto.

Depois dessa ativação, o trabalhador da extensão verifica aproximadamente a cada minuto apenas os arquivos locais `release.json` e `manifest.json`. Quando há uma versão maior, os dois arquivos concordam e o conector está fechado, chama `chrome.runtime.reload()`. O Chrome pode atrasar alarmes e precisa estar aberto. A extensão não lê nem transfere sessões durante essa verificação, não baixa código remoto e não modifica pastas externas. A publicação de uma versão exige incrementar o manifesto e executar o empacotamento; o marcador de versão é escrito por último.

Essa recarga acompanha atualizações colocadas **na mesma pasta instalada**. Ela não faz uma cópia extraída em Downloads ou no computador de outra pessoa receber os arquivos do desenvolvedor pela internet.

Para uma instalação nova, baixe `/downloads/empregatos-conexoes-chrome.zip`, extraia, ative o modo do desenvolvedor e carregue a pasta sem compactação. O endereço antigo `/downloads/empregatos-gupy-chrome.zip` entrega o mesmo pacote atualizado.

## Atualizações para outros usuários

O caminho de distribuição no Chrome para usuários comuns é publicar na Chrome Web Store; depois da instalação pela loja, o navegador recebe as versões publicadas automaticamente. Uma URL de atualização em um servidor próprio não substitui a loja para instalações comuns em Windows e macOS. Consulte a [documentação oficial de distribuição](https://developer.chrome.com/docs/extensions/how-to/distribute).

O build prepara `/downloads/empregatos-chrome-web-store.zip` com canal `store`, sem a permissão de alarmes nem a verificação local ativa. Esse arquivo é para envio ao painel do desenvolvedor. **Preparar o pacote não significa que a extensão já esteja publicada ou aprovada na loja.** Cadastro do desenvolvedor, página da loja e envio para revisão ainda precisam ser concluídos. Não distribua a versão de desenvolvimento como se tivesse atualização automática da loja.

## Conectar Gupy, InfoJobs ou Glassdoor

1. Entre na sua conta do EmpreGatos e clique no ícone da extensão para abrir sua aba de conexão.
2. Selecione o portal e confira o nome e e-mail da conta de destino.
3. Clique em **Abrir login do portal**, entre normalmente e deixe a página autenticada aberta.
4. Volte à aba do conector, confira o portal e destino, marque a autorização e clique em **Conectar sessão ao EmpreGatos**. Autorize esse portal na solicitação do Chrome. Essa ação não abre outra aba do portal: reconhece o login e transfere somente a sessão escolhida.
5. Após **Sessão verificada**, abra a aba do EmpreGatos, confira a página autenticada e confirme a conexão.

Gupy, InfoJobs e Glassdoor permitem salvar somente a conexão ou aprovar também o currículo e os envios, respeitando as preferências da conta. Para o LinkedIn, escolha **Verificar LinkedIn no meu Chrome**: o resultado aparece no projeto sem abrir outro navegador nem copiar a sessão. Ter login reconhecido não comprova que uma candidatura foi enviada.

## Limites e isolamento

A extensão não captura senhas nem cookies do Google ou do EmpreGatos. Transfere cookies seguros e entradas de armazenamento relacionadas a autenticação somente do portal selecionado, após autorização explícita. Não coleta sessões em segundo plano nem guarda credenciais no `chrome.storage`.

O servidor valida os domínios, o usuário autenticado e a conta de destino, e testa a sessão numa janela isolada por usuário e portal. A sessão só é persistida cifrada após a confirmação final. Se o portal pedir uma verificação ou recusar a sessão transferida, o usuário deve concluir a verificação; o produto não deve anunciar conexão concluída nem contornar o bloqueio.

`PORTAL_CLOUD_SESSION_PORTALS` controla os portais disponíveis para conexão. `PORTAL_CLOUD_PORTALS` continua controlando as integrações de envio; incluir LinkedIn na lista de conexões não o habilita para candidaturas. Os controles existentes de acesso por usuário continuam em vigor.

## Manutenção e validação

`shared/browser-connectors.ts` centraliza domínios, endereço de conta e sinais de autenticação. O empacotamento gera `config.js`, `release.json`, os dois ZIPs de instalação manual e o pacote separado para a loja; `npm run build` o executa automaticamente. Adicionar outro portal exige também permissões opcionais no manifesto, suporte no servidor e na interface, verificação autenticada e testes de isolamento. Não adicione uma opção decorativa sem esse caminho completo.

Os testes da extensão usam Chrome real com contas e cookies sintéticos em páginas controladas para os quatro portais. Eles verificam consentimento, destino, filtragem e comunicação autenticada; não demonstram que cada serviço aceitará uma sessão real. A aceitação em cada conta depende da verificação de login feita pelo próprio portal no servidor.
