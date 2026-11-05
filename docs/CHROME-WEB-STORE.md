# Primeira publicação da extensão EmpreGatos

**Pacote atual em 29/10/2026:** `artifacts/chrome-web-store/empregatos-2.0.9.zip`, também disponível em `public/downloads/empregatos-chrome-web-store.zip`, após a rodada de QA. O canal é `store`, com apenas `cookies`, `scripting` e `storage`; a permissão `alarms` permanece exclusiva do desenvolvimento. A versão 2.0.9 corrige a retomada da conta, as esperas e a validação das respostas. O site e seus downloads foram publicados; o pacote não foi enviado ao painel da loja nesta rodada e a publicação na Chrome Web Store continua sem confirmação. As respostas do formulário estão em `artifacts/chrome-web-store/preenchimento-loja.md`. Não há credenciais dedicadas de revisão criadas; o campo opcional orienta cadastro gratuito.

Estado em 29/10/2026: pacote 2.0.7 preparado; extensão ainda não publicada. O titular informou que concluiu o cadastro de desenvolvedor e pagou a taxa. O Chrome conectado respondeu novamente: a ferramenta identificou o perfil Gean e listou suas abas. Após o titular abrir o painel, a lista de abas confirmou o título `Página "Detalhes do app"` e o endereço do item `nhagdilhhobieffanmbonknpmmocpodl/edit`. A leitura e a captura dessa página foram recusadas com `The extensions gallery cannot be scripted`. A ferramenta não inspecionou os campos nem enviou o item à análise. Isso não indica falta de instalação ou de permissão geral do Chrome. O titular autorizou a identificação e o contato públicos abaixo. Não declarar aprovação, envio à revisão ou disponibilidade na loja antes de ocorrerem.

O titular informou que o upload foi concluído e o item está em **Rascunho**, com ID **nhagdilhhobieffanmbonknpmmocpodl**. O estado do painel ainda não foi inspecionado pela ferramenta. Não repetir a criação do item e não habilitar o botão de instalação antes da publicação e verificação do link público.

**Responsável público:** Gean Vitor Estevs Dantas

**Suporte e privacidade:** geandk36@gmail.com

## Arquivo para upload

`public/downloads/empregatos-chrome-web-store.zip`

Esse é o pacote de canal `store`, com ícones PNG de 16, 32, 48 e 128 pixels e sem a permissão `alarms`. As atualizações desse canal dependem da Chrome Web Store. O pacote manual de desenvolvimento permanece separado.

## Cadastro e envio

1. O titular acessa https://chrome.google.com/webstore/devconsole e conclui o cadastro de desenvolvedor, os termos e a taxa de registro solicitados pelo Google. Use uma conta que continuará sob controle do responsável pelo produto.
2. Confirme os dados públicos do desenvolvedor e a verificação de e-mail exigida no painel. Ative a verificação em duas etapas da conta Google se o painel solicitar.
3. Escolha **Novo item** e envie o ZIP do canal `store` acima.
4. Revise a descrição, o ícone, a captura de tela e as declarações de privacidade com o comportamento real. O material abaixo é um rascunho para esse preenchimento.
5. Confira no site a política `/privacy`, com responsável e contato autorizados. A configuração do banco foi consultada em modo de leitura em 29/10/2026: sem backups periódicos agendados e com retenção técnica de versões de 3600 segundos. Não declarar prazos de outros provedores nem certificações que não foram verificados.
6. Envie à revisão do Google. Preparar o pacote ou carregar o item como rascunho não significa estar publicado ou aprovado.

## Texto da página da loja

**Nome:** EmpreGatos — conexões de portais

**Resumo:** Conecte seus portais de vagas ao EmpreGatos. Verifique o LinkedIn no Chrome e autorize cada conexão separadamente.

**Descrição detalhada:**

Conecte os portais que você usa para buscar emprego ao EmpreGatos pelo seu Chrome. Uma única extensão atende Gupy, InfoJobs, Glassdoor e LinkedIn, com autorização separada para cada portal.

- Confira a conta de destino no EmpreGatos antes de conectar.
- Abra o portal e faça login normalmente no seu navegador.
- Autorize somente o portal escolhido e acompanhe o resultado da conexão.
- No LinkedIn, o login é reconhecido localmente no Chrome: cookies e tokens não são transferidos. Essa verificação não habilita candidaturas automáticas pelo LinkedIn.
- Em Gupy, InfoJobs e Glassdoor, a sessão autorizada é enviada à sua conta do EmpreGatos para verificação e só é salva de forma cifrada após sua confirmação.

A extensão não lê senhas nem a sessão do Google. Ela não coleta sessões em segundo plano. A conexão de um portal e a autorização de candidaturas são etapas diferentes; as opções de envio dependem das integrações disponíveis e das preferências aprovadas na sua conta.

Requer uma conta no EmpreGatos e o Chrome no computador. Não é uma extensão oficial dos portais de vagas e não possui vínculo com LinkedIn, Gupy, InfoJobs ou Glassdoor.

**Idioma:** português (Brasil)

**Site:** https://curriculoautomatico.vercel.app

**Política de privacidade:** https://curriculoautomatico.vercel.app/privacy

**E-mail público de suporte:** geandk36@gmail.com

**Responsável:** Gean Vitor Estevs Dantas

**Captura:** `artifacts/chrome-web-store/screenshot-1280x800.png`, quando produzida pelo teste controlado. Mostra a extensão real com uma conta de demonstração, sem dados de uma pessoa real. Conferir o arquivo antes do envio. Não usar a prévia do botão da loja como se a publicação já existisse.

## Propósito único e permissões

**Propósito único:** conectar, com autorização explícita, o portal de vagas selecionado à conta autenticada do usuário no EmpreGatos; o LinkedIn é apenas verificado localmente no Chrome nesta versão.

| Permissão | Justificativa para o painel |
| --- | --- |
| `cookies` | Ler cookies seguros somente do portal escolhido e autorizado para Gupy, InfoJobs ou Glassdoor, a fim de verificar a sessão na conta do usuário. Não é usada para ler cookies do LinkedIn, do Google ou de outros sites. |
| `scripting` | Reconhecer se o usuário está autenticado na aba autorizada e manter a ponte de comunicação com a página do EmpreGatos. A leitura de armazenamento de autenticação é restrita aos portais que permitem transferência; no LinkedIn, somente o resultado do reconhecimento local é utilizado. |
| `storage` | Guardar localmente o portal selecionado e o estado de abertura do login. Não guarda cookies ou tokens no armazenamento da extensão. |
| Acesso ao domínio EmpreGatos | Conferir a identidade da conta de destino e enviar a conexão pela sessão já autenticada dessa conta. |
| Domínios opcionais dos portais | Localizar as abas do portal selecionado e executar a verificação solicitada pela pessoa. O acesso é pedido separadamente, no clique de conexão. |

**Código remoto:** não. O JavaScript executado está empacotado com a extensão. O canal da loja não baixa código nem usa o verificador local de atualizações do canal de desenvolvimento.

**Dados a declarar com precisão:** informações de autenticação (cookies e armazenamento de sessão dos portais com transferência), informações de identificação da conta de destino exibidas pela extensão, atividade de navegação limitada às URLs dos portais escolhidos e processamento do conteúdo necessário para reconhecer o login. O Google exige declaração também para processamento local. Não marcar “não trata dados” apenas porque o LinkedIn permanece no Chrome. Ajuste os nomes das categorias aos campos vigentes no painel e revise as declarações antes do envio.

O domínio de destino das transferências é o próprio serviço EmpreGatos. Os dados de autenticação não são usados em publicidade, vendidos ou enviados a provedores de IA pelo conector. Não declarar uma conexão ou uma integração de envio que o código não implementa.

## Ativar o botão da loja no site

Somente depois da publicação e da confirmação do link público, configure no build de produção:

```env
VITE_CHROME_WEB_STORE_URL=https://chromewebstore.google.com/detail/NOME/ID_REAL_DA_EXTENSAO
```

O site aceita apenas uma URL HTTPS de uma página de extensão em `chromewebstore.google.com`, com ID válido. Sem o link real configurado, exibe o guia manual e informa que a versão da loja ainda não foi publicada. Com o link configurado, o botão **Instalar no Chrome** abre a página da loja; a confirmação final é feita pelo usuário no Chrome. Um site não instala silenciosamente uma extensão no navegador de outra pessoa.

## Referências oficiais

- Cadastro: https://developer.chrome.com/docs/webstore/register
- Preparação: https://developer.chrome.com/docs/webstore/prepare
- Publicação: https://developer.chrome.com/docs/webstore/publish
- Imagens: https://developer.chrome.com/docs/webstore/images
- Privacidade: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Distribuição: https://developer.chrome.com/docs/extensions/how-to/distribute
