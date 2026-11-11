---
trigger: always_on
description: "Invariantes do EmpreGatos: candidaturas automáticas, qualquer profissão, isolamento por conta e recibos reais."
---

# EmpreGatos

## Incidente de memória no controle do computador

Em 28/10/2026 às 10h55, o evento 2004 do Windows registrou falta de memória virtual: `codex-computer-use.exe` consumia 24.630.493.184 bytes, e `tlou-ii.exe`, 21.083.189.248 bytes. O usuário relatou travamento do Chrome e fechamento do Visual Studio Code. Não reabra o controle visual nativo que apresentou esse consumo até haver uma correção verificável da ferramenta. Isso não é um erro comprovado da extensão do EmpreGatos. Não repita chamadas de observação para tentar recuperar esse componente, nem altere suas proteções de acesso. Antes de testes locais pesados, confira a memória disponível; com menos de 2 GB de RAM livre, adie builds e testes de navegador. Não encerre jogos, editores ou navegadores com possível trabalho não salvo sem autorização específica. O componente que esgotou a memória já não estava ativo na inspeção posterior; não anuncie que foi encerrado pelo assistente.

A verificação do LinkedIn pela extensão é uma funcionalidade geral para contas autenticadas, sem lista pessoal de IDs ou e-mails. A partir da versão 2.0.6, reconheça o login no próprio Chrome: não leia nem transfira cookies, tokens ou armazenamento de autenticação do LinkedIn. O servidor registra apenas uma observação recente, separada por conta; ela não comprova sessão ativa na nuvem nem autoriza candidaturas. O antigo `LINKEDIN_SESSION_RETEST_ENABLED` não pode reabrir a cópia de sessões, que foi desativada após desconexões repetidas. A causa específica da invalidação pelo portal não foi estabelecida; a nova arquitetura retira essa reutilização, mas testes sintéticos não comprovam estabilidade da conta real. Preserve a autorização no servidor; parâmetros do cliente não podem escolher outra conta nem liberar envios automáticos. Registros históricos não significam conexão estável. Desconectar no projeto não executa logout no Chrome da pessoa.

O produto busca vagas e envia candidaturas pelo trabalhador do projeto. Deve servir a profissões diferentes. Não fixe empresas, tecnologias, cargos ou IDs de uma pessoa como padrão para outras contas. Use o perfil, o currículo aprovado e os critérios da conta atual.

Por decisão do titular em 29/10/2026, Global TI/Globalti foi retirada da descoberta e dos envios, inclusive em plataformas reconhecidas e quando existirem permissões antigas. Preserve o histórico e os recibos; não reative essa fonte nem crie uma tentativa para testar sua retirada. A seleção de fontes usa portais conhecidos e anúncios diretos em plataformas de recrutamento; agregadores genéricos e formulários de sites avulsos não entram na automação.

A pesquisa automática é proporcional ao saldo diário real da conta e do plano. Aproveite candidaturas na fila e vagas aptas existentes antes de buscar outras. Examine até três candidatos por vaga diária, com teto de 30 por rodada e orçamento diário persistido; cinco vagas permitem até 15 anúncios no dia, não centenas. O orçamento de verificação de destinos também é limitado a três por vaga diária. Continuações não renovam esses orçamentos; a virada do dia permite retomada. Não altere os critérios do candidato para preencher a cota.

Mantenha o fluxo completo: publicação real, compatibilidade, destino verificado, respostas autorizadas, limite diário, fila durável, execução e confirmação do empregador. A busca por IA fornece pistas; o servidor verifica os fatos. Uma candidatura criada como rascunho, um clique no botão ou um teste controlado não comprovam recebimento.

Sessões, currículos, respostas, limites, histórico e navegadores pertencem à conta autenticada. A autorização de uma pessoa não se estende a outras. A cota Google do titular não é uma integração compartilhada entre clientes. Não registre tokens, cookies ou dados pessoais nos logs e artefatos públicos.

A extensão de conexões atende vários portais. Preserve o cadastro em `shared/browser-connectors.ts`, as permissões opcionais por domínio, a escolha do portal, a conta de destino visível e a autorização explícita em cada transferência. Não colete sessões em segundo plano, senhas, cookies Google nem dados de outro portal. Mantenha a pasta de instalação existente `browser-extension/gupy-session` e gere os pacotes pelo script de empacotamento.

O conector usa uma aba persistente para não desaparecer ao abrir o portal ou pedir permissão. Atualizações reparam a comunicação com páginas já abertas; a reinjeção deve ser idempotente e limitada ao próprio projeto. A página mostra a versão instalada e o andamento, mas esses avisos não comprovam conexão: somente a verificação e o salvamento no servidor podem fazê-lo. Preserve esses comportamentos ao redesenhar a interface.

Na extensão, a volta do login atualiza a conta de destino e limpa o consentimento; não faça isso no meio de uma operação. Importações têm espera limitada e exigem resposta autenticada utilizável; o LinkedIn exige a observação local registrada. Respostas vazias ou HTML não significam sucesso. Interrupção ambígua do canal não permite repetir nem importação nem registro local. No site, preserve somente retornos internos permitidos após autenticação, tolere armazenamento bloqueado e descarte caches privados quando mudar o titular.

Depois de uma verificação local registrada, a página do LinkedIn mostra a conclusão e uma saída para o painel, inclusive ao ser reaberta. Não repita os passos iniciais, o aviso de instalação ou a instrução para clicar no botão que acabou de ser usado. Uma nova verificação é opcional e explícita. Um registro antigo continua identificado como histórico; ele não comprova login atual e não deve reiniciar o passo a passo automaticamente.

Na instalação de desenvolvimento, incremente a versão do manifesto a cada nova versão. O atualizador verifica apenas `release.json` e `manifest.json` locais e recarrega quando o conector está fechado. Ele não baixa código remoto nem transfere sessões. O pacote da Chrome Web Store usa o mecanismo de atualização do Chrome; uma cópia extraída em outro computador não recebe arquivos da pasta do desenvolvedor. Não anuncie publicação ou atualização pela loja antes de ela existir.

O guia de instalação fica em `ChromeExtensionInstallation`, compartilhado pelos portais. Quando a extensão responder, substitua a instalação pelo estado detectado. O botão da Chrome Web Store exige `VITE_CHROME_WEB_STORE_URL` com a URL real de uma publicação verificada; não use link inventado ou a página genérica da loja. O site abre a loja e o usuário confirma a instalação no Chrome. Não tente contornar essa confirmação com instalação silenciosa ou alterações nas políticas do navegador.

No primeiro acesso, use `GettingStarted` e o progresso derivado de `shared/getting-started.ts`: currículo, dados, preferências e início da rotina. Importar ou criar currículo fica acessível antes do formulário completo; dados pendentes continuam obrigatórios antes de concluir as preferências e liberar o envio no servidor. Não marque etapas pelo clique no guia, não aprove currículos nem ative a rotina automaticamente para concluir um tutorial. Contas já configuradas ou pausadas não reiniciam a apresentação inicial; a ajuda fica disponível em “Como usar”. Preserve a entrevista vinculada ao currículo atual e mantenha opções técnicas fora do caminho inicial.

Login conectado e integração de envio são capacidades distintas. `PORTAL_CLOUD_SESSION_PORTALS` habilita conexões; não use essa lista para autorizar candidaturas. LinkedIn está disponível somente para conexão nesta versão. Salvar conexão sem autorizar envios não pode liberar a rotina; conexões de envio na nuvem exigem o currículo aprovado correspondente. Testes com sessões sintéticas validam o fluxo técnico, não comprovam aceitação de sessões reais pelo portal.

Não altere preferências para produzir números. Não invente experiência, certificações ou respostas. Consentimentos e declarações sensíveis exigem resposta aprovada para o destino exato. Não resolva testes de seleção no lugar do candidato. Respeite verificações humanas e bloqueios.

Preserve a idempotência. Uma pausa comprovadamente anterior ao envio pode ser retomada após corrigir a causa. Um resultado incerto ou um envio confirmado nunca autoriza repetição automática. Rejeição no processo seletivo e falha de transmissão são eventos diferentes; registre a evidência observada.

Formulários dinâmicos podem mostrar uma estrutura vazia antes dos controles. Use espera limitada e evidências da tela. Ao mudar o executor remoto, atualize a versão compartilhada e confira que o navegador usa o código publicado. Uma correção do leitor só permite uma nova inspeção de rascunhos elegíveis por versão.

Corrija a causa no código e valide o caminho usado em produção. Teste o comportamento alterado, os bloqueios contra duplicação e o isolamento pertinente. Comprove autonomia pelo histórico do trabalhador e por recibos reais; envios manuais do assistente não validam o produto. Informe a publicação, o resultado comprovado e os limites ainda não validados.
