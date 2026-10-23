# Dados iniciais para candidaturas

No primeiro acesso à conta real, o aplicativo solicita cidade/UF, telefone com DDD, anos de experiência na área pretendida e pretensão salarial mensal em reais. Contas existentes sem confirmação também passam por essa etapa. A pessoa pode informar primeiro emprego (zero anos) ou declarar que ainda não definiu a pretensão. A página da conta permanece acessível.

Também solicita se a pessoa aceita contratação PJ e como deseja responder sobre remuneração atual ou última e benefícios. A escolha entre informar e “Prefiro não informar” é explícita, sem resposta presumida. Ao optar por não informar, o servidor remove o texto anteriormente salvo. Essa resposta não usa a pretensão salarial como substituto. A recusa de contratação PJ impede o envio automático para vagas identificadas como PJ.

As respostas exigem confirmação explícita, ficam disponíveis nas preferências e são salvas pelo endpoint autenticado `PUT /api/candidate-details`. O servidor valida os campos e registra a confirmação. Editar esses valores pela API genérica do perfil exige reconfirmação. Aprovar o currículo, confirmar o perfil profissional e ativar a rotina continuam sendo etapas próprias.

A análise de outro currículo preserva os dados básicos confirmados. Campos opcionais vazios da entrevista não apagam telefone e localização. Pretensão salarial é uma resposta para formulários; não altera o salário mínimo usado para filtrar vagas.

A preparação automática e o envio verificam os dados no servidor. Formulários podem receber a pretensão mensal e experiência geral confirmadas quando o significado da pergunta é inequívoco. Não se infere salário atual, valor anual em outra moeda ou experiência em uma tecnologia específica. Perguntas adicionais continuam exigindo respostas da pessoa.

Validação: `npm run verify:single-submission` cria uma conta temporária, preenche a tela pelo navegador, verifica a persistência após recarregar e executa um envio individual a um receptor HTTP local. Os artefatos são `artifacts/candidate-details-mobile.png` e `artifacts/single-submission-verification.json`. Esse teste não envia candidaturas a empregadores reais.

Foi concluída uma candidatura real na SmartTravel/TALENTOS SMART pela sessão autorizada do Chrome, inscrição **767851604**, com a confirmação visível “Candidatura finalizada!” e acompanhamento na etapa Currículo (1/5). O recibo foi registrado na conta do EmpreGatos. Evidências: `artifacts/smarttravel-real-submission.json` e `artifacts/smarttravel-real-submitted.png`.

A Gupy usou o currículo estruturado existente na conta. A apresentação foi baseada no Curriculo.pdf aprovado e foram acrescentadas as habilidades C#, .NET e SQL Server. Não foi oferecido um campo para anexar o PDF nessa etapa. Essa comprovação foi executada pelo assistente no Chrome autorizado, e não pelo worker de produção. A rotina geral continua desativada; a tela nova ainda precisa ser publicada.

Durante a atualização de contato na sessão real, o assistente substituiu o e-mail exibido pelo endereço informado para localizar a conta, causando indevidamente uma solicitação de troca de e-mail. Esse e-mail recebido da Gupy não é um comprovante da candidatura. A solicitação não foi confirmada pelo assistente. Foi adicionada uma proteção no preenchimento do projeto: se um campo de e-mail já estiver preenchido com outro endereço, preservá-lo e interromper o fluxo para revisão. O teste de navegador dessa proteção usa apenas HTML local.
