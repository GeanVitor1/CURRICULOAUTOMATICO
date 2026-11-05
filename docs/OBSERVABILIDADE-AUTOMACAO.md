# Observabilidade operacional da automação

O diagnóstico de produção usa `GET /api/internal/automation-diagnostics`. O backend lê o Firestore com a identidade OIDC já configurada na Vercel. A consulta local não recebe acesso ao banco e não depende da sessão Firebase CLI.

## Consulta

Execute no diretório do projeto:

```powershell
node scripts/observe-production-automation.mjs --day=2026-10-26
```

A credencial fica em `.data/automation-observer-private.json`, ignorado por Git e pelo deploy. Não copie seu conteúdo para chat, logs ou arquivos públicos. O script envia a chave somente em cabeçalho HTTPS para o domínio de produção fixado e recusa redirecionamentos. Cada execução salva um novo artefato, sem sobrescrever anteriores.

A produção conserva somente o SHA-256 da chave e o ID de um workspace autorizado, em variáveis cifradas de Production. A API usa comparação de tempo constante, limita a frequência e retorna `Cache-Control: no-store`. Uma chave ausente/incorreta recebe 401. Um parâmetro `workspaceId` não muda o escopo.

A chave não autentica uma sessão do candidato e não autoriza mutações, cron, reprocessamento, leitura de arquivos originais, perfil, contatos, tokens OAuth ou recibos em texto. Não foi acrescentado grant IAM. O acesso do runtime ao banco continua usando a federação OIDC existente.

## Rotação e revogação

Com a autorização operacional existente da Vercel:

```powershell
node scripts/configure-automation-observer.mjs --workspace=ID-EXATO:live --rotate
```

Publique a configuração para ativar a rotação no alias de produção. Para desabilitar a rota, remova `AUTOMATION_OBSERVER_KEY_SHA256` e publique. A revogação vale para o deployment atualizado; deployments antigos devem continuar protegidos pela política da Vercel e precisam ser considerados em uma revogação por comprometimento. Não torne URLs antigas públicas para diagnóstico.

O comando de configuração usa a credencial Vercel já existente, nunca solicita acesso adicional ao Google e não imprime a chave. A consulta diária não precisa dessa credencial Vercel: usa apenas a chave restrita do observador.

## Dados disponíveis e limites

- Execuções por dia de Brasília, tarefas de descoberta/resolução, leases expiradas e sinalização de erro persistido.
- Estado pendente/em envio da submissão, tentativas, resultados, reconciliações, hashes de recibos e reservas do dia.
- Totais calculados pela mesma regra de confirmação do histórico e contagens equivalentes às do painel.
- Eventos dos três consumidores de fila: recebimento, conclusão ou falha, ID de mensagem, entrega, tarefa/candidatura, deployment e revisão.

Os eventos mantêm os últimos 200 registros por workspace. Eles começam no deployment instrumentado; não recuperam mensagens antigas. `completed` significa conclusão do callback do worker, não candidatura recebida. Tentativas da tarefa e entregas da fila são medidas diferentes.

Uma falha ao persistir telemetria é registrada no log sem repetir uma transmissão. O resultado da candidatura e as claims existentes continuam sendo a autoridade para idempotência. A rotina não depende de manter o painel ou o computador local abertos.
