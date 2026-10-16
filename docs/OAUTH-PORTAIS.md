# Conexões oficiais dos portais

Pesquisa e implementação em 16/10/2026. OAuth conecta somente os recursos que
o provedor autorizou. A conexão de identidade e o envio de candidaturas são
capacidades independentes no EmpreGatos.

| Portal | Integração encontrada | Entrega no projeto |
|---|---|---|
| LinkedIn | OAuth 2.0 / OpenID Connect, `openid profile email` | Conexão oficial em popup no navegador da pessoa; perfil verificado por `userinfo`. Permissões de identidade não habilitam candidaturas. |
| InfoJobs.net | OAuth de candidatos; API com perfil, currículo e candidaturas | Conector independente `infojobs-es`, limitado ao perfil `candidate_profile_with_email`. Identificado como **InfoJobs Espanha**. Não conectado às vagas, à conta ou aos envios do InfoJobs Brasil. |
| InfoJobs Brasil | Cobertura da API espanhola não confirmada | Continua separado. Não há redirecionamento automático da conta brasileira para um OAuth espanhol. |
| Gupy | API com Bearer Token de empresa/parceiro, incluindo Quick Apply | Não foi encontrado OAuth público de conta de candidato. Não foi criado um OAuth fictício. |
| Glassdoor | Não foi localizado OAuth público de conta de candidato nesta pesquisa | O navegador remoto continua separado. A conexão oficial depende de documentação e credenciais disponibilizadas pelo portal. |

## Ativar LinkedIn

1. Cadastrar o aplicativo em [LinkedIn Developers](https://www.linkedin.com/developers/apps).
2. Solicitar o produto **Sign In with LinkedIn using OpenID Connect**.
3. Cadastrar o endereço de retorno:
   `https://curriculoautomatico.vercel.app/api/oauth/linkedin/callback`.
4. Configurar no servidor/Vercel:
   - `LINKEDIN_CLIENT_ID`: identificador do aplicativo.
   - `LINKEDIN_CLIENT_SECRET`: segredo do aplicativo, somente no servidor.
   - `LINKEDIN_REDIRECT_URI`: endereço acima, exatamente igual ao cadastrado.
5. Publicar uma versão com essas configurações. O botão **Conectar LinkedIn**
   abre a autorização oficial. Só o retorno validado registra a conta conectada.

Os produtos de recrutamento do LinkedIn têm requisitos próprios. O login
OpenID Connect não concede acesso a Easy Apply nem representa uma integração
de envio de currículos. O Apply Connect documentado atende integrações ATS;
não foi tratado como uma API universal para candidatar usuários a qualquer vaga.

## Ativar InfoJobs Espanha, se houver interesse nesse mercado

1. Acessar [InfoJobs Developer](https://developer.infojobs.net/) com uma conta
   compatível e registrar o aplicativo para obter suas credenciais.
2. Cadastrar:
   `https://curriculoautomatico.vercel.app/api/oauth/infojobs-es/callback`.
3. Configurar `INFOJOBS_ES_CLIENT_ID`, `INFOJOBS_ES_CLIENT_SECRET` e
   `INFOJOBS_ES_REDIRECT_URI` no servidor/Vercel e publicar.
4. No painel, abrir **Contas dos sites → InfoJobs Espanha — conexão oficial
   opcional**. O consentimento ocorre em `www.infojobs.net`, no navegador local.

Endpoints fixos da documentação: autorização em
`https://www.infojobs.net/api/oauth/user-authorize/index.xhtml`, troca do código
em `https://www.infojobs.net/oauth/authorize` e confirmação de conta em
`https://api.infojobs.net/api/6/candidate`. A chamada de perfil usa autenticação
Basic do aplicativo combinada com Bearer do candidato, conforme a documentação.
O conector não pede `my_applications`, não envia candidaturas nem cria conta.
Tokens da API espanhola ficam cifrados e privados; não são retornados ao cliente
ou incluídos na exportação. Renovação automática desses tokens não foi ligada
a nenhum worker. A expiração aparece como necessidade de reconectar.

Não basta trocar `.net` por `.com.br`. Para incluir o Brasil, são necessários
os endpoints, credenciais e escopos que o InfoJobs confirme para esse mercado.

## Persistência e segurança

- Estado aleatório de 256 bits, ligado ao usuário e ao provedor, com validade
  de 10 minutos e consumo transacional de uso único no banco compartilhado.
- Novo início invalida o retorno anterior. Desconexão durante a troca do código
  impede que uma resposta atrasada restaure a conexão removida.
- Callback limitado às origens do aplicativo em `APP_ORIGIN`, sem redirecionamento
  para domínios arbitrários. Códigos, tokens e respostas do provedor não aparecem
  no HTML de sucesso/erro nem em mensagens ao navegador.
- Contas e autorizações usam coleções privadas `portal_oauth_accounts` e
  `portal_oauth_states` no Firestore. Clientes continuam sem acesso direto.
  Conteúdo privado fica cifrado com AES-256-GCM e `ENCRYPTION_KEY` estável.
- No PostgreSQL/local, a migração `0009_portal_oauth.sql` cria as mesmas entidades.
- No máximo um estado pendente e uma conexão por pessoa/provedor. O início de
  conexão não varre o banco nem regrava o currículo. Exclusão da conta remove
  os registros dependentes. O conector antigo em arquivos temporários deixou
  de ser usado; conexões antigas precisam de nova autorização.
- LinkedIn descarta seus tokens após verificar o perfil, persistindo apenas
  metadados cifrados. Não transforma essa identidade em sessão de navegador.

Na inspeção da Vercel, os identificadores e segredos desses aplicativos ainda
não estavam configurados. A implementação pode ser publicada e testada com
provedores simulados; autenticação real depende do cadastro dos aplicativos.
Não colocar segredos no Git, em variáveis `VITE_*` ou no chat.

## Fontes oficiais

- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Permissões LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [LinkedIn Apply Connect](https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/apply-connect-overview)
- [InfoJobs OAuth](https://developer.infojobs.net/documentation/user-oauth2/index.xhtml)
- [InfoJobs autenticação do aplicativo](https://developer.infojobs.net/documentation/app-auth/index.xhtml)
- [InfoJobs perfil de candidato](https://developer.infojobs.net/documentation/operation/candidate-get-6.xhtml)
- [InfoJobs candidaturas](https://developer.infojobs.net/documentation/operation/offer-application-post-1.xhtml)
- [Gupy captação externa](https://developers.gupy.io/docs/fluxo-de-capta%C3%A7%C3%A3o-de-pessoas-candidatas-em-plataformas-externas)
