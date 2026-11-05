# Auditoria de segurança, desempenho e candidaturas — 30/10/2026

Este documento registra a auditoria inicial. A correção posterior das pendências P1, os testes adicionais e a situação da hospedagem estão em [Correção das pendências de segurança](CORRECAO-PENDENCIAS-SEGURANCA-2026-10-30.md).

## Resultado e alcance

A revisão encontrou problemas reais no transporte de dados para executores, no controle de rede e no tratamento de arquivos. As correções abaixo foram implementadas no código local. Não houve publicação, mudança de IAM, alteração de contas de produção nem envio real de candidaturas.

Foram revisados os caminhos de autenticação e sessão, CSRF, acesso por conta, currículo e download, consentimento individual, reserva e execução de candidaturas, reconciliação e reentrega da fila, confirmação de recebimento, Gmail, webhook, navegadores ATS, sessões de portais, ponte da extensão Chrome, dados enviados à IA, armazenamento e carregamento do workspace, configuração pública e dependências.

Esta é uma revisão de código com testes locais e dados sintéticos. Não é uma certificação de segurança nem investigação de incidente. Os resultados não demonstram que houve vazamento de dados. A infraestrutura efetivamente publicada não foi inspecionada nesta tarefa.

## Problemas corrigidos

| Prioridade | Problema observado | Correção e evidência |
| --- | --- | --- |
| Alta | `applicationAnswerProfile` carregava todas as respostas aprovadas no perfil do executor, inclusive as vinculadas a outras vagas/empresas. Isso também alcançava o webhook configurado. O preenchimento filtrava respostas, mas o transporte do objeto não filtrava. | Filtra por origem, URL exata e confirmação antes de formar o payload. Respostas sensíveis sem vínculo ao destino são removidas, inclusive quando a política automática está desligada. `tests/automatic-answers.test.ts` cobre os dois estados e preservação do perfil original. |
| Alta, em adaptador legado | O formulário direto de empresa validava a leitura pública por DNS fixado, mas enviava o currículo com `fetch` e nova resolução DNS. Um domínio controlado poderia trocar o IP entre leitura e POST. A política atual do produto bloqueia sites avulsos; o problema ficaria exposto se esse adaptador fosse novamente autorizado. | `server/public-form-request.ts` valida todos os IPs resolvidos, fixa o IP no socket TLS e impede reutilização de conexões globais. Não segue redirects nem repete POST. Limita DNS/solicitação, corpo enviado e resposta recebida. Testes verificam IP privado/misto, preservação dos bytes multipart, redirects e resposta excessiva/inválida. |
| Alta, defesa em profundidade | O executor ATS roteava HTTP, mas não registrava uma política de WebSocket. Uma página comprometida tinha outro canal de rede fora dessa verificação. | Fecha todos os WebSockets antes de carregar formulários. Desabilita downloads automáticos nos contextos ATS local e em nuvem. `tests/ats-network-security.test.ts` verifica o fechamento e a restrição de origens HTTP. A separação entre rotas HTTP e WebSocket está na [API do Playwright](https://playwright.dev/docs/api/class-browsercontext#browser-context-route-web-socket). |
| Alta, disponibilidade | O DOCX confiava nos tamanhos declarados do ZIP e usava descompactação síncrona sem conferir o tamanho real contra esses metadados. O upload ainda varria cada byte procurando assinaturas do diretório. | Leitura estruturada do diretório ZIP32, limite de 500 entradas e 30 MiB declarados, validação de offsets/nome/método, recusa de entradas criptografadas ou ambíguas e `inflateRawSync` com `maxOutputLength`. O XML descompactado deve ter exatamente o tamanho declarado. Testes incluem tamanho forjado, arquivo grande, truncamento e offsets inválidos. |
| Média, disponibilidade | PDF de até 5 MiB podia conter quantidade arbitrária de páginas; o texto era cortado somente depois da extração completa. Upload, geração e reanálise tinham apenas o limite geral de 200 requisições/minuto. | PDF passa a aceitar entre 1 e 50 páginas, com verificação anterior à extração; esses três endpoints passam a 5 requisições/minuto por IP. Testes usam PDF real de 51 páginas e verificam HTTP 429. Isso reduz abuso, mas não substitui isolamento do parser nem limite distribuído. |
| Média | Portais e leitura pública usavam validadores de IP diferentes. O dos portais permitia categorias especiais recusadas pelo outro, como IPv6 6to4. | Centralização no validador de `public-web.ts`, com testes para IPv6 de transição, Teredo e endereços reservados. Não é uma implementação exaustiva do registro IANA. |
| Média | O executor aceitava diretamente `expiresAt` não interpretável como data, pois `NaN <= Date.now()` é falso. O roteador principal já recusava esse destino. | A entrada do executor também exige uma data finita, antes de abrir navegador ou enviar dados. |
| Média | Cabeçalhos internos de observação, integração de fila e visualizador não estavam na lista explícita de ocultação de logs. | Acrescentados à redação de logs. O verificador do build também passa a procurar segredo de cron e chaves internas adicionais no frontend. |

O runtime privado de portais passa da versão 22 para 23 para que sessões antigas reconheçam a atualização do código quando o novo backend for publicado. Não foi atualizado nenhum navegador de produção nesta tarefa.

## Dependências

A auditoria inicial de produção do npm apontou 7 pacotes afetados: 5 de severidade alta, 1 média e 1 baixa, incluindo efeitos transitivos. Alertas de dependência não significam que todas as condições de exploração estavam presentes no aplicativo.

| Pacote | Antes | Depois |
| --- | --- | --- |
| Fastify | 5.12.5 | 5.12.7 |
| Zod | 4.6.5 e cópia transitiva 4.1.11 | 4.6.7 |
| Undici | 7.30.0 | 7.30.1 |
| fast-uri | 3.1.8 / 4.2.1 | 3.1.9 / 4.2.3 |

`@vercel/cli-config` fixava uma versão antiga de Zod; foi aplicado um override específico para a versão corrigida, sem fazer downgrade de OIDC/Sandbox. Tipagem e build passaram com essa combinação. Manter esse override até que o fornecedor permita removê-lo com auditoria e testes verdes.

O `npm audit --json` final, incluindo dependências de desenvolvimento, registrou **zero alertas conhecidos**. Evidência local: `.data/security-npm-audit-2026-10-30.json`. Isso não cobre vulnerabilidades ainda desconhecidas nem a versão do Undici embutida no próprio Node.js. O [aviso oficial do Undici](https://github.com/nodejs/undici/security/advisories/GHSA-4w7w-5xrc-9h26) descreve a versão corrigida e as condições específicas do problema de cache/redirect; não foi constatado uso dessa composição de cache no código do projeto.

**Runtime local identificado: Node 24.15.0, com Undici embutido 7.24.4.** Essa instalação é anterior às versões de segurança 22.23.4, 24.22.1 e 26.12.1. O [comunicado oficial do Node de 21/10/2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) inclui correções de DNS, TLS e de corrupção de memória na descompactação Brotli. Não foi executado exploit. Foram atualizados `engines`, README e ambas as etapas Docker para uma base corrigida; isso prepara novas instalações/builds, mas não atualiza o executável local, imagens já publicadas ou o runtime gerenciado da hospedagem.

## Desempenho

O Firestore mantinha leituras sequenciais do payload básico e das seções de currículos, vagas e candidaturas. Essas partes são imutáveis e pertencem ao mesmo snapshot de metadados: agora são carregadas em paralelo. O teste `firestore-read-performance.test.ts` só libera a leitura quando as quatro partes estiverem simultaneamente em andamento e confere a reconstrução final. Isso elimina esperas de rede em série nesse trecho; não há medição de redução percentual da latência de produção.

Outros gargalos observados, ainda sem alteração arquitetural:

- As coleções de vagas e candidaturas continuam incorporadas ao workspace. Paginação da resposta não evita leitura/descompactação e análise do conjunto no servidor. Priorizar consultas por metadados e separação de registros quando o volume crescer.
- A rotina diária percorre contas e continua ciclos em sequência. Na Vercel, a invocação tem duração máxima de 300 segundos; contas lentas podem atrasar as seguintes. Despachar trabalho por conta, com concorrência limitada e cursor persistente, é a próxima evolução indicada.
- O build contém GIF de aproximadamente 2,48 MB para o mascote e GIF público de aproximadamente 2,15 MB para a capa. Quando exibidos, pesam no carregamento móvel. Converter para vídeo ou formato animado adequado requer verificar qualidade e acessibilidade; não foi trocada a identidade visual nesta revisão.
- O JavaScript principal do build mede aproximadamente 492 KB sem compressão e 157 KB gzip. Há carregamento separado de várias telas, mas ainda é possível reduzir o pacote inicial com análise de dependências e medição real.

## Proteções existentes e validação

O código já usa cookie HTTP-only, SameSite e secure em produção; tokens de sessão são consultados por hash. Operações mutativas exigem cabeçalho próprio e origem permitida. As regras Firestore do repositório negam acesso direto de clientes; o backend usa IAM. A existência desse arquivo não comprova as regras/IAM atualmente publicados.

Originais de currículos e sessões persistidas são cifrados com AES-GCM. O workspace público omite o arquivo cifrado. Downloads exigem que o currículo pertença ao workspace da sessão autenticada.

Foram criadas duas contas sintéticas independentes para verificar: download próprio permitido, download de terceiro recusado, alteração de currículo/vaga/candidatura de terceiro recusada, leitura de preparação de terceiro recusada, cancelamento de envio de terceiro recusado e ausência de identificadores privados na exportação da outra conta. Também foram verificados acesso sem sessão e escrita por origem hostil. O estado da primeira conta permaneceu idêntico após as tentativas.

Nos fluxos de envio revisados, o claim é persistido antes da transmissão, há reserva de cota e a autorização individual é revalidada contra currículo, destino, método e prazo. Respostas incertas permanecem como resultado desconhecido. A fila carrega identificadores em vez de currículos/cookies. Gmail verifica novamente o destinatário e não repete automaticamente depois de perder a resposta. Essas proteções não equivalem a uma garantia de entrega exatamente uma vez em serviços externos.

## Regressões de teste resolvidas

A varredura completa encontrou 30 falhas de testes. Foram corrigidos os cenários para acompanhar a política atual: publicações fictícias em hosts permitidos; empresas genéricas nos testes Quickin em vez de uma fonte explicitamente retirada; cadastros básicos completos; workspaces existentes nos testes de sessão; expectativas de suspensão LinkedIn e de recusa de agregadores; e classificação de preparação sem canal antes de iniciar outra busca. As regras de produção que recusam fontes retiradas e envios sem dados/consentimento foram preservadas.

Os testes de reconciliação exercitam novamente o formulário Quickin simulado, o worker, reentrega concorrente e resposta HTTP de recusa. Os cenários de API voltam a verificar recibos, resultado incerto, arquivo original e prevenção de tentativa duplicada. A nova cota de upload tem seu próprio teste de HTTP 429; cenários independentes de regressão usam IPs de teste distintos para não consumir uns dos outros a cota de abuso.

## Pendências prioritárias

1. **P1 — Atualização do Node em execução.** Atualizar a instalação local e verificar a versão efetiva na hospedagem e nos snapshots de navegador. A correção da imagem Docker só entra em vigor depois de reconstruir e publicar a imagem. `npm audit` com zero alertas não dispensa essa etapa.
2. **P1 — Egresso dos navegadores de sessão.** `protectBrowser` verifica DNS e depois deixa o Chromium resolver/conectar por conta própria; ainda existe uma janela teórica de DNS rebinding em recursos permitidos. Os sandboxes persistentes de portal são criados sem política explícita de bloqueio de redes privadas no código. Implementar firewall/proxy de saída que bloqueie IPv4/IPv6 privados/reservados e conferir a política efetiva na nuvem; para o modo local, exigir mecanismo equivalente. A proteção nova do POST direto não elimina esse risco em outro executor.
3. **P1 — Limites distribuídos e parser isolado.** O limitador atual fica por processo; várias instâncias/IPs contornam uma cota global. PDF ainda é processado no processo da API e a descompactação DOCX é síncrona, embora limitada. Separar parsing em worker descartável com limites de memória/tempo, e aplicar cota por conta em armazenamento compartilhado. Uma única página PDF complexa ainda pode ser cara.
4. **P2 — Minimização adicional no webhook.** O payload ainda transporta um perfil amplo e o texto do currículo ao gateway configurado. A filtragem de respostas de outras vagas foi corrigida, mas é recomendável versionar o contrato do gateway e definir a lista mínima de campos por destino.
5. **P2 — Verificação de infraestrutura.** Confirmar IAM efetivo do Firestore, acesso a backups, retenção/exclusão de snapshots e dados, rotação de chaves, permissões do webhook, armazenamento de segredos e versão Node/Chromium em produção. Não foram consultados esses recursos nem realizadas mudanças neles.

## Comandos e resultados

- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; verificador do frontend examinou 92 arquivos e não encontrou os segredos configurados procurados pelo script.
- Suíte focada: **42 testes aprovados**, em 8 arquivos. Evidência: `.data/security-targeted-tests-2026-10-30.json`.
- `npm audit --json`: zero alertas conhecidos. Evidência: `.data/security-npm-audit-2026-10-30.json`.
- Varredura completa: 918 aprovados, 30 falhas e 11 ignorados. Após corrigir os cenários, foram reexecutados os 11 arquivos afetados, com nova rodada dos três que ainda exigiam ajuste. Todos os 174 testes desses arquivos passaram nas respectivas últimas execuções.
- **Resultado consolidado da validação incremental: 948 aprovados, zero falhas e 11 ignorados, em 115 arquivos.** Foram combinados os resultados da varredura completa com as últimas reexecuções dos arquivos alterados; não se trata de uma terceira execução integral. Evidência: `.data/security-validation-final-2026-10-30.json`, com os relatórios de origem. Os testes Firestore que exigem credenciais explícitas continuam ignorados.

As evidências em `.data` são locais e ignoradas pelo Git. Os testes usam dados fictícios e requisições externas simuladas; nenhum teste novo envia candidaturas a empregadores.
