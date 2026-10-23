# Candidaturas por e-mail pelo sistema

O worker de candidaturas envia pela Gmail API em nome da conta conectada pelo candidato. Não exige domínio próprio nem serviço de e-mail transacional. O fluxo é: anúncio público com instrução de candidatura → endereço confirmado também no domínio da empresa → currículo aprovado e critérios → autorização individual ou rotina ativa → fila durável → mensagem MIME com arquivo original → identificador do Gmail.

## Conexão

Em Preferências, a seção “Seu e-mail para candidaturas” inicia uma autorização Google separada do login, usando as credenciais e o callback Google existentes. Solicita `openid email https://www.googleapis.com/auth/gmail.send`, acesso offline, PKCE, estado de uso único e nonce. Não solicita leitura da caixa postal. A identidade precisa coincidir com a conta cadastrada. Tokens ficam criptografados em `portal_oauth_accounts`, fora do workspace e das respostas da API. A desconexão remove a credencial local e impede novos envios; uma tentativa já iniciada pode terminar.

O operador precisa habilitar Gmail API no projeto do cliente OAuth e configurar a audiência/permissões no Google Auth Platform. Aplicativos externos com esse escopo sensível podem exigir verificação do Google para uso público. O status da conta, os usuários de teste e a política de duração do consentimento são determinados pelo Google. Um botão implantado não comprova que o consentimento foi concedido nem que o aplicativo foi aprovado pelo Google.

Confira o número do projeto do cliente OAuth, que pode ser diferente do projeto Firestore. No teste de 20/10/2026, o cliente EmpreGatos pertence ao projeto `497006098858` (`daring-tracer-466614-v4`); ativar a API apenas em `curriculoautomatico-a15fa` não habilitava esse cliente.

## Verificação de destino

Regime de contratação ausente no anúncio não bloqueia a candidatura nem reduz a pontuação. “Não especificado” e equivalentes geram apenas um aviso de informação pendente. O filtro CLT/PJ continua rejeitando modalidades explicitamente incompatíveis; a mesma regra vale para formulários e e-mail, na busca, revisão e worker. Ausência de contratação não exige exceção individual.

A busca de destinos tenta reconhecer e-mail quando o anúncio fornece instrução explícita de envio. Na revisão de uma candidatura também há “Verificar e-mail de candidatura”. Não aceita endereço livre como destinatário. Confere cargo, empresa, instrução, um único endereço e confirmação desse endereço no domínio da empresa. A leitura pública bloqueia redes privadas e redirecionamentos inseguros. Codificação pública de endereços exibida pelo navegador é interpretada sem executar scripts. Publicações encerradas, destinatários ambíguos e contas gratuitas sem confirmação empresarial ficam pendentes.

O worker verifica novamente as páginas antes de enviar e compara o destinatário com o destino autorizado. A rotina geral mantém os filtros de contratação e publicação. Para uma vaga sem competências e experiência exigida informadas, o candidato pode autorizar uma exceção individual para contratação e data ausentes, com destino empresarial verificado. Ela vincula os dados da vaga e o currículo por 30 minutos e só permite envio com a autorização individual; mudança da vaga ou currículo invalida a exceção. Os demais impedimentos, limites e aprovação do currículo continuam obrigatórios.

## Resultado

O status Enviada exige resposta válida do Gmail com ID da mensagem. O histórico registra `email_provider_acceptance`: aceitação da mensagem pelo Gmail não confirma entrega à caixa de entrada, leitura ou participação aceita no processo seletivo. Interrupção depois do início do POST ou resposta sem ID produz Resultado desconhecido, sem repetição automática. Recusas explícitas voltam para revisão.

Uma recusa HTTP explícita do Gmail registra código e motivo sanitizado, sem tokens ou resposta bruta. Após corrigir a causa, uma nova autorização individual permite reutilizar a reserva da mesma candidatura. O histórico anterior permanece. Uma nova tentativa iniciada invalida a evidência de recusa anterior; resultado desconhecido e recibo confirmado continuam bloqueando repetições. A rotina geral não repete essas recusas automaticamente.

Se a exceção de dados ausentes vencer durante a correção, a página da vaga permite “Renovar revisão somente desta candidatura”. A renovação exige recusa explícita, o mesmo currículo aprovado, o mesmo destinatário e nova verificação pública. Não cria outra candidatura nem envia a mensagem; depois é preciso autorizar o envio individual na revisão.

Teste controlado de receptor comprova anexo, formato, resposta e falhas; não é uma candidatura real. O script `scripts/verify-email-destination.ts` verifica a publicação Rotha IA observada no Chrome, sem acessar conta, currículo ou enviar mensagem.

Referências: [envio pela Gmail API](https://developers.google.com/workspace/gmail/api/guides/sending), [escopos](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server).
