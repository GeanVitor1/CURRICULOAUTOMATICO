# Análise de currículo e especialização da IA

A análise ajuda a própria pessoa a melhorar o documento e orientar sua busca. Extrai fatos, mostra trechos que sustentam competências, diagnostica informações pendentes e distingue objetivo de experiência, formação e competências declaradas nas sugestões de cargos.

## O que foi implementado

- Leitura de seções em português e inglês, incluindo formação com escola e períodos, projetos, cursos, experiências informais e idiomas.
- Diagnóstico de cinco aspectos: objetivo, experiências/projetos, formação, competências e organização do texto. O resultado indica o que foi identificado e o que deve ser completado, sem atribuir uma nota à pessoa ou prever contratação.
- Orientações específicas da IA com citações conferidas no texto, perguntas para completar dados e prioridades. Os conselhos não alteram o currículo original nem aprovam qualificações automaticamente.
- Validação de cargos relacionados ao trecho citado, senioridade explícita e formação em andamento. Negação e usuários de um software não se tornam qualificações da pessoa.
- Análise local quando a IA está desativada, sem consentimento ou indisponível. O consentimento existente continua obrigatório para enviar dados profissionais ao provedor externo. Contatos são minimizados e documentos longos informam a cobertura parcial da IA.

## Como a IA é especializada hoje

`server/resume-analysis-prompt.ts` contém instruções versionadas e exemplos fictícios sobre desenvolvimento, primeiro emprego e formação em andamento. A resposta segue um esquema estruturado e passa por validação no servidor. O cache considera a versão das instruções.

Isso é especialização por instruções e exemplos, não treinamento dos pesos do Gemini. Não é possível afirmar uma melhoria de 1000% sem uma base de comparação e um conjunto representativo de avaliações. O Google documenta essas técnicas em [estratégias de prompting](https://ai.google.dev/gemini-api/docs/prompting-strategies) e [saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output).

Os testes de avaliação ficam separados dos exemplos do prompt em `tests/fixtures/resume-analysis-cases.ts`. São currículos fictícios; documentos de clientes não são usados para treinamento.

```powershell
npm run evaluate:resume
npm run evaluate:resume -- --live
npm run evaluate:resume -- --live --case=first-job-informal
```

O modo local não faz chamadas de IA. O modo `--live` chama o Gemini configurado no servidor com casos fictícios, consome a cota desse projeto e avalia a extração externa antes de combiná-la com a análise local. Os relatórios em `artifacts/resume-analysis-evaluation-*.json` mostram verificações aprovadas, reprovadas e falhas de provedor. O conjunto pequeno não mede precisão em todos os currículos reais.

## Próxima etapa para treinamento e melhoria contínua

1. Criar um conjunto maior e separado de currículos fictícios ou exemplos com autorização específica, cobrindo profissões, idiomas, níveis, PDFs com extração imperfeita e mudanças de carreira.
2. Revisar as respostas esperadas por uma pessoa com conhecimento de recrutamento. Medir campos corretos, competências não inventadas, cargos indevidos, citações válidas, utilidade das sugestões, tempo e custo.
3. Registrar avaliações e correções autorizadas como exemplos revisados, com controle de versão. Uma correção de usuário não deve ser incorporada automaticamente nem compartilhada com outros usuários.
4. Comparar versões de instruções e modelos no mesmo conjunto reservado de testes. Promover uma versão somente se ela melhorar as métricas sem aumentar erros relevantes.
5. Considerar ajuste supervisionado do modelo somente após reunir exemplos suficientes, confirmar suporte do provedor e avaliar custo e privacidade. Nenhum job de treinamento ou coleta de currículos reais foi iniciado.

Para documentos escaneados, a extração atual ainda exige OCR prévio. A análise de texto não verifica o desenho do PDF nem garante a interpretação de um ATS. Comparações com vagas dependem dos anúncios, dos requisitos explícitos e das informações confirmadas pela pessoa.
