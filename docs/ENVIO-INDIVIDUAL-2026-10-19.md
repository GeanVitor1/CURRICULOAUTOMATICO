# Envio individual — 19/10/2026

## Fluxo implementado

Em **Candidaturas**, abra uma preparação e consulte **Enviar esta candidatura**.
O servidor verifica a aprovação do currículo, o perfil, as preferências, a
compatibilidade da vaga, o destino disponível, o histórico e o limite diário.
Os impedimentos aparecem antes da autorização. **Verificar destinos** também
está disponível para vagas que ainda não passaram pela resolução.

Quando elegível, a pessoa revisa o nome do currículo e a URL do destino, marca
a confirmação e autoriza uma tentativa. A autorização fica vinculada ao ID do
arquivo, à URL e ao método de envio por 30 minutos. Mudanças no destino ou no
currículo exigem nova revisão. O arquivo original continua sendo carregado
somente no servidor, durante o processamento.

Esse envio funciona com a rotina geral pausada e não ativa outras candidaturas.
A pessoa pode cancelar antes de o processamento começar. O cancelamento também
impede que uma ativação posterior da rotina recoloque essa autorização na fila;
uma nova autorização explícita continua possível antes da primeira tentativa.

O processamento usa os consumidores existentes e a reserva de uso por conta.
Entregas repetidas, cliques repetidos e tentativas concorrentes não autorizam
reenviar a mesma candidatura. Tentativas já iniciadas ou com resultado
desconhecido continuam exigindo conferência no destino. Uma autorização
individual não permite repetir uma tentativa anterior.

Na Vercel, a API persiste a autorização e publica na fila de submissões; a
Function processa a candidatura. No servidor permanente, o worker recupera as
autorizações pendentes a cada 30 segundos. PostgreSQL/PGlite e Firestore mantêm
os dados no documento da conta; não há migration SQL adicional. A recuperação
local consulta apenas IDs de contas com envios individuais pendentes.

## API

- `GET /api/applications/:appId/readiness`: motivos de bloqueio e currículo/destino a revisar.
- `POST /api/applications/:appId/send`: exige `confirmation: true`, `resumeId`,
  `destinationUrl` e `method`, correspondentes à revisão atual.
- `DELETE /api/applications/:appId/send`: cancela antes do início.

As rotas usam a autenticação, o isolamento por conta e a proteção CSRF existentes.
A autorização fica no histórico. **Enviada** exige confirmação do receptor;
a autorização e a entrada na fila não são apresentadas como recebimento.

## Verificação reproduzível

```powershell
npm run build
npm run verify:single-submission
```

O verificador usa navegador real, API real, banco PGlite temporário, consumidor
real e receptor HTTP local controlado. Não carrega os arquivos privados de
ambiente da instalação. Usa pessoa, empresa e currículo fictícios. Confere
igualdade do DOCX recebido, um único recebimento, outra candidatura pendente,
rotina geral pausada, recibo na interface e ausência de erros JavaScript.

Evidências: `artifacts/single-submission-verification.json` e capturas mobile
em `artifacts/single-submission-review-mobile.png` e
`artifacts/single-submission-mobile.png`. Esse ensaio não usa o transporte
Vercel Queues nem comprova envio a empregador real.

## Condições que continuam necessárias

Validação local: build e TypeScript aprovados; suíte geral com 438 testes
aprovados e 11 ignorados; após acrescentar os últimos cenários, os 27 testes
focados em envio individual, despacho e consumidor passaram. Os oito cenários
Playwright de candidaturas assistidas e integração da interface também passaram.
O verificador completo registrou um recebimento, arquivo original idêntico,
rotina pausada, outra candidatura pendente e zero erros JavaScript. As mudanças
desta etapa não foram publicadas em produção. Firestore real e transporte
Vercel Queues não foram revalidados nesta etapa.

O recurso usa apenas integrações de envio já configuradas: gateway autorizado,
sessão válida de portal habilitado ou destino independente verificado e
autorizado. Não altera as permissões de fornecedores nem configura credenciais.
Pandapé e Workday continuam assistidos. Contas, formulários e confirmações reais
precisam de validação individual antes de ampliar a cobertura do produto.
