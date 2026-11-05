# Primeiro acesso e ajuda — 29/10/2026

Publicado em `https://curriculoautomatico.vercel.app`, deployment `dpl_GqYQKrknN55X21qaWgbiqZEGieB6`.

## Experiência

- Cadastro informa o que vem depois e deixa claro que criar uma conta não inicia candidaturas. O botão informa quando está criando a conta ou fazendo login.
- O primeiro painel mostra boas-vindas, quatro etapas, progresso e uma única ação principal para o próximo passo. Não abre um tutorial modal automaticamente.
- A ordem é importar/criar currículo, confirmar dados, escolher preferências e revisar o início da rotina. O formulário de dados obrigatórios continua antes da entrevista quando houver pendências; o envio ou a criação de currículo não fica bloqueado por esse formulário.
- O progresso é calculado a partir do workspace da conta, da confirmação dos dados, do currículo atual e da entrevista vinculada à mesma versão. Clicar no guia não conclui etapas, aprova documentos ou ativa envios.
- A entrevista mostra primeiro a pergunta atual. Regras adicionais e conexão de e-mail ficam numa seção opcional. As explicações distinguem conexão do portal, busca, preparação e envio.
- O botão “Como usar” permite consultar as etapas e abrir cada área. Contas já configuradas recebem a ajuda sem voltar à apresentação inicial, inclusive quando a rotina estiver pausada.
- Não há alteração em consentimentos, condições de envio, autenticação ou cotas do servidor. Continuam válidas as restrições de cada portal, inclusive o LinkedIn apenas com verificação local.

## Validação

19 testes unitários de progresso e dados passaram, incluindo a separação de 20 contas sintéticas. A compilação TypeScript e o build completo foram feitos na Vercel.

O teste visual usa o frontend compilado e uma API simulada em localhost no ambiente de build. Verifica cadastro, boas-vindas, acesso ao currículo antes do formulário de dados, upload controlado, dados obrigatórios, preferências, salvamento, reabertura e ajuda por teclado. Nenhuma conta real, API de produção ou sessão de portal foi utilizada nesse percurso; o guia não iniciou buscas nem candidaturas.

Capturas revisadas em desktop e celular, nos temas claro e escuro, sem transbordamento horizontal:

- `artifacts/onboarding-welcome-desktop.png`
- `artifacts/onboarding-welcome-mobile.png`
- `artifacts/onboarding-details-mobile.png`
- `artifacts/onboarding-preferences-desktop.png`
- `artifacts/onboarding-help-mobile.png`
- `artifacts/onboarding-complete.png`

Relatório: `artifacts/onboarding-qa.json`. Verificação pública da versão e saúde: `artifacts/onboarding-production-2026-10-29.json`.

As máquinas de teste independentes atingiram a cota de armazenamento. A máquina temporária criada nesta tarefa foi parada e excluída; a validação concluída usou uma compilação de produção sem promover o domínio, com `VERIFY_ONBOARDING_QA=1`. O relatório precisou ter `passed: true` e as capturas foram conferidas antes da promoção. Os artefatos da prévia são sintéticos. A opção de QA no build é desativada por padrão.
