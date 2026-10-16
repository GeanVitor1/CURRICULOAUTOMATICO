# Firestore na Vercel

A instalação usa o projeto `curriculoautomatico-a15fa`, banco `(default)`,
Firestore **Standard**, região `southamerica-east1` (São Paulo), no plano Spark.
O frontend e os workers continuam na Vercel. PostgreSQL/PGlite permanecem como
alternativas para desenvolvimento e para a suíte de regressão.

## Acesso do servidor

Em Production, defina `DATABASE_PROVIDER=firestore`, `FIREBASE_PROJECT_ID`,
`GCP_WORKLOAD_IDENTITY_AUDIENCE` e `GCP_SERVICE_ACCOUNT_EMAIL`. O audience é
`//iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`.

A Vercel emite um token OIDC temporário. O Google troca esse token por acesso da
conta de serviço `empregatos-vercel-db`, com `roles/datastore.user`. A confiança
restringe equipe, projeto e ambiente Production. Não existe chave JSON de conta
de serviço nem token pessoal do Firebase nas variáveis de produção. Previews não
recebem acesso ao banco de produção automaticamente.

O login Google do aplicativo continua usando o cliente OAuth existente. Ele não
foi substituído por Firebase Authentication. `ENCRYPTION_KEY` continua obrigatória
e deve permanecer estável entre deploys.

## Modelo e consumo

As coleções correspondem às entidades em `server/schema.ts`. `server/storage-types.ts`
define operações explícitas e `server/storage-firestore.ts` executa consultas
nativas e transações do Firestore. O adaptador PostgreSQL atende aos testes locais.
Quando Firestore está selecionado, nenhuma conexão PostgreSQL ou migration SQL é
iniciada, mesmo que uma variável legada `DATABASE_URL` ainda exista.

- Contas, sessões e desafios OAuth usam documentos pequenos. Marcadores únicos
  impedem duplicidade de e-mail, identidade Google e assinatura em transações.
- Workspaces mantêm revisões e projeções pequenas para rotina, conexões, currículo
  atual e consumo diário. Consultas de status usam máscaras de campos, sem baixar
  análise de currículo, vagas ou arquivos originais.
- Conteúdos grandes são comprimidos. Acima de 512 KiB comprimidos, usam blocos
  privados de até 512 KiB, com checksum e manifesto. Arquivos originais continuam
  criptografados e só são lidos para download ou envio. O limite de upload é 5 MiB.
- Transações preservam reservas diárias, propriedade das tarefas e idempotência
  das candidaturas. O contador diário evita reler todo o histórico a cada envio.
- Blocos substituídos ou excluídos têm uma tarefa de limpeza persistida na mesma
  transação. A limpeza roda após o commit e é retomada no health check se falhar.
- Não há polling de workspace completo quando a página está parada. As correções
  anteriores de cache, revisão e separação dos originais foram mantidas.

`firestore.rules` bloqueia todo acesso direto por clientes, inclusive autenticados.
O servidor autentica sessões, valida os dados e limita cada operação à conta.
As regras de cliente não substituem essas verificações do servidor nem o IAM.
Os índices e as exclusões de campos grandes estão em `firestore.indexes.json`.

Publique regras e índices com:

```powershell
npx --yes --package=firebase-tools@latest --package=@grpc/grpc-js firebase deploy --only firestore --project curriculoautomatico-a15fa
```

Espere os índices ficarem `READY` antes de habilitar consultas dependentes deles.
Não habilite billing/Blaze para resolver um erro de configuração desta instalação.
Spark continua sujeito a cotas; reduzir leituras e transferência não elimina limites.
Consulte [cotas oficiais](https://firebase.google.com/docs/firestore/quotas).

## Validação

`npm test` executa a regressão local e não acessa Firebase por padrão.
`tests/firestore.integration.test.ts` exige opt-in com um access token temporário
local e o ID exato do projeto de teste. Cria apenas contas QA descartáveis, testa
API, arquivos, concorrência, filas e exclusão; não envia candidaturas reais.
Não coloque esse token no código, no frontend ou na Vercel.

Para desenvolvimento manual, use ADC local ou o emulador (`FIRESTORE_EMULATOR_HOST`).
Depois do deploy, confirme `/api/health` com `database: "Cloud Firestore"`, o início
do OAuth Google, cadastro/login e persistência de upload/download entre instâncias.

Nesta troca, as contas e currículos de teste do Neon não são importados. Sessões
anteriores expiram; o usuário entra/cria sua conta novamente. Conexões de portais e
preferências precisam ser refeitas no novo espaço. Recursos exclusivos vinculados
ao ID antigo, como `ANTIGRAVITY_OWNER_ID`, exigem atualizar o vínculo administrativo
para o ID da conta verificada no banco novo.

Referências: [Firestore](https://firebase.google.com/docs/firestore),
[Vercel OIDC com Google Cloud](https://vercel.com/docs/oidc/gcp).
