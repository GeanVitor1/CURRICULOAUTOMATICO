# Resultados de busca e candidatura assistida

A Gupy publica modalidade, data e tipo de contratação separados da descrição. O leitor agora preserva esses campos: `vacancy_type_effective` corresponde a CLT, `vacancy_legal_entity` a PJ, e os tipos de estágio, aprendiz e temporário também são reconhecidos. Tipos desconhecidos continuam sem classificação automática. A descrição não substitui o tipo declarado pela fonte.

O painel separa anúncios coletados de vagas que atendem aos filtros. Uma busca parcial informa quantos sites ficaram pendentes e oferece links de pesquisa no portal. Os filtros continuam sendo aplicados; não removemos CLT, modalidade ou período silenciosamente.

LinkedIn pode ser encontrado por referências públicas com Google Search sem consultar diretamente seu portal. A consulta direta permanece condicionada à autorização configurada. Isso não habilita envio pela API do LinkedIn. As consultas por IA retornam apenas anúncios com URLs individuais citadas; respostas incompletas ou sem fontes verificáveis são rejeitadas. A cota diária esgotada é distinguida de um limite temporário. A busca direta Gupy não depende de Gemini.

Sem API de candidatura conectada, a rotina prepara materiais e marca a candidatura como “Requer ação manual”. A pessoa revisa a apresentação, baixa o currículo, abre a vaga oficial e só depois confirma o envio. Nenhuma confirmação ou recibo é simulado. Candidaturas assistidas antigas que aguardavam uma aprovação de envio automático são ajustadas para revisão manual na próxima busca.

Novos PDFs e DOCXs, incluindo currículos criados no app, têm uma cópia original cifrada no PostgreSQL. O arquivo temporário serve como cópia de trabalho. O conteúdo cifrado é omitido da resposta de workspace e da exportação; o download requer a sessão do proprietário. Quando um upload antigo perdeu o arquivo temporário, o app oferece uma cópia em PDF feita apenas com o texto salvo, com nome e aviso próprios. A formatação original desses arquivos antigos exige um novo upload.

Validação em 14/10/2026: o cenário remoto + CLT + última semana tinha 56 anúncios coletados e zero visíveis porque o tipo Gupy era ignorado. Após atualização dos mesmos registros, 5 vagas passaram nos mesmos filtros e 4 candidaturas foram preparadas para revisão. Nenhum envio foi feito. Testes verificam os metadados, a separação de cotas, a busca por referências sem acesso direto ao LinkedIn, a preparação assistida e o download após remoção do arquivo temporário. O painel também foi verificado no navegador.

Fontes: [tipos publicados pela Gupy](https://developers.gupy.io/docs/listing-jobs), [autenticação Gupy](https://developers.gupy.io/docs/autentica%C3%A7%C3%A3o), [acesso às APIs LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [cotas Gemini](https://ai.google.dev/gemini-api/docs/rate-limits).
