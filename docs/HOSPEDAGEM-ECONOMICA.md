# Hospedagem com custo mínimo — pesquisa de 13/10/2026

A página já está hospedada em https://curriculoautomatico.vercel.app. A API retornava HTTP 503 nesta sessão. O site publicado e o servidor que executa as buscas são partes diferentes: a Vercel continua servindo as telas; um backend permanente precisa guardar os dados, receber pagamentos e executar a fila.

## Opções verificadas

| Opção | Memória | Armazenamento | Custo e adequação |
|---|---:|---:|---|
| Oracle Always Free Ampere A1 | Até 12 GB / 2 OCPUs totais, conforme a documentação atual | Até 200 GB entre discos de inicialização e volumes | Sem mensalidade dentro das cotas elegíveis. Melhor capacidade entre estas opções; depende de vagas na região. Máquinas ociosas podem ser retomadas. |
| Google Compute Engine e2-micro | 1 GiB | 30 GB de disco persistente **standard** nas regiões elegíveis dos EUA | CPU/disco podem ficar no Free Tier. IPv4 público em uso custa US$ 0,005/h: cerca de US$ 3,60 em 30 dias, antes de tráfego excedente e impostos. Não equivale a hospedagem totalmente gratuita. |
| Render Free | 512 MB | Arquivos locais efêmeros | Dorme após inatividade e não aceita disco persistente. Não atende sozinho a uma rotina diária permanente com currículos armazenados em arquivo. O banco gratuito expira em 30 dias. |

Escolha preparada: **Oracle Always Free**, mantendo o frontend na Vercel. A oferta de 24 GB aparece em materiais antigos; a documentação de recursos Always Free consultada nesta data informa **12 GB e 2 OCPUs**. Confirme os limites efetivos no seu painel. Nenhum servidor foi criado e nenhuma hospedagem paga foi contratada.

Fontes oficiais:

- Oracle: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Google Free Tier: https://docs.cloud.google.com/free/docs/free-cloud-features
- Google IPv4: https://cloud.google.com/vpc/network-pricing
- Google e2-micro: https://cloud.google.com/products/compute/pricing/general-purpose
- Render Free: https://render.com/docs/free

## 1. Criar a máquina Oracle

Antes de criar recursos, confirmar que a conta permanece Free Tier e revisar [ORACLE-CONTROLE-DE-CUSTOS.md](ORACLE-CONTROLE-DE-CUSTOS.md). O usuário já criou a conta; o painel informou provisionamento em andamento. As regras de cotas foram preparadas, mas ainda não aplicadas.

1. Abra https://signup.cloud.oracle.com/. O cadastro e a verificação do titular são feitos por você.
2. Escolha a região principal da conta com cuidado: os recursos Always Free precisam estar nessa região. Prefira uma região próxima aos usuários quando houver disponibilidade.
3. Em **Compute > Instances > Create instance**, selecione imagem **Ubuntu** e tipo **VM.Standard.A1.Flex**, com selo **Always Free Eligible**.
4. Use no máximo **2 OCPUs e 12 GB de RAM** no total das máquinas A1 da conta. Confirme preço e elegibilidade no painel. Não selecione uma máquina paga como alternativa automática se aparecer falta de capacidade.
5. Reserve inicialmente 50 GB de disco, ou aumente dentro da cota total gratuita de 200 GB. Todo disco/volume da conta conta nessa soma.
6. Salve a chave SSH privada e o endereço IP público. Use uma rede pública. Libere entrada HTTP/HTTPS nas portas **80 e 443**; restrinja SSH **22** ao seu IP. Não abra PostgreSQL **5432** nem a API **3001** à internet.
7. Se aparecer **out of host capacity**, tente outro domínio de disponibilidade da mesma região ou aguarde. A disponibilidade da oferta não foi verificada dentro da sua conta.

Faça backup fora da VM: recursos gratuitos podem ser retomados por ociosidade e os limites de armazenamento não substituem backups.

## 2. Backend preparado para VM

Arquivos: `Dockerfile`, `compose.production.yaml` e `deploy/Caddyfile`. O container publica somente a API e a automação; imagens, vídeos e arquivos do frontend ficam na Vercel. A execução usa um único processo Node para API/fila/agendamento, PostgreSQL local e Caddy para HTTPS, com dados em volumes persistentes. Redis e Chromium não são instalados nessa opção; integrações de navegador continuam dependentes de autorização e infraestrutura própria.

1. Gere o arquivo privado, preservando as credenciais já configuradas:

   ```powershell
   npm run configure:vm
   ```

   Ele cria `.env.production.local`, fora do Git, sem imprimir chaves. Google ainda precisa do cliente OAuth. Stripe de teste já foi configurado nesta sessão.

2. Configure um hostname público do backend que resolva para o IP da VM. Pode ser um subdomínio seu; para um teste inicial, um serviço DNS por IP como `sslip.io` permite usar `api.SEUSERVERIP.sslip.io`. Substitua pelo endereço real, confirme a resolução e a disponibilidade desse serviço externo. Não use o endereço da Vercel como hostname do backend.

   ```powershell
   npm run configure:vm -- --hostname api.SEUSERVERIP.sslip.io
   ```

3. Na VM, instale Docker Engine e Compose seguindo https://docs.docker.com/engine/install/ubuntu/.
4. Clone o repositório e transfira `.env.production.local` por SSH/SCP diretamente para a máquina. Nunca envie o arquivo ao Git. Restrinja a permissão do arquivo a `600`.
5. Na pasta do projeto, execute:

   ```sh
   docker compose --env-file .env.production.local -f compose.production.yaml up -d --build
   ```

6. Confira `docker compose --env-file .env.production.local -f compose.production.yaml ps` e a saúde do banco/API. Caddy obtém e renova certificados automaticamente quando o hostname resolve para a VM e 80/443 estão liberadas.
7. No projeto Vercel, configure `API_UPSTREAM_ORIGIN=https://HOSTNAME-DO-BACKEND` e `API_PROXY_SECRET` com o mesmo segredo do arquivo privado. Faça novo deploy. A integração Vercel sugerida nesta conversa pode permitir configurar esses campos e consultar logs depois de conectada.
8. Verifique https://curriculoautomatico.vercel.app/api/health: precisa retornar HTTP 200 e `status: ok`.

Não execute `docker compose down -v` no servidor de produção: isso remove os volumes dos dados. Atualizações comuns usam `git pull` e `up -d --build`, preservando volumes. Se houver dados anteriores no banco/arquivos, faça uma migração antes de trocar o backend; criar essa instalação não importa automaticamente os dados anteriores.

## 3. Google no projeto criado

Projeto informado: **My First Project**, ID `daring-tracer-466614-v4`, número `497006098858`. Esses identificadores não substituem o cliente OAuth e seu segredo.

1. Abra https://console.cloud.google.com/auth/overview?project=daring-tracer-466614-v4.
2. Em Branding, informe EmpreGatos e seu e-mail de suporte. Em Audience, use **External/Externo**. Os escopos usados são somente `openid`, `email` e `profile`.
   Para o lançamento público, use o status **In production/Em produção** em Audience. O Google documenta uma exceção para esses escopos básicos: mesmo em Testing, eles não exigem inclusão individual na lista de usuários de teste. Contas de organizações podem ter restrições definidas pelo administrador. Referência: https://support.google.com/cloud/answer/15549945.
3. Abra https://console.cloud.google.com/auth/clients?project=daring-tracer-466614-v4 e crie um cliente **Aplicativo da Web**.
4. Cadastre exatamente `https://curriculoautomatico.vercel.app/api/auth/google/callback` nos retornos autorizados.
5. Baixe o JSON e salve como `google-client.local.json` na pasta deste projeto. Para importar no ambiente privado de produção:

   ```powershell
   npm run configure:google -- google-client.local.json --output-env .env.production.local --origin https://curriculoautomatico.vercel.app
   ```

6. Transfira o ambiente atualizado para a VM e reinicie o serviço API. O cliente de produção não altera o ambiente local de desenvolvimento.

## 4. Stripe de teste já configurado

Dois produtos com preços mensais BRL, portal de assinatura e webhook foram criados na conta Stripe usando a chave de teste fornecida. Chave da API e segredo do webhook ficaram apenas nos arquivos privados `.env` e `.env.production.local`.

O checkout e o portal foram verificados contra o sandbox real Stripe; nenhum cartão foi inserido e nenhum pagamento foi feito. As contas temporárias dessa verificação foram removidas. O webhook público ainda depende da API estar funcionando.

Para receber dinheiro real, conclua a ativação da conta em https://dashboard.stripe.com/account/onboarding, configure credenciais de produção e crie os recursos correspondentes no modo real. Credenciais `sk_test_…` não movimentam dinheiro real. O helper `configure:stripe` desta entrega aceita somente modo de teste.
