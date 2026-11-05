# Correção das pendências de segurança — 30/10/2026

Continuação da [auditoria inicial](AUDITORIA-SEGURANCA-DESEMPENHO-2026-10-30.md), concentrada nas três pendências P1: runtime efetivo, saída de rede dos navegadores e processamento de documentos por conta.

## Runtime efetivo

- Instalado Node 24.22.2 no usuário Windows, em `%LOCALAPPDATA%\EmpreGatos\runtime\node-v24.22.2-win-x64`, com SHA-256 conferido contra o arquivo oficial da distribuição. O runtime executado confirmou Undici 7.30.1.
- Todos os scripts npm do projeto passam por `scripts/secure-node.mjs`, que usa esse executável quando o Node que iniciou o comando está desatualizado. A instalação global do Windows continua na versão 24.15.0; ela não foi substituída. Comandos externos ao projeto não são abrangidos por essa seleção.
- API e executores exigem uma linha suportada com as correções de segurança: 22.23.4+, 24.22.1+ ou 26.12.1+. Imagem Docker e `engines` já exigiam versões corrigidas na auditoria inicial.
- Ao preparar um sandbox antigo, o backend confere a versão efetiva. Se necessário, instala o binário oficial Linux x64 22.23.4 em diretório próprio, valida SHA-256, e só então aceita o executável. Falha de atualização impede a transmissão do documento. O snapshot original e as sessões não são apagados.

As versões mínimas seguem o [aviso oficial de segurança do Node](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). O instalador do sandbox é fixo e não recebe dados de candidatos.

## Saída de rede dos navegadores

- Navegadores do aplicativo passam por um proxy CONNECT local. Para cada nova conexão, ele valida todos os IPs resolvidos e conecta diretamente ao IP numérico aprovado. O Chromium não faz uma segunda resolução do destino para esse socket.
- O proxy permite apenas TLS na porta 443, recusa HTTP simples e endereços privados/reservados, limita conexões e aplica prazos de conexão/ociosidade. A validação de certificado continua no Chromium; o proxy não termina TLS nem registra os conteúdos.
- QUIC, bypass implícito de loopback e tráfego UDP não intermediado de WebRTC são desabilitados. As restrições de domínios, WebSocket e downloads já existentes nos executores são preservadas.
- Novos sandboxes recebem política de rede explícita. A configuração persistida dos sandboxes recuperados é atualizada antes da retomada e de qualquer comando de processamento, usando `Sandbox.update`. O firewall nega redes especiais IPv4; executores ATS mantêm também a lista de domínios do destino. A política de portais mantém acesso a hosts públicos porque os logins usam fornecedores externos.
- A versão do runtime privado de portais sobe para 24.

A [documentação do firewall da Vercel](https://vercel.com/docs/sandbox/concepts/firewall) descreve a precedência das negações de sub-rede e atualização da política em execução. O firewall complementa o proxy; ambos precisam estar operantes.

Um Chromium real conseguiu abrir `https://example.com/` com HTTP 200 pelo proxy. No teste negativo, um servidor HTTP de loopback permaneceu sem receber nenhuma requisição. Testes de socket verificaram IP fixado e rejeição de DNS privado/misto, inclusive IPv6 privado e de transição.

O teste real da API da Vercel recusou `::/128` com HTTP 400, embora a documentação mencione CIDR IPv6 em exemplos de escopo. A política enviada à plataforma foi ajustada para CIDRs IPv4 suportados. O bloqueio de endereços privados IPv6 continua no proxy, antes de abrir o socket. Não foi constatado um firewall IPv6 independente em nível de infraestrutura.

Um sandbox temporário sem persistência aceitou a política de 14 redes negadas, respondeu HTTP 200 em HTTPS público e não estabeleceu conexão TCP ao endereço de metadados `169.254.169.254`. O Node efetivo desse ambiente foi 24.22.1. O ambiente temporário foi encerrado sem snapshot. Evidência: `.data/security-cloud-probe.json`.

## Documentos e limites por conta

- PDF/DOCX são lidos em processo descartável, usando o mesmo Node corrigido da API e worker compilado. O processo recebe somente variáveis necessárias ao sistema operacional; não recebe chaves de banco, OAuth, IA ou cifragem da API.
- Limites: entrada de 5 MiB, uma leitura simultânea por processo da API, heap JavaScript de 192 MiB, prazo de 15 segundos, saída de 512.000 bytes e texto de 100.000 caracteres. O RSS é observado a cada 300 ms e o processo é interrompido acima de 384 MiB. A observação de RSS não é um limite rígido de memória imposto pelo kernel.
- Mantidos os limites estruturais anteriores de PDF e ZIP/DOCX. Corrupção de arquivo e indisponibilidade do leitor permanecem distinguíveis de limite de recursos.
- Upload, geração e reanálise têm cinco solicitações por minuto por conta e por ação. Uma lease persistida permite somente um processamento de documentos ativo por conta, abrangendo as três ações. O prazo da lease é de 180 segundos e a liberação exige o mesmo token que a adquiriu.
- A reserva acontece em `mutateWorkspace`, na transação do armazenamento compartilhado. Troca de IP ou outra instância da API não reinicia a cota. O limite por IP continua aplicado adicionalmente.
- Respostas HTTP 429 incluem `Retry-After`; os metadados da cota não aparecem no workspace público nem na exportação.

O isolamento em processo reduz impacto de travamento e consumo de recursos. Não equivale a uma sandbox de sistema operacional: uma eventual execução de código nativo ainda teria os privilégios do usuário do processo. Separação de identidade, filesystem e contêiner do parser permanece como defesa adicional possível.

## Hospedagem e ambientes existentes

A sessão existente da Vercel foi renovada pelo CLI oficial. A consulta ao projeto confirmou Node configurado como `24.x`. Na inspeção inicial, os seis sandboxes de portais estavam parados e sem a nova política personalizada aplicada.

A primeira candidata, construída na linha 24, respondeu HTTP 503 antes de inicializar a API porque o runtime gerenciado não atendeu à versão mínima exigida. O stack do log aponta a recusa em `assertSecureNode`; a versão numérica completa não estava nesse log. Essa candidata não foi promovida. A [Vercel permite selecionar somente a versão principal e pode usar patches diferentes no build e na função](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). `engines` passou a aceitar também a linha 26 corrigida para validar uma nova candidata nessa linha. Falhas de inicialização agora registram apenas código seguro e as versões efetivas de Node/Undici, sem mensagens que possam conter credenciais.

Os seis ambientes existentes receberam a política persistida enquanto estavam parados. Depois foram retomados, um por vez, somente para conferir/atualizar o executável Node. Os seis passaram a executar **Node 22.23.4**, com download e checksum oficiais conferidos pelo instalador. Foram novamente encerrados preservando as sessões. A consulta posterior confirmou **seis parados e seis com política personalizada**, incluindo bloqueio da rede de metadados. Nenhum formulário foi aberto ou enviado nessa manutenção. Evidências: `.data/security-fleet-maintenance.json` e `.data/security-sandboxes-metadata.json`.

A criação de **novos sandboxes persistentes** continua recusada com HTTP 402 por limite Hobby de **Snapshots Storage**, também após a manutenção. A plataforma informou reposição em **01/11/2026 às 00:00 UTC** (31/10 às 21h em São Paulo). Ambientes temporários sem persistência funcionaram; a manutenção dos seis existentes também funcionou. Não houve exclusão manual de snapshots/sessões nem contratação de plano. A retenção normal da plataforma ao parar os ambientes permanece a configurada anteriormente. Evidência: `.data/security-persistent-capacity.json`.

O código agora classifica falha de preparação e HTTP 402 como ação necessária antes da transmissão, em vez de tratar como entrega incerta. Testes confirmam que nenhum arquivo do candidato é escrito quando a atualização do runtime falha, e que falhas após iniciar o formulário continuam com resultado desconhecido quando não há evidência segura.

O bloqueio de capacidade limita a criação de novos ambientes persistentes; ele não impediu corrigir os seis existentes. O backend atualizado exige as proteções antes de transmitir novos dados. Não se deve interpretar esse limite de hospedagem como falha de instalação da extensão Chrome.

## Validação

- Tipagem e build locais aprovados.
- Primeira suíte completa no Node 24: 973 aprovados, três falhas em expectativas/mocks antigos do executor de nuvem e 11 integrações Firestore ignoradas por exigirem credenciais explícitas. As falhas foram corrigidas e os cenários de falha antes/depois da transmissão foram preservados.
- Segunda suíte completa, agora com Node 26.13.0 no Windows: 978 aprovados, uma falha no teste de CIDRs durante a alteração da política de nuvem e 11 ignorados. Essa execução começou antes do ajuste imposto pelo HTTP 400 real da plataforma.
- A última reexecução dos seis arquivos afetados aprovou **40 testes**. Inclui o teste de política persistida antes de retomar/comandar o portal e três novos testes de bloqueio de IPv6 no proxy.
- Consolidação por arquivo da suíte Node 26 com a última reexecução: **983 aprovados, zero falhas e 11 ignorados, em 122 arquivos**. Não é uma terceira execução integral após os ajustes finais. Evidência: `.data/pending-security-validation-final.json`, que referencia `.data/pending-security-node26-full-tests.json` e `.data/pending-security-final-recheck.json`.
- Auditoria npm: zero alertas conhecidos, incluindo desenvolvimento. Evidência: `.data/pending-security-npm-audit.json`.
- PDF e DOCX reais foram lidos em subprocesso nos testes; testes adicionais verificaram deadline, excesso de saída, concorrência e ausência de segredos no ambiente filho.
- Duas APIs independentes usando o mesmo armazenamento recusaram a sexta solicitação por conta apesar da troca de IP; a disputa simultânea pela lease admitiu somente um processamento.
- Nenhuma candidatura real foi enviada como teste.

O pacote final confirmou na própria função **Node 26.12.1 / Undici 8.12.2**, conexão com Firestore e uploads reais de PDF/DOCX usando dados sintéticos. Os metadados internos da cota foram omitidos e a conta sintética foi excluída com sucesso. Evidência: `.data/security-candidate-verification.json`.

## Publicação confirmada

O deployment `dpl_FCHqHcktD21vc9RfFPitTVq2rBJh` foi promovido para [curriculoautomatico.vercel.app](https://curriculoautomatico.vercel.app). A verificação posterior, às 12:59:52 UTC (09:59:52 em São Paulo), confirmou:

- `/api/health`: HTTP 200, Cloud Firestore, revisão `bf2fc1b8dcdadff2053a95f78bbc36782c6920893b58153456e3782a93355dcb`.
- Diagnóstico privado: HTTP 200, o mesmo deployment, Node 26.12.1 e Undici 8.12.2.
- Frota de portais: seis ambientes parados, todos com política personalizada; os seis executáveis privados haviam sido verificados como Node 22.23.4 na manutenção.

As candidatas anteriores não foram promovidas. A configuração geral do projeto ainda informa `24.x`; a versão 26 efetiva do pacote é selecionada pelo `engines` e foi confirmada no processo da função. O Node global do Windows não foi alterado.

Evidências locais: `.data/security-production-promotion-status.log`, `.data/security-main-status-after.json`, `.data/security-fleet-maintenance.json` e `.data/security-sandboxes-metadata.json`.

As pendências P2 da auditoria inicial, como revisão de IAM/retenção e contrato mínimo do webhook, não são eliminadas por estas três correções P1.
