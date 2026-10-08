# EmpreGatos

Uma plataforma para preparar seu currículo, consultar oportunidades reais e acompanhar candidaturas. Atende diferentes áreas profissionais, inclusive primeiro emprego e experiências informais. A imagem original do mascote é usada na marca e no ícone da aba.

## Executar

Requisitos: Node.js 22.12+ e npm.

```powershell
npm install
npm run dev
```

Abra **http://127.0.0.1:5173**. A página pública fica em `/`; cadastro e acesso em `/register` e `/login`; seu espaço privado em `/app`.

Sem `DATABASE_URL`, o banco PGlite persiste em `.data/postgres`. Esse modo local usa um único processo de API. O navegador pode ficar fechado, mas o computador e os serviços precisam estar ligados para executar buscas agendadas. Não abra o mesmo diretório PGlite em dois processos.

## Como usar

1. Crie uma conta e responda às etapas sobre trabalho, cidade, currículo, experiência e preferências.
2. Envie um PDF/DOCX ou escolha **Ainda não tenho currículo**. O construtor gera um PDF com suas respostas e salva o rascunho na sua conta.
3. Confira seu currículo e aprove a versão. Revise e confirme o perfil profissional.
4. Em **Configurações → Onde procurar**, informe cargo e cidade, escolha um portal e escolha **Adicionar e pesquisar**. Não precisa conhecer APIs ou identificadores técnicos.
5. Acompanhe os estados reais da fila e da busca em **Explorar vagas**. Abra a oportunidade e confira o link original, os requisitos e a localização.
6. Prepare a candidatura e finalize o envio no canal oficial. Depois, confirme o envio em **Candidaturas**. Abrir uma página não registra um envio.
7. Se quiser, configure uma busca diária em **Automação**, começando pelo modo Descoberta.

O guia de primeiros passos aparece após configurar a conta, explica as telas e salva a etapa atual. Pode ser pausado e reaberto na barra lateral. O sistema não insere vagas, salários ou candidaturas fictícias para preencher telas vazias.

## Gemini e tipos de vaga

A chave fica exclusivamente em `.env`, nunca no frontend ou no código.

```dotenv
GEMINI_API_KEY=sua-chave-privada
GEMINI_MODEL=gemini-2.5-flash
GEMINI_SEARCH_MODEL=gemini-2.5-flash
```

Em **Configurações → Análise do currículo**, escolha Gemini, autorize os dados profissionais necessários e ative a análise. Contato e documentos pessoais são removidos antes das chamadas. A leitura verifica citações contra o currículo e mantém a extração local em caso de falha.

Após enviar um currículo, **Meu currículo** mostra cargos sugeridos, justificativas e trechos de evidência. Selecione e confirme os cargos para orientar os filtros e candidaturas. Versões existentes têm **Analisar novamente**. Na candidatura, Gemini prepara uma apresentação com trechos conferidos do currículo; a versão original fica disponível para download.

## Onde procurar

O catálogo principal usa **LinkedIn, InfoJobs, Indeed e Gupy**, com cargo e cidade. **Adicionar e pesquisar** consulta anúncios públicos via Gemini com Google Search. Só são aceitos links de anúncios individuais encontrados nas fontes citadas. Não é uma integração autenticada com os portais e não cobre anúncios privados ou todos os resultados da pesquisa. Se não houver anúncio verificável, o app informa a ausência e oferece a busca diretamente no portal. A pesquisa pode consumir cotas do projeto Gemini.

O envio no LinkedIn/InfoJobs/Indeed/Gupy é concluído pela pessoa no portal. Gemini prepara conteúdo e identifica compatibilidade; sua API não tem acesso à conta nem função própria de enviar candidaturas. O mecanismo de envio automático existente depende de um adapter autorizado configurado pelo operador e de recibo real. Nenhum envio é registrado só por abrir um link.

Greenhouse, Lever, Ashby, Jobicy e Adzuna continuam disponíveis como fontes avançadas. Fontes antigas já adicionadas à conta podem ser removidas em **Configurações → Onde procurar**.

```powershell
npm run verify:gemini
# Opcional: consulta externa, pode não encontrar anúncios verificáveis
npm run verify:gemini -- --search
```

A análise Gemini foi validada nesta instalação. A busca real de teste no LinkedIn/InfoJobs não retornou referências de anúncios individuais verificáveis. Erro de cota ou ausência de fontes verificáveis são informados na interface. Leia [docs/AI.md](docs/AI.md).

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
