# Colocar o EmpreGatos em funcionamento

Os planos são mensais: Gratuito (5 candidaturas automáticas/dia), Essencial (R$ 20, 50/dia) e Pro (R$ 50, 100/dia). O código de cobrança está implementado; pagamentos reais exigem sua conta Stripe ativa, as credenciais do servidor e um webhook público.

**Atualização de 13/10/2026:** para o orçamento mínimo solicitado, o caminho principal agora é [hospedagem econômica com VM Oracle Always Free](HOSPEDAGEM-ECONOMICA.md), mantendo a Vercel. O Stripe de teste já tem produtos, preços, portal e webhook configurados. A opção Render paga abaixo permanece como alternativa.

## 1. Hospedagem e endereço público

A fila de buscas precisa de um processo permanente. Uma função Vercel sozinha não executa o agendamento nem consome a fila. Não publique a aplicação apenas como site estático.

O arquivo `render.yaml` configura um servidor permanente com PostgreSQL e disco privado para os currículos e as conexões. O mesmo processo executa as buscas e candidaturas. Não configure Redis nessa opção. A opção usa serviços pagos: confira os valores mostrados pelo Render antes de criar os recursos. Nada foi provisionado automaticamente.

1. Crie/acesso sua conta em https://dashboard.render.com/register.
2. Envie o código atualizado para o repositório GitHub existente. No Render, escolha **New > Blueprint** e conecte o repositório.
3. Configure `APP_ORIGIN` com o endereço HTTPS definitivo do site, sem caminhos. O Render fornece um endereço `https://…onrender.com`; você pode usar seu domínio próprio depois.
4. Gere uma chave fixa de 32 bytes para `ENCRYPTION_KEY` no computador e cole o resultado somente no painel privado de variáveis do servidor:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

5. Guarde essa chave com segurança e faça backup independente. Ao migrar os dados existentes, preserve a chave atual de `.data/encryption.key`, convertida para base64; uma chave diferente impede a leitura das conexões criptografadas.
6. Mantenha as credenciais ainda não obtidas vazias. Google e pagamentos ficam indisponíveis até a configuração; cadastro por senha e plano gratuito continuam funcionando.
7. Faça backup do banco e do disco. O banco contém dados pessoais; limite o acesso ao painel e ative autenticação de dois fatores nas contas administrativas.

### Manter o seu endereço atual na Vercel

O endereço público informado é **https://curriculoautomatico.vercel.app**. O código permite que a Vercel encaminhe `/api/*` para o servidor permanente. Nesse modelo, a API, o banco, os arquivos e a fila ficam no Render; o frontend e o endereço público continuam na Vercel.

1. No Render, configure `APP_ORIGIN=https://curriculoautomatico.vercel.app`.
2. Gere um segredo privado forte (`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`) e coloque o mesmo valor em `API_PROXY_SECRET` no Render e na Vercel. Ele autoriza apenas a passagem entre os servidores; não é uma chave Google ou Stripe.
3. No projeto **curriculoautomatico**, abra **Settings > Environment Variables** em https://vercel.com/dashboard. Configure `API_UPSTREAM_ORIGIN` com a URL HTTPS do backend fornecida pelo Render (sem caminhos) e `API_PROXY_SECRET` com o segredo acima. Selecione o ambiente **Production** e faça novo deploy.
4. No Render, configure `DATABASE_URL`, `ENCRYPTION_KEY` e as credenciais Google/Stripe. No modo de encaminhamento a Vercel não inicializa o banco, não guarda arquivos nem executa a fila. Não configure `API_UPSTREAM_ORIGIN` no próprio backend Render.
5. O callback do Google será **https://curriculoautomatico.vercel.app/api/auth/google/callback** e o webhook Stripe será **https://curriculoautomatico.vercel.app/api/billing/webhook**. Registre as URLs do domínio público, não as URLs diretas do backend protegido.
6. Verifique **https://curriculoautomatico.vercel.app/api/health**: deve retornar `status: ok`. Na verificação de 13/10/2026, a API publicada retornava HTTP 503. Configurar e publicar o backend é necessário para corrigir essa falha no site real.

Se usar funções Vercel sem o encaminhamento acima, será necessário um worker separado com PostgreSQL, Redis e armazenamento privado compartilhado; `/tmp` não preserva os arquivos. Não ative rotinas nessa topologia sem os serviços externos.

Novos arquivos de currículo ficam criptografados com AES-256-GCM no armazenamento privado. Arquivos antigos continuam legíveis para compatibilidade; não são automaticamente recriptografados. A chave fixa precisa ser preservada entre deploys.

## 2. Login Google para cada visitante

1. Crie um projeto em https://console.cloud.google.com/projectcreate.
2. Abra https://console.cloud.google.com/auth/overview e inicie a configuração do **Google Auth Platform**.
3. Em **Branding**, informe EmpreGatos, e-mail de suporte, página inicial e política de privacidade (`https://SEU-DOMINIO/privacy`).
4. Em **Audience/Público**, use **External/Externo**. Configure o aplicativo para produção quando disponibilizá-lo publicamente. Políticas do administrador podem impedir acesso de contas corporativas específicas.
5. Em **Data Access/Acesso a dados**, use somente `openid`, `email` e `profile`. O aplicativo não pede acesso ao Gmail nem ao Google Drive.
6. Em **Clients/Clientes**, crie um **Web application/Aplicativo da Web**.
7. Em **Authorized redirect URIs/URIs de redirecionamento autorizados**, adicione exatamente:

   ```text
   https://SEU-DOMINIO/api/auth/google/callback
   ```

8. No ambiente privado do servidor, configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` fornecidos pelo Google. `GOOGLE_REDIRECT_URI` pode ficar vazio, pois o código usa `APP_ORIGIN` com o caminho acima. Para desenvolvimento use um cliente separado com `http://127.0.0.1:5173/api/auth/google/callback`.
9. Reinicie/publique o serviço e teste com duas contas Google diferentes. Cada conta cria seu próprio espaço privado. Quem já tem cadastro por senha deve conectar o Google em **Minha conta**, usando o mesmo e-mail; isso evita vinculação indevida de contas.

O Google identifica a pessoa no EmpreGatos. A conexão com sites de emprego é independente.

## 3. Stripe: receber as assinaturas

1. Crie sua conta em https://dashboard.stripe.com/register. Preencha os dados do titular/empresa e a conta bancária no painel para receber pagamentos reais.
2. Comece em um **sandbox/ambiente de teste**. Crie dois produtos no catálogo em https://dashboard.stripe.com/products:
   - **EmpreGatos Essencial**: preço recorrente **R$ 20,00 BRL por mês**.
   - **EmpreGatos Pro**: preço recorrente **R$ 50,00 BRL por mês**.
3. Copie os IDs dos preços (`price_…`), não os IDs dos produtos. Configure `STRIPE_PRICE_PLUS` e `STRIPE_PRICE_PRO` no servidor.
4. Em https://dashboard.stripe.com/apikeys, obtenha a chave secreta do ambiente selecionado e configure `STRIPE_SECRET_KEY`. Não a coloque no frontend, no Git ou no chat.
5. Em https://dashboard.stripe.com/webhooks, crie um destino de eventos **da sua conta**, com payload completo (snapshot), para:

   ```text
   https://SEU-DOMINIO/api/billing/webhook
   ```

6. Selecione os eventos:

   ```text
   checkout.session.completed
   checkout.session.async_payment_succeeded
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.paid
   invoice.payment_failed
   invoice.payment_action_required
   ```

7. Copie o segredo de assinatura do destino (`whsec_…`) e configure `STRIPE_WEBHOOK_SECRET` no servidor. O segredo do Stripe CLI é diferente do segredo do destino público.
8. Ative o portal em https://dashboard.stripe.com/settings/billing/portal. Permita cancelamento no fim do período, atualização de cartão e consulta de faturas. Para troca de plano, inclua somente os produtos e preços acima, sem alterar a quantidade (uma assinatura por pessoa).
9. Reinicie o serviço. Em **Minha conta**, assine um plano em teste e confira a atualização da cota depois da confirmação do webhook. Teste renovação, falha e cancelamento.
10. Para pagamentos reais, repita produtos, preços, webhook e portal em **modo real** e substitua todas as variáveis pelas credenciais reais correspondentes. Preços e segredos de teste não servem no modo real. Faça a validação de cobrança antes de oferecer os planos.

O cartão é informado diretamente no checkout hospedado pelo Stripe. O EmpreGatos não recebe nem armazena os números do cartão. Abrir a página de sucesso não libera um plano: o servidor valida a assinatura do webhook, consulta a assinatura atual e exige fatura paga. Eventos duplicados não são processados novamente. Assinatura vencida ou com pagamento pendente volta à cota gratuita.

## 4. Busca e envio automático

A Gupy consulta anúncios públicos. InfoJobs/Glassdoor dependem da busca externa configurada; LinkedIn exige acesso de busca autorizado. Prefira selecionar fontes cuja busca esteja disponível na entrevista.

Para envio efetivo, configure uma integração autorizada do empregador/parceiro:

```dotenv
APPLICATION_WEBHOOK_URL=https://INTEGRACAO-AUTORIZADA/applications
APPLICATION_WEBHOOK_TOKEN=SEGREDO-PRIVADO
APPLICATION_WEBHOOK_AUTHORIZED=true
APPLICATION_WEBHOOK_PORTALS=gupy
```

Isso deve apontar para um serviço real que envie a candidatura e devolva `{ "status": "sent", "receipt": "…" }`. Não use a URL do próprio EmpreGatos e não invente um endpoint. Alternativamente, as conexões por navegador exigem autorização do provedor e Chromium instalado no servidor; o Blueprint padrão não habilita esses adaptadores.

Sem essa integração, a busca e a preparação funcionam, mas os envios ficam manuais. Não é possível tornar todas as candidaturas automáticas apenas criando uma conta Google ou Stripe. Captchas, perguntas e restrições dos portais podem exigir intervenção.

O limite é verificado no servidor a cada tentativa e segue America/Sao_Paulo. Envios concorrentes reservam cota atomicamente; a reserva persiste mesmo quando o histórico é alterado. Resultado desconhecido não dispara reenvio automático. No painel, confira currículo aprovado, preferências concluídas, fonte disponível, rotina ativa e os avisos de conexão.

## Referências oficiais

- Google: https://developers.google.com/identity/openid-connect/openid-connect
- Público e publicação Google: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
- Assinaturas Stripe: https://docs.stripe.com/billing/subscriptions/overview
- Webhooks Stripe: https://docs.stripe.com/webhooks
- Portal Stripe: https://docs.stripe.com/customer-management
- Blueprints Render: https://render.com/docs/infrastructure-as-code
