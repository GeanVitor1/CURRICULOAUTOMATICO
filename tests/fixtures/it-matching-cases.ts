/** Benchmark de recomendação para TI: cada perfil lista as vagas que DEVEM aparecer; as demais não. */
export type BenchJob = { id: string; title: string; description: string; modality?: string };
export type BenchProfile = { id: string; resume: string; titles: string[]; expected: string[]; level?: string };

export const benchJobs: BenchJob[] = [
  { id: "dotnet-pleno", title: "Desenvolvedor .NET Pleno", description: "Desenvolvimento de APIs em C#, ASP.NET Core e Entity Framework. SQL Server. Desejável Angular. CLT, remoto." },
  { id: "dotnet-sr", title: "Desenvolvedor Back-end C# Sênior", description: "Experiência sólida com C#, .NET 8, mensageria, SQL Server e arquitetura limpa. Remoto." },
  { id: "fullstack-net-angular", title: "Desenvolvedor Full Stack (.NET + Angular)", description: "Atuação com C#, ASP.NET Core, Angular e TypeScript. Remoto, PJ." },
  { id: "java-sust", title: "Analista de Sistemas Java - (Sustentação)", description: "Sustentação de sistemas em Java, Spring Boot, APIs REST, Angular e Git. CLT, remoto." },
  { id: "java-spring", title: "Desenvolvedor Java Spring Boot Pleno", description: "Java 17, Spring Boot, microsserviços, Kafka e PostgreSQL. Remoto." },
  { id: "backend-generic-java", title: "Desenvolvedor Back-end Pleno", description: "Requisitos obrigatórios: Java, Spring Boot e PostgreSQL. Remoto." },
  { id: "python-dev", title: "Desenvolvedor Python", description: "Python, Django, APIs REST e PostgreSQL. Remoto." },
  { id: "php-laravel", title: "Programador PHP Laravel", description: "PHP 8, Laravel, MySQL. Presencial em São Paulo, SP." },
  { id: "react-front", title: "Desenvolvedor Front-end React", description: "React, TypeScript, Next.js, testes com Jest. Remoto." },
  { id: "angular-front", title: "Desenvolvedor Front-end Angular", description: "Angular, TypeScript, RxJS, HTML e CSS. Remoto." },
  { id: "node-back", title: "Desenvolvedor Node.js", description: "Node.js, TypeScript, NestJS, MongoDB. Remoto." },
  { id: "flutter-mobile", title: "Desenvolvedor Mobile Flutter", description: "Flutter, Dart, publicação nas lojas. Remoto." },
  { id: "android-kotlin", title: "Desenvolvedor Android", description: "Kotlin, Jetpack Compose. Remoto." },
  { id: "data-analyst", title: "Analista de Dados Júnior", description: "SQL, Power BI, Excel avançado e Python desejável. Remoto." },
  { id: "data-engineer", title: "Engenheiro de Dados", description: "Python, Spark, Airflow, Databricks e AWS. Remoto." },
  { id: "bi-analyst", title: "Analista de BI", description: "Power BI, DAX, SQL Server. Remoto." },
  { id: "qa-auto", title: "Analista de QA Automação", description: "Cypress, Selenium, testes de API com Postman. Remoto." },
  { id: "devops", title: "Engenheiro DevOps", description: "Docker, Kubernetes, Terraform, CI/CD e AWS. Remoto." },
  { id: "suporte-n2", title: "Analista de Suporte N2", description: "Atendimento a chamados, Windows, redes, Active Directory. Presencial em Ilhéus, BA." },
  { id: "infra", title: "Analista de Infraestrutura", description: "Windows Server, redes, VMware e firewall. Presencial em Ilhéus, BA." },
  { id: "estagio-dev", title: "Estágio em Desenvolvimento de Software", description: "Cursando Análise e Desenvolvimento de Sistemas. Lógica de programação, JavaScript ou C#. Remoto." },
  { id: "vendedor", title: "Vendedor Externo", description: "Vendas consultivas, CNH B. Presencial." },
  { id: "aux-adm", title: "Auxiliar Administrativo", description: "Rotinas administrativas, Excel. Presencial." },
  { id: "enfermagem", title: "Técnico de Enfermagem", description: "COREN ativo. Presencial." },
];

export const benchProfiles: BenchProfile[] = [
  {
    id: "dotnet-fullstack",
    level: "Pleno",
    titles: ["Desenvolvedor .NET", "Analista de Sistemas", "Desenvolvedor Full Stack"],
    resume: "Analista de Sistemas e Desenvolvedor Full Stack\nRESUMO\nDesenvolvedor com C#, .NET 8, ASP.NET Core, Entity Framework, SQL Server, Angular, TypeScript e JavaScript.\nEXPERIÊNCIA PROFISSIONAL\nAnalista de Sistemas | 2025 - Atual\nDesenvolvimento de APIs REST em C# e .NET, front-end em Angular, Git e Docker.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["dotnet-pleno", "dotnet-sr", "fullstack-net-angular", "angular-front", "estagio-dev"],
  },
  {
    id: "java-backend",
    titles: ["Desenvolvedor Java", "Desenvolvedor Back-end"],
    resume: "Desenvolvedor Back-end Java\nEXPERIÊNCIA PROFISSIONAL\nDesenvolvedor Java Pleno | 2022 - Atual\nMicrosserviços com Java 17, Spring Boot, Kafka e PostgreSQL. APIs REST e Git.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["java-spring", "backend-generic-java", "java-sust"],
  },
  {
    id: "react-front",
    titles: ["Desenvolvedor Front-end"],
    resume: "Desenvolvedora Front-end\nEXPERIÊNCIA PROFISSIONAL\nFront-end | 2023 - Atual\nInterfaces com React, TypeScript, Next.js, HTML, CSS e testes com Jest.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["react-front"],
  },
  {
    id: "python-data",
    titles: ["Engenheiro de Dados", "Analista de Dados"],
    resume: "Engenheiro de Dados\nEXPERIÊNCIA PROFISSIONAL\nEngenheiro de Dados | 2021 - Atual\nPipelines com Python, Spark, Airflow e Databricks na AWS. SQL avançado.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["data-engineer", "data-analyst"],
  },
  {
    id: "bi",
    titles: ["Analista de BI", "Analista de Dados"],
    resume: "Analista de BI\nEXPERIÊNCIA PROFISSIONAL\nAnalista de BI | 2022 - Atual\nDashboards em Power BI, DAX, SQL Server e Excel avançado.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["bi-analyst", "data-analyst"],
  },
  {
    id: "qa",
    titles: ["Analista de QA", "QA"],
    resume: "Analista de QA\nEXPERIÊNCIA PROFISSIONAL\nQA | 2022 - Atual\nAutomação de testes com Cypress e Selenium, testes de API no Postman.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["qa-auto"],
  },
  {
    id: "devops",
    titles: ["Engenheiro DevOps"],
    resume: "Engenheiro DevOps\nEXPERIÊNCIA PROFISSIONAL\nDevOps | 2021 - Atual\nDocker, Kubernetes, Terraform, pipelines de CI/CD e AWS.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["devops"],
  },
  {
    id: "suporte",
    titles: ["Analista de Suporte", "Analista de Infraestrutura"],
    resume: "Analista de Suporte Técnico\nEXPERIÊNCIA PROFISSIONAL\nSuporte N2 | 2020 - Atual\nAtendimento a chamados, Windows, redes, Active Directory e Windows Server. Ilhéus, BA.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["suporte-n2", "infra"],
  },
  {
    id: "estagiario",
    level: "Estágio",
    titles: ["Estágio em Desenvolvimento", "Desenvolvedor Júnior"],
    resume: "Estudante de Análise e Desenvolvimento de Sistemas\nPROJETOS PESSOAIS\nProjetos com JavaScript, HTML, CSS e C# no GitHub.",
    expected: ["estagio-dev"],
  },
  {
    id: "php",
    titles: ["Programador PHP", "Desenvolvedor Back-end"],
    resume: "Programador PHP\nEXPERIÊNCIA PROFISSIONAL\nProgramador | 2019 - Atual\nPHP, Laravel e MySQL. São Paulo, SP.\nFORMAÇÃO ACADÊMICA\nBacharel em Sistemas de Informação",
    expected: ["php-laravel"],
  },
];
