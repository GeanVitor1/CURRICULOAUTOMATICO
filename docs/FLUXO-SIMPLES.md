# Fluxo simples de currículo e automação — 09/10/2026

> Atualização: capacidades, OAuth, autorizações por provedor e estados de envio foram revisados em [REDESIGN-E-INTEGRACOES-2026-10-09.md](REDESIGN-E-INTEGRACOES-2026-10-09.md). As validações abaixo são o histórico da implementação anterior; navegador não fica habilitado sem permissão do serviço.

## Experiência da pessoa

A navegação principal tem quatro abas: Automação, Currículo, Preferências e Candidaturas. Vagas encontradas é acessada pela automação. Minha conta é uma ação secundária para dados pessoais. Os antigos destinos de perfil, radar e análises são redirecionados; o fluxo não apresenta telas de fontes, provedores, métricas técnicas ou múltiplos modos de visualização.

Depois do upload, a análise identifica competências e cargos e abre uma entrevista de seis etapas. As perguntas cobrem cargos, modalidade/cidade, salário e permissão para anúncios sem remuneração, data e tipo de contratação, escolha de LinkedIn/Gupy/Glassdoor/InfoJobs e revisão/limite diário. A pessoa pode selecionar cargos sugeridos ou acrescentar um objetivo próprio. Ao confirmar, aprova o arquivo escolhido e suas preferências. Não precisa aprovar uma segunda tela de perfil ou cadastrar fontes.

A entrevista é persistida em cada etapa. Alterar respostas substitui os antigos filtros de competências, níveis e idiomas que podiam ocultar vagas sem explicação. A busca, os contadores, a lista e a preparação de candidaturas compartilham os mesmos critérios. Vagas remotas brasileiras de outras cidades não são removidas pelo filtro de cidade para presencial/híbrido. Uma restrição geográfica estrangeira informada no local da vaga continua sendo considerada.

Na listagem, modalidade, data e cidade são controles diretos. Salário fica em uma única opção expansível. Os períodos são 24 horas, 3 dias, última semana e mês; Qualquer data também inclui datas antigas e não informadas. Nos demais períodos, anúncios sem data não entram. Datas publicadas apenas com dia não têm precisão de hora inventada. Valores anuais são convertidos quando a fonte informa período e moeda; remuneração sem período conhecido não é tratada como mensal.

## Execução e envio

`PUT /api/interview` salva etapa e respostas. Com `complete:true`, define os critérios, os sites e o currículo aprovado. `start` pode ser `save`, `prepare` ou `automatic`. Somente `prepare`/`automatic` iniciam uma rotina e enfileiram a primeira busca. A fila executa o envio após a busca quando o modo automático está habilitado; antes, o envio só era tentado na execução agendada.

`GET /api/automation/sites` informa a disponibilidade por site e a conexão privada da pessoa. **Conectar** abre o login interativo na entrevista ou na automação; a sessão só é salva após confirmar autenticação. Os adaptadores nativos dos quatro portais usam essas sessões. Um gateway externo continua opcional, com os portais declarados em `APPLICATION_WEBHOOK_PORTALS`. Consulte [CONEXOES.md](CONEXOES.md).

O request de envio inclui `applicationId`, `workspaceId`, `portal`, anúncio, perfil e currículo. Para portais, `resume.file` contém nome, MIME e dados base64 do arquivo original aprovado. O download é privado; o serviço recebe o arquivo diretamente. O cabeçalho `Idempotency-Key` é o ID da candidatura. A resposta contratual precisa conter `status: "sent"` e um recibo para registrar Enviada. Timeout fica com Resultado desconhecido e não é repetido automaticamente. Problemas antes do envio ficam registrados na candidatura como ação pendente. Pausar a rotina impede preparar/enviar novas candidaturas mesmo se uma busca já estiver em andamento.

As conexões nativas e os adaptadores foram desenvolvidos e verificados em formulários controlados. O login público real do LinkedIn também foi aberto pela interface e a tentativa sem autenticação permaneceu pendente. **Envios reais com contas autenticadas ainda precisam ser validados após conectar essas contas.** Os testes não enviam candidaturas a empregadores e não demonstram compatibilidade com todos os formulários dos portais.

## Cobrança

A cobrança do plano não foi implementada: faltam definição do serviço de pagamentos, preço e credenciais da operação. Não existe checkout fictício nem status de pagamento aprovado. Essa etapa comercial precisa ser ligada a pagamentos verificados antes de oferecer o fluxo como produto pago.

## Validação

Resultado atual: **139 testes unitários/API e 22 cenários de navegador aprovados**, além de TypeScript, build e verificação de ausência de chaves configuradas nos arquivos do frontend.

A verificação inclui TypeScript, build de produção, testes unitários/API e cenários de navegador: entrevista persistida após reload, upload, construtor de PDF para primeiro emprego, quatro abas, fontes reais, filtros de remoto/cidade/data/salário, contador coerente, envio nativo/gateway com respostas controladas, recibo e prevenção de duplicidade. Os testes de conexão verificam isolamento por usuário, cifragem, restauração, desconexão e perguntas pendentes. Os cenários anteriores preservam autenticação, privacidade, acessibilidade do mascote, movimento reduzido e acompanhamento de contratação.

Capturas do novo fluxo: `artifacts/interview-simple-1440.png`, `artifacts/interview-simple-375.png`, `artifacts/filters-simple-1440.png` e `artifacts/filters-simple-375.png`. Contas de QA são removidas ao final dos testes; anúncios reais não são substituídos por dados sintéticos.
