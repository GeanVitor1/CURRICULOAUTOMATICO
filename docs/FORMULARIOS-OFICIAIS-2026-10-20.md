# Candidaturas nos formulários oficiais das empresas

O caminho principal pode operar sem autenticação Gupy/LinkedIn e sem extensão: busca pública → anúncio oficial → correspondência da vaga → formulário compatível → currículo/respostas aprovados → fila → recibo. Não garante que toda vaga ofereça esse caminho.

## Mudanças de 20/10/2026

- Busca direta de anúncios Greenhouse, Lever, Ashby e SmartRecruiters usando as referências verificáveis do mecanismo de pesquisa existente. A publicação precisa confirmar os dados em JobPosting; o texto gerado pela IA não cria um anúncio. Páginas de lista, anúncios encerrados e redirecionamentos para outra publicação são rejeitados.
- A busca usa cargos, modalidades e localidades dos filtros. Não recebe currículo, nome, contato ou sessão do candidato. Reaproveita o cache público compartilhado.
- Quadros públicos configurados em DISCOVERY_ATS_BOARDS continuam complementando a pesquisa. A consulta não depende de uma cópia da mesma vaga em um agregador.
- Modo destinationPolicy:official na rotina: usa destinos independentes ou integração autorizada da empresa; não volta ao navegador de Gupy/LinkedIn quando não encontra um formulário. Contas antigas sem essa opção mantêm o roteamento anterior. Na interface, novas ativações usam o modo oficial quando disponível.
- Pesquisa prioriza anúncios e links em ATS independentes, depois compatibilidade. Pedido explícito de uma vaga mantém prioridade máxima. Orçamento de pesquisa separado do limite de envio: até 4 vezes esse limite, limitado por DESTINATION_RESEARCH_DAILY_LIMIT (20 por padrão).
- Escopo ATS_PUBLIC_FORM_PLATFORMS habilita explicitamente as famílias de formulários públicos suportados. O servidor confere domínio e plataforma; '*' não libera destinos e um domínio estranho não pode se declarar Lever. Formulários personalizados continuam exigindo ATS_BROWSER_AUTHORIZED com domínio exato. Essa opção não fornece credenciais de API nem elimina condições aplicáveis dos destinos.
- Adaptador Lever reconhece #application-form e perguntas .application-label, inclusive o asterisco ✱, conforme marcação observada na página real.
- Conexões com portais ficam em uma seção opcional. A interface explica o envio nas empresas e as vagas que continuam pendentes.

## Configuração do operador

### Respostas pessoais nas preferências

A tela de preferências contém uma seção independente para LinkedIn, idiomas (com distinção entre Intermediário I e II), conforto para trabalhar nesses idiomas, empresa atual, tempo de experiência em desenvolvimento e .NET, experiência de nuvem, nível .NET e acessibilidade. Salvar exige confirmação explícita, valida no servidor e mantém a rotina e os filtros existentes. Campos ausentes permanecem pendentes. A troca de currículo não inventa nem substitui essas declarações pessoais.

O executor reutiliza somente perguntas reconhecidas e respostas confirmadas. Opções de idioma com descrição só são escolhidas quando há correspondência única do nível. Parentesco não recebe um padrão global: depende da empresa e da declaração do candidato. Consentimentos legais continuam separados dessas preferências. A candidatura real CI&T autorizada pelo titular continua pendente até as respostas e confirmações necessárias; salvar preferências não comprova envio.

Validação da atualização de preferências: 495 testes passaram, 11 ignorados; build e verificação de tipos concluídos. Inclui teste da API autenticada, confirmação obrigatória, persistência após editar o perfil e preservação da rotina, além da correção da experiência empresarial confundida com requisito de experiência do candidato.

Configuração inicial possível, usando o Chromium de nuvem já existente:

```dotenv
OFFICIAL_CAREERS_DISCOVERY_ENABLED=true
ATS_PUBLIC_FORM_PLATFORMS=lever,greenhouse
DESTINATION_RESEARCH_DAILY_LIMIT=20
```

O mecanismo de pesquisa requer Gemini configurado ou Antigravity disponível para o titular. Falha de busca é informada; não produz anúncios fictícios. DISCOVERY_ATS_BOARDS permite consultar quadros oficiais previamente verificados sem depender do mecanismo de pesquisa.

Não é preciso uma sessão de candidato em nenhum portal para esse caminho. Em produção, PORTAL_CLOUD_SNAPSHOT_ID fornece a imagem do navegador efêmero; localmente ATS_EXECUTION_LOCAL=true permite testes. Cada tentativa mantém navegador isolado, proteção contra redes privadas e acesso restrito à origem verificada.

Ativar a infraestrutura não ativa a rotina das contas. A pessoa precisa confirmar currículo, dados, preferências e o início da automação. Limites, compatibilidade e duplicidade continuam verificados no servidor.

## Limites comprovados

Validação local final: 490 testes passaram e 11 ficaram ignorados, em 60 arquivos. O build de produção passou, incluindo a conferência de ausência de segredos configurados no frontend. Os testes de Chromium comprovam envio de PDF fictício e recibo em receptor controlado sem sessão de portal, reconhecimento da marcação Lever observada e pausa diante de respostas não confirmadas. Não equivalem a uma candidatura real.

Publicação confirmada no domínio curriculoautomatico.vercel.app, deployment dpl_DmnSt5ZjJykZKV9km9WRoFuvxBkG. Formulários públicos Lever/Greenhouse e quadros CI&T/Wellhub foram configurados. A busca pela fila real acrescentou 251 anúncios oficiais à conta (180 Lever e 71 Greenhouse), totalizando 404 anúncios únicos. Os 25 anúncios compatíveis exibidos são o total de todas as fontes, não uma prova de 25 formulários aptos ao envio. LinkedIn/Glassdoor/InfoJobs continuaram sem referências verificáveis; o resultado parcial preservou os anúncios oficiais encontrados. A rotina da conta permaneceu em approval; nenhum novo currículo foi enviado. O painel exibe Ativar envio automático. Registro: artifacts/official-careers-release-2026-10-20.json.

- Formulários dinâmicos não reconhecidos, anexos externos, login, CAPTCHA, perguntas sem resposta e declarações sem autorização voltam para revisão.
- O código não aceita termos nem declarações sensíveis por inferência. Respostas desses campos são restritas ao destino aprovado.
- A recepção só aparece como enviada após confirmação posterior ao clique. Resultado incerto impede repetição automática.
- Em 20/10 foi lida a publicação CI&T [Job-32237] Mid-Level .Net Developer (GCP), Brazil e o formulário correspondente, pelo Chrome e pelo leitor público do backend. O formulário não exigiu login de candidato, mas trouxe várias perguntas e consentimentos; a página no Chrome também carregou verificação humana. Essa inspeção não prova que a vaga possa ser enviada sem intervenção.
- Nenhum arquivo pessoal foi carregado e nenhuma candidatura real foi enviada nesta verificação. Evidência: artifacts/official-careers-readiness-2026-10-20.json. O script scripts/verify-official-careers.ts verifica as páginas em modo de leitura; recebe uma URL observada e não comprova o provedor de busca da IA.

Documentação oficial consultada: [Lever Postings API](https://github.com/lever/postings-api), [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Ashby Public Job Postings](https://developers.ashbyhq.com/docs/public-job-posting-api). APIs públicas de leitura não são tratadas como credenciais de submissão; o executor usa o formulário hospedado.
