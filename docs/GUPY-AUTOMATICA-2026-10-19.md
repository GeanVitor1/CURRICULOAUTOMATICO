# Candidatura Gupy pelo projeto

O projeto tem um adaptador próprio para o fluxo observado na candidatura SmartTravel 767851604. Ele é chamado por `applyOnPage`, tanto no navegador privado local como no runner na nuvem. O envio usa a sessão privada do usuário e exige confirmação de que o currículo estruturado da Gupy corresponde ao currículo aprovado. A sessão do Chrome usada pelo assistente não é copiada para o servidor.

O adaptador valida cargo, domínio e destino do botão; continua pela introdução, dados adicionais, perguntas da empresa e apresentação opcional; usa as respostas confirmadas e o rascunho da candidatura; destaca até três habilidades já cadastradas; clica uma única vez em finalizar e só registra envio quando a confirmação da Gupy aparece. A tela moderna “Candidatura finalizada!” é reconhecida mesmo com rodapés e avisos longos.

O aviso “Atualize seus dados” é adiado por “Me lembrar depois”. Se a Gupy exigir uma alteração cadastral, o processo para. Não se alteram e-mail, telefone ou credenciais globais durante uma candidatura.

Perguntas obrigatórias sem resposta voltam ao EmpreGatos como pendências. Uma pausa comprovada antes da finalização pode ser retomada, após salvar respostas e autorizar novamente, usando a mesma reserva de candidatura. Resultado incerto após clicar em finalizar impede repetição automática. O histórico e o diário privado do navegador preservam essa distinção após reinícios.

O runner na nuvem passa para versão 10. Conexões com runner antigo devem ser reabertas para atualização antes de novos envios; a atualização não interrompe automaticamente uma execução antiga em andamento.

## Conexão pelo Chrome — 20/10/2026

A tela de conexão Gupy oferece primeiro o conector para o Chrome habitual. O login, incluindo Google e verificações, acontece no site oficial nesse navegador. O conector em `browser-extension/gupy-session` exige uma ação e consentimento na própria extensão antes de transferir cookies seguros não particionados da Gupy e chaves de autenticação do armazenamento local. Não pede permissão de domínio Google, não lê campos de senha, não exporta dados automaticamente e não aceita comandos de páginas externas. As permissões seguem a [API de cookies do Chrome](https://developer.chrome.com/docs/extensions/reference/api/cookies).

O pacote é gerado no build em `/downloads/empregatos-gupy-chrome.zip`. A instalação atual é manual, sem publicação na Chrome Web Store. Depois de instalar, é necessário recarregar a aba do EmpreGatos para carregar o receptor da extensão.

`POST /api/connections/gupy/browser-session` exige sessão EmpreGatos, proteção CSRF, consentimento explícito, limites de tamanho e apenas domínios/origens Gupy. A sessão passa pelo canal cifrado privado até o runner. O runner verifica o acesso a uma página privada antes de devolver a confirmação; só salva cifrada após a confirmação na interface. Há opção de salvar a conexão com `profileResumeId: null`, sem ativar rotina nem dispensar a aprovação do currículo. Recusa do servidor ou sessão expirada não são apresentadas como sucesso. O portal ainda pode recusar uma sessão transferida entre navegadores/IPs; este caminho exige validação real para cada conta.

`tests/gupy-chrome-extension.test.ts` carrega a extensão real em Chromium temporário com páginas Gupy/EmpreGatos simuladas e verifica consentimento, envio pela API autenticada, entrega à interface e exclusão de cookies Google. Os testes do serviço verificam sessão inválida, confirmação posterior e armazenamento cifrado. Esses testes não substituem uma candidatura real em produção.

## Verificação

`npm run verify:gupy-submission` cria uma conta e banco temporários, coleta os dados na interface, confirma uma sessão privada fictícia cifrada, autoriza um envio pela API, roda o consumidor real e o adaptador Gupy em Chromium. Só as páginas Gupy são simuladas; nenhuma conta real ou empregador é contatado. A interface deve exibir o recibo, exatamente uma candidatura deve ser finalizada, nenhum contato da conta pode ser atualizado e uma segunda candidatura deve permanecer pendente. Resultado e imagens: `artifacts/gupy-project-verification.json` e `artifacts/gupy-project-receipt-mobile.png`.

Os testes de integração também cobrem múltipla escolha, perguntas sem resposta, currículo não confirmado, identidade de vaga divergente, candidatura existente, ausência de confirmação final, retomada após respostas e preservação de recibos sem duplicação.

Uma nova validação em produção precisa da conexão Gupy feita dentro do EmpreGatos. O teste real anterior feito pelo assistente no Chrome é uma evidência separada e não é apresentado como execução do worker de produção.
