# Conexões com os portais

> Histórico do adaptador por navegador. Atualmente ele exige `PORTAL_BROWSER_AUTHORIZED` por provedor e não representa OAuth. O fluxo oficial LinkedIn e as capacidades atuais estão em [CONEXOES.md](CONEXOES.md). As validações antigas não demonstram envio real nem permissão dos serviços.

Ao abrir uma conexão existente, o navegador da automação restaura a sessão cifrada da pessoa e abre a página da conta. Uma sessão autenticada aparece como já aberta, sem pedir novamente e-mail e senha. Isso reutiliza sessões conectadas pelo EmpreGatos; não importa cookies do navegador pessoal.

O formulário envia os campos em uma única operação e usa o botão de login do próprio formulário, com Enter como alternativa. Cada campo tem uma identidade que é conferida antes do preenchimento, evitando enviar dados para um campo alterado entre etapas. Campos somente de leitura não entram na edição; e-mail, senha e código de verificação recebem teclado e preenchimento apropriados.

A janela acompanha mudanças a cada três segundos enquanto estiver aberta, sem executar ações simultâneas. A atualização acontece em segundo plano e pausa enquanto a pessoa edita campos. Falhas preservam os dados digitados; uma mudança de etapa elimina valores que pertenciam a campos anteriores. O botão de mostrar senha permite conferir a digitação. A confirmação aparece apenas depois de detectar autenticação, sem abandonar um desafio pendente.

Na janela de verificação é possível clicar no campo do portal, inserir um código ou texto e usar Tab e Enter. Falhas ao carregar o site oferecem nova tentativa. Bloqueios explícitos como “Humans only” são informados e não permitem confirmar uma conexão inexistente.

## Validação em 9 de outubro de 2026

- Suíte inicial após a alteração: 146 testes aprovados. Depois, os 10 testes de sessão passaram, incluindo dois novos cenários de login por etapas e bloqueio.
- Dez testes de navegador aprovados: adaptadores com páginas locais e abertura do formulário real do LinkedIn, sem enviar credenciais pessoais ou candidaturas.
- Consulta pública dos portais: Gupy abriu seu formulário e InfoJobs abriu a primeira etapa de e-mail. Glassdoor retornou HTTP 403 com “Humans only”; o acesso autenticado nele permanece sem validação.
- Compilação aprovada. Não foi realizado login real nas contas da pessoa nos portais; CAPTCHA, MFA e bloqueios dos sites podem exigir intervenção.

Melhoria seguinte: 38 testes de sessão/API aprovados, incluindo formulário que não envia com Enter, identidade de campo alterada e código de verificação. O teste de interface verificou preservação dos campos após erro, pausa da atualização durante edição, mostrar/ocultar senha, troca para código sem reutilizar valores anteriores, detecção assíncrona da conta e confirmação em computador/celular. A abertura real do formulário do LinkedIn também passou, mantendo o login vazio como não conectado.
