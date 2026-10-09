# EmpreGatos

Uma plataforma para preparar seu currículo, consultar oportunidades reais e acompanhar candidaturas. Atende diferentes áreas profissionais, inclusive primeiro emprego e experiências informais. A imagem original do mascote é usada na marca e no ícone da aba.

O mascote também acompanha o cadastro, o guia, a escrita do currículo, as buscas e as candidaturas com poses diferentes. As artes e seus usos estão documentados em [Video/README.md](Video/README.md).

## Executar

Requisitos: Node.js 22.12+ e npm.

```powershell
npm install
npx playwright install --with-deps chromium
npm run dev
```

Abra **http://127.0.0.1:5173**. A página pública fica em `/`; cadastro e acesso em `/register` e `/login`; seu espaço privado em `/app`.

Sem `DATABASE_URL`, o banco PGlite persiste em `.data/postgres`. Esse modo local usa um único processo de API. O navegador pode ficar fechado, mas o computador e os serviços precisam estar ligados para executar buscas agendadas. Não abra o mesmo diretório PGlite em dois processos.

## Como usar

1. Entre na conta e escolha **Enviar currículo**. Use PDF/DOCX ou **Ainda não tenho currículo** para criar o arquivo por perguntas.
2. O sistema analisa o currículo e abre **Preferências**. Responda uma pergunta de cada vez: cargos, remoto/presencial/híbrido e cidade, salário, data/contratação, sites e limite diário.
3. Escolha seus sites na entrevista e confira as capacidades exibidas. O LinkedIn oferece OAuth oficial de identidade quando configurado; isso não libera envio de candidaturas. Cada fonte informa se busca e envio estão disponíveis. As conexões por navegador exigem autorização explícita do provedor no servidor.
4. Confira as respostas e confirme o currículo. **Ativar envio automático** aparece quando ao menos um site escolhido possui envio autorizado configurado. Sites sem essa capacidade continuam com envio manual, informado antes da ativação. Sem nenhuma integração de envio, você pode salvar ou iniciar somente busca e preparação.
5. Acompanhe **Automação** e **Candidaturas**. As vagas ficam em **Ver vagas encontradas**, com filtros diretos de modalidade, cidade, salário e publicação (24 horas, 3 dias, semana, mês ou qualquer data).

A navegação principal tem apenas **Automação, Currículo, Preferências e Candidaturas**. A entrevista salva cada etapa e continua após recarregar a página. Perfil, radar, análises, notificações e fontes não são telas do fluxo. Minha conta permite exportar dados ou excluir a conta. Nenhuma vaga, salário, pagamento ou candidatura enviada é fabricada para preencher telas.

A cobrança do plano ainda depende da escolha/configuração do serviço de pagamento e do valor do plano; não há checkout real ou pagamento aprovado nesta instalação. Os detalhes do fluxo e das conexões de envio estão em [docs/FLUXO-SIMPLES.md](docs/FLUXO-SIMPLES.md).

## Gemini e tipos de vaga

A chave fica exclusivamente em `.env`, nunca no frontend ou no código.

```dotenv
GEMINI_API_KEY=sua-chave-privada
GEMINI_MODEL=gemini-2.5-flash
GEMINI_SEARCH_MODEL=gemini-2.5-flash
```

Em **Currículo**, a opção de autorizar análise por IA aparece quando Gemini está configurado no servidor. Contato e documentos pessoais são removidos antes das chamadas. A leitura verifica citações contra o currículo e mantém a extração local em caso de falha.

Após enviar um currículo, **Meu currículo** mostra cargos sugeridos. **Entenda a sugestão** abre a justificativa e o trecho de evidência. Selecione e confirme os cargos para orientar os filtros e candidaturas. Versões existentes têm **Analisar novamente**. A preparação da candidatura gera uma apresentação local e disponibiliza o currículo original para download; Gemini pode atualizar essa apresentação se a análise externa estiver autorizada.

## Onde procurar

Os sites da entrevista continuam LinkedIn, Gupy, Glassdoor e InfoJobs. A Gupy consulta as listagens públicas do portal. A busca automatizada LinkedIn exige `PORTAL_DISCOVERY_AUTHORIZED`; seu OAuth identifica a conta, sem permissões de emprego. InfoJobs e Glassdoor usam Gemini com Google Search quando configurado e aceitam somente links individuais citados. Resultados vazios e indisponibilidade são estados separados.

A consulta Gupy percorre até três páginas de 50 por cargo/cidade, com até quatro cargos e três cidades. Há cache de cinco minutos, deduplicação e cooldown após HTTP 429. A cobertura é limitada; filtros não são relaxados automaticamente.

Os adaptadores de navegador dos quatro portais foram preservados, mas ficam desabilitados sem `PORTAL_BROWSER_AUTHORIZED` por provedor. Somente configure essa opção com permissão do serviço. A integração de envio autorizada por webhook continua disponível. O fluxo exige currículo aprovado, preferências, consentimento e confirmação real; perguntas sem resposta ficam pendentes. Claims interrompidos não são reenviados automaticamente. Detalhes em [docs/CONEXOES.md](docs/CONEXOES.md).

Greenhouse, Lever, Ashby, Jobicy e Adzuna continuam disponíveis pela API para compatibilidade. A entrevista define os sites usados pelo fluxo simples.

```powershell
npm run verify:gemini
# Opcional: consulta externa, pode não encontrar anúncios verificáveis
npm run verify:gemini -- --search
```

Na revisão atual, a Gupy retornou 99 anúncios reais para Auxiliar administrativo, e a busca pela fila foi validada até a interface. Greenhouse (Stripe), Lever (Palantir) e Ashby (Notion) também responderam com vagas reais. Nenhuma candidatura foi enviada. O round trip OAuth com credenciais reais e o envio a empregadores permanecem sem validação. Resultados e limites: [docs/REDESIGN-E-INTEGRACOES-2026-10-09.md](docs/REDESIGN-E-INTEGRACOES-2026-10-09.md).

## Build, testes e produção

```powershell
npm test
npm run build
npm run test:browser
npm run verify:workflow
```

Os testes de navegador exigem `npm run dev` em execução. A suíte `real-source.spec.ts` consulta uma fonte pública real e cria uma conta temporária, excluída ao final. Não envia candidaturas. Os testes unitários usam bancos temporários e respostas externas isoladas.

```powershell
npm run build
npm start
```

O build força React em modo de produção mesmo se o `.env` local contiver `NODE_ENV=development`.

Para workers separados, configure PostgreSQL e Redis em `.env`, execute as migrations e inicie `npm run worker` em outro terminal. O exemplo está em [docker-compose.yml](docker-compose.yml) e [.env.example](.env.example). Para publicação, ajuste `APP_ORIGIN`, HTTPS, armazenamento privado dos uploads e `NODE_ENV=production`. A operação precisa informar responsável, contato de privacidade, retenção e backups. PostgreSQL/Redis em serviços separados não foram validados nesta sessão.

O armazenamento de coleções por conta continua em JSONB, com limite de 2.000 vagas. A listagem tem paginação no servidor e o dashboard recebe um resumo, mas o backend ainda lê a coleção para aplicar critérios. Escala pública maior exige tabelas relacionais e filtros SQL; esta entrega não afirma capacidade ilimitada.

Relatório detalhado: [docs/REFATORACAO.md](docs/REFATORACAO.md). Resultados: [docs/VALIDATION.md](docs/VALIDATION.md).

Auditoria de produto de 09/10/2026: [correções, validação e pendências de lançamento](docs/AUDITORIA-PRODUTO-2026-10-09.md). O build inclui Brotli/gzip para arquivos HTML, JS e CSS; a auditoria de carregamento e cache pode ser executada com `npm run audit:production` contra uma instância local de produção (origem padrão `http://127.0.0.1:3109`).
