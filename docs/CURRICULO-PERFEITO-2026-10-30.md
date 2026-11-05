# Currículo Perfeito

Funcionalidade solicitada em 30/10/2026, baseada no fluxo público de adaptação de documentos, edição e exportação descrito pelo [Jobstep](https://www.jobstep.io/pt-br/curriculo). Implementação própria no EmpreGatos, com o visual do produto e sem pontuação de currículo ou de vaga.

## Uso

1. Abra **Currículo Perfeito** no menu, pelo atalho da aba Currículo ou pelo botão no detalhe de uma vaga.
2. Escolha um currículo salvo na conta e cole o link público da vaga.
3. Confira o anúncio. Se o portal exigir login ou bloquear a leitura pública, cole sua descrição e informe o cargo/empresa.
4. Opcionalmente, informe conhecimentos ou projetos reais que ainda não constam no documento.
5. Gere a versão, revise no editor e escolha entre três apresentações: Essencial, Moderno e Executivo.
6. Salve as alterações e baixe o currículo ou a carta de apresentação em PDF. O currículo também pode ser exportado em texto.

Há versões em português e inglês, prévia do documento, comentários sobre as mudanças e biblioteca de até 12 versões privadas. O download salva primeiro as alterações pendentes. Escritas de abas antigas são rejeitadas por revisão otimista.

## Adaptação de conteúdo

A função aceita uma vaga de outra stack ou área, mesmo que ela não atenda aos filtros usados pela rotina de busca. O título desejado e a apresentação podem mudar; empresas, cargos exercidos, períodos e formação mantêm origem no currículo. Conhecimentos adicionais declarados pela pessoa são uma fonte válida para a versão.

A geração exige evidências literais para as experiências e projetos, preserva formação e idiomas a partir da fonte e verifica competências e números presentes nas afirmações. Uma resposta com um novo emprego, diploma, stack não declarada ou números não confirmados é rejeitada. As instruções pedem escrita profissional natural, sem citar adaptação ao anúncio, anunciar transição de stack ou copiar a lista de requisitos como qualificações da pessoa.

Essa verificação não substitui a revisão editorial: a pessoa pode avaliar e editar a formulação antes de baixar. Os comentários de revisão não são exportados dentro do currículo.

## Armazenamento e automação

As versões ficam em `Workspace.perfectResumes`, separadas de `Workspace.resumes`, do perfil e da rotina. Criar, editar, baixar ou excluir uma versão não aprova currículos, altera preferências, interrompe agendamento nem inicia candidaturas. O currículo original permanece disponível.

O resumo periódico do workspace não transporta os documentos completos; a biblioteca é carregada sob demanda. Os arquivos são renderizados em memória no download autenticado, com `private, no-store`, nomes controlados pelo servidor e texto selecionável em coluna única.

## Acesso e geração

- Todos os endpoints exigem sessão da conta proprietária e as mutações seguem a proteção CSRF existente.
- A leitura de links usa a política HTTPS pública existente, com rejeição de redes privadas, validação de redirecionamentos, DNS fixado e limites de leitura.
- Leitura e geração usam a exclusão mútua e o orçamento de processamento da conta; a geração também tem limite de três requisições por minuto.
- A geração usa a conexão de IA escolhida pela pessoa e seu consentimento existente. Estão integrados Gemini, Zen, OpenAI e Ollama.
- O provedor recebe dados profissionais minimizados. Nome, telefone, e-mail e contatos são compostos localmente no cabeçalho. Credenciais não entram no conteúdo gerado nem nas respostas de erro.
- Anúncio, currículo e contexto são tratados como dados não confiáveis nas instruções, sem ferramentas, login ou envio de candidatura pelo modelo.
- Uma versão só é salva se o currículo e o perfil de origem continuarem iguais após a resposta da IA. O identificador da solicitação evita duplicar uma geração repetida.

## API

- `POST /api/perfect-resumes/inspect`
- `GET /api/perfect-resumes`
- `POST /api/perfect-resumes`
- `PUT /api/perfect-resumes/:draftId`
- `DELETE /api/perfect-resumes/:draftId`
- `GET /api/perfect-resumes/:draftId/download?kind=resume|letter&format=pdf|txt`

## Verificação

17 testes específicos de domínio e API aprovados: mudança de foco, conhecimentos adicionais, contatos minimizados, exigência de evidências, rejeição de dados inventados, isolamento entre contas, consentimento, CSRF, preservação da rotina e do original, reexecução idempotente, concorrência, alterações de origem e exportação. A verificação também impede converter idade ou tamanho de equipe em anos de experiência e confirma que a biblioteca não é incluída no resumo periódico do workspace.

Sete cenários Playwright aprovados, incluindo a regressão da política sem notas. Testes com dados fictícios, APIs interceptadas e nenhuma candidatura real: fluxo de geração/edição/modelos/download, fallback por descrição, falha do provedor, entrada por link de vaga, pessoa sem currículo e consentimento de IA. Capturas revisadas em tema claro, escuro e celular.

Dois exemplos inteiramente fictícios foram gerados com Gemini real e passaram pela validação de evidências. Quatro PDFs de QA foram produzidos em `output/pdf/`: três apresentações de currículo e uma carta. Esses arquivos não contêm dados da conta real. A renderização é conferida com Poppler e a extração de texto é verificada. Durante a validação houve dois timeouts transitórios; a consulta do modelo respondeu HTTP 200 e a geração seguinte foi concluída e validada em 9,4 segundos, com 1.911 tokens. O fluxo conserva os dados preenchidos em caso de indisponibilidade do provedor. O esquema de resposta é enviado pelo adaptador do provedor, sem duplicação no conteúdo do pedido.

Geração pela API completa com Gemini real, em conta e banco locais inteiramente fictícios: HTTP 200, concluída em 5,5 segundos, PDF baixado com HTTP 200 e assinatura válida, original preservado e zero candidaturas transmitidas. Comparação estrutural feita entre os documentos persistidos antes e depois da geração. Evidência em `.data/perfect-resume-real-api-smoke.json`.

TypeScript, build e verificação de segredos no frontend aprovados. A regressão completa aprovou 1.009 casos; a execução final dos dois arquivos da funcionalidade incluiu mais um caso e aprovou todos os 17. Resultado consolidado por arquivo: **1.010 aprovados, zero falhas e 11 integrações Firestore desabilitadas por dependerem de ambiente específico**. Registro em `.data/perfect-resume-consolidated.json`.

Publicado em [Currículo Perfeito](https://curriculoautomatico.vercel.app/app#curriculo-perfeito), deployment `dpl_5n2aDwVUCMJVLWCHo618CLGNFHqK`, revisão `182959bdf60a3ebec99a4c9bb3314cd1b3b5f0a04995071c45ad14935b79db5f`. Os 383 arquivos de código enviados conferem com os locais validados. Saúde e observador do domínio principal responderam HTTP 200 em 30/10 às 20:18 UTC, com Node 26.13.0 e Undici 8.12.2.

Os sete cenários Playwright também passaram no domínio principal depois da publicação, com APIs interceptadas e dados fictícios, sem criação de currículos ou candidaturas na conta real.
