# Login Google público na Vercel

O login usa as credenciais do **site**, configuradas uma vez no servidor. Cada visitante escolhe a própria conta Google. Ninguém precisa instalar o projeto, configurar `.env` ou obter uma chave no seu computador.

## 1. Preparar o Google Cloud

1. Crie um cliente OAuth do tipo **Aplicativo da Web** no [Google Auth Platform](https://console.cloud.google.com/auth/overview).
2. Em **Audience**, escolha **External**. Para o lançamento público, publique o aplicativo em **In production**. Aplicativos internos restringem o acesso à organização. Contas corporativas ainda podem ter restrições definidas pelos seus administradores.
3. Configure o nome do aplicativo, contato de suporte e os dados públicos exigidos pelo Google.
4. Em **Clients**, cadastre a origem pública, por exemplo `https://seu-projeto.vercel.app`.
5. Cadastre este **URI de redirecionamento autorizado**, com o domínio real:

   ```text
   https://seu-projeto.vercel.app/api/auth/google/callback
   ```

O domínio, protocolo e caminho precisam ser exatamente iguais aos do callback enviado pelo servidor. Ao mudar para um domínio próprio, atualize também o cliente OAuth. Use clientes separados para desenvolvimento e produção. O fluxo solicita somente `openid email profile`, sem permissões de Gmail, Drive ou dados de outros serviços.

## 2. Preparar a Vercel

Importe o repositório com o preset **Vite**. O `vercel.json` já define `npm run build`, a pasta `dist`, a função Node `api/server.mjs` e as rotas. Selecione uma versão Node.js compatível com o projeto (22.12+).

Em **Settings → Environment Variables**, configure estas variáveis no ambiente **Production**:

| Variável | Valor |
| --- | --- |
| `APP_ORIGIN` | `https://seu-projeto.vercel.app` ou seu domínio próprio, sem caminho |
| `GOOGLE_CLIENT_ID` | ID do cliente OAuth Web de produção |
| `GOOGLE_CLIENT_SECRET` | Segredo desse cliente, somente no servidor |
| `DATABASE_URL` | Conexão PostgreSQL externa, preferencialmente com pool e TLS |
| `ENCRYPTION_KEY` | Chave fixa de 32 bytes em base64, preservada entre deploys |
| `NODE_ENV` | `production` |

Para gerar a chave, execute uma vez e guarde o resultado nas variáveis privadas da Vercel:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

`GOOGLE_REDIRECT_URI` pode ficar sem definição: o servidor deriva `/api/auth/google/callback` de `APP_ORIGIN`. Se for definida explicitamente, deve usar uma das origens de `APP_ORIGIN` e o caminho exato. Se `APP_ORIGIN` não estiver definida e as variáveis de sistema estiverem habilitadas, o domínio de produção vem de `VERCEL_PROJECT_PRODUCTION_URL`. Recomenda-se definir `APP_ORIGIN` para manter o endereço OAuth estável.

Não use prefixo `VITE_` para segredos. Não copie o `.env` de desenvolvimento para produção. A função usa `/tmp` apenas para arquivos temporários; contas, sessões e desafios Google ficam no PostgreSQL. Sem `DATABASE_URL` ou sem chave de criptografia estável, a API recusa iniciar na Vercel. As migrations SQL são incluídas na função e aplicadas sob um lock PostgreSQL para impedir conflito entre inicializações simultâneas.

Faça um novo deploy depois de alterar as variáveis. Para acesso público, confira também as configurações de proteção do deployment na Vercel. Configure as credenciais somente em **Production**. Previews exigem um cliente e callback próprios; não são automaticamente autorizados pelo Google.

## 3. Validar depois do deploy

1. Abra `https://seu-projeto.vercel.app/api/health`: deve responder HTTP 200.
2. Abra `/api/auth/providers`: deve informar `google: true` e uma `googleSignInUrl` com o domínio público.
3. Em uma janela privada, abra `/login` e use **Continuar com Google** com uma conta que ainda não existe no EmpreGatos. O retorno deve abrir `/app` e criar a conta automaticamente.
4. Feche a sessão, abra outro navegador ou computador e entre novamente com a mesma conta Google. O espaço da conta deve continuar disponível.
5. Uma conta que já usa senha com o mesmo e-mail precisa entrar com a senha e vincular o Google em **Minha conta** uma vez. Depois, pode entrar pelo Google em qualquer computador.

Cookies de sessão e do desafio são `HttpOnly`, `Secure` e `SameSite=Lax` em produção. O estado OAuth pertence ao navegador que iniciou o acesso, mas fica no banco compartilhado: o callback pode ser atendido por outra instância da API. O servidor valida assinatura, emissor, audiência, validade, nonce e e-mail verificado. A identidade permanente é o `sub` do Google.

## Limites das outras funções do aplicativo

A integração da Vercel adicionada aqui atende a API e o login. Ela não inicia os workers de busca/candidaturas. Essas rotinas precisam de um serviço Node persistente com PostgreSQL/Redis. Os uploads de currículo, as conexões LinkedIn e as sessões dos portais ainda usam arquivos no servidor; antes de oferecer esses recursos na Vercel, migre-os para armazenamento persistente privado ou hospede a API completa em um serviço com volume persistente. `/tmp` não preserva esses arquivos entre instâncias/deploys.

## Referências

- [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect)
- [Audience e publicação do aplicativo Google](https://support.google.com/cloud/answer/15549945?hl=en)
- [Variáveis de sistema da Vercel](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Funções Node.js da Vercel](https://vercel.com/docs/functions/runtimes/node-js)
