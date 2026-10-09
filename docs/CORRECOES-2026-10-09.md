# Correções de currículo, busca e candidatura — 09/10/2026

O currículo de analista de sistemas e desenvolvedor full stack passou a sugerir Analista de sistemas, Desenvolvedor full stack, Desenvolvedor .NET, software, frontend e backend. Palavras encontradas em tecnologias, integrações e perfis de usuários não sustentam profissões do candidato. Também foram cobertas formação médica concluída/em andamento, tarefas incidentais de médicos, experiência real em comércio e mudanças de carreira.

Sugestões locais antigas são recalculadas ao carregar a conta. Cargos anteriormente confirmados que perderam a evidência deixam de orientar a busca; filtros próprios e aprovação do arquivo são preservados. A interface solicita confirmar novamente as sugestões corrigidas. Sugestões Gemini passam pela verificação de contexto além da conferência literal da citação.

Gupy e LinkedIn têm consulta pública independente do Gemini. A Gupy lê a listagem do próprio portal; o LinkedIn lê a lista e requisitos de até 12 anúncios. Links novos da Gupy são reconhecidos. São mantidos salário, contrato, localização e disponibilidade desconhecidos quando a fonte não os informa. As consultas têm cache de cinco minutos e limites documentados no README. Vagas expiradas são descartadas quando o prazo é informado.

Explorar vagas oferece Buscar vagas, usando Gupy se não existem fontes, e Buscar também na Gupy após falha de outras fontes. A busca mantém os cargos, a cidade e a modalidade escolhidos. Nenhum critério é ampliado para preencher uma tela vazia.

A preparação gera imediatamente uma apresentação local e abre Candidaturas. A tela orienta revisar a apresentação, baixar o arquivo, finalizar no portal e confirmar o envio. Gemini é opcional para atualizar a apresentação. Falha do provedor não impede esse fluxo.

## Evidência

- 106 testes unitários/API aprovados, incluindo regressões específicas do currículo relatado, contexto clínico, dados antigos, URLs, consultas públicas e cache.
- Os 11 cenários de navegador existentes passaram. O cenário adicional de desenvolvedor passou com sugestões coerentes, consulta real na Gupy, preparação com apresentação e currículo, sem registrar envio.
- TypeScript e build de produção aprovados.
- Consulta pública de Desenvolvedor .NET: 26 anúncios válidos da Gupy e 10 do LinkedIn; os 10 anúncios do LinkedIn tiveram os requisitos lidos na consulta realizada. Contagens representam esse instante, sem promessa de vagas disponíveis ou cobertura integral.
- A consulta de desenvolvimento em Ilhéus retornou zero; cidade, contrato PJ e atuação presencial não foram ampliados automaticamente.
- As contas de teste foram excluídas ao final. Nenhuma candidatura foi enviada a empregadores.
- Capturas: `artifacts/developer-suggestions-1440.png`, `artifacts/developer-suggestions-375.png` e `artifacts/developer-candidature.png`.

## Limite do envio

O sistema prepara candidaturas para LinkedIn, Gupy, InfoJobs e Indeed; o usuário conclui o envio no processo oficial. Envio automático real continua dependendo de adapter autorizado e recibo, pois não existe nesta instalação uma integração autenticada de envio a esses portais. O status Enviada exige confirmação do usuário ou recibo da integração. Esta correção não declara automação de envio nesses portais nem prontidão comercial completa.
