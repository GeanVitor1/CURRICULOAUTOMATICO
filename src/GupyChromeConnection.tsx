export default function GupyChromeConnection({onCloud}:{onCloud:()=>void}) {
  return <section className="gupy-chrome-connection">
    <h1>Conecte a Gupy pelo seu Chrome</h1>
    <p>Faça login no navegador que você usa normalmente. Isso evita repetir o login pelo navegador da nuvem, onde a Gupy ou o Google podem recusar o acesso.</p>
    <ol>
      <li><a href="https://login.gupy.io/candidates/applications" target="_blank" rel="noreferrer">Abra a Gupy</a> e entre na sua conta. Deixe a página de candidaturas aberta.</li>
      <li><a href="/downloads/empregatos-gupy-chrome.zip" download>Baixe o conector do EmpreGatos</a> e extraia o ZIP em uma pasta.</li>
      <li>No Chrome, abra <strong>chrome://extensions</strong>, ative <strong>Modo do desenvolvedor</strong> e escolha <strong>Carregar sem compactação</strong>. Selecione a pasta extraída.</li>
      <li>Recarregue esta página. Abra o conector pelo ícone de extensões do Chrome e autorize <strong>Conectar sessão da Gupy</strong>.</li>
    </ol>
    <p>O conector transfere somente a sessão da Gupy, com sua autorização. Não lê sua senha nem a sessão do Google. O servidor verifica o acesso antes de permitir a confirmação; a conexão sozinha não envia candidaturas.</p>
    <p>Se a Gupy exigir nova verificação no servidor, mostraremos o impedimento. A transferência não garante que o portal aceitará a sessão.</p>
    <a href="/app#preferencias">Revisar preferências</a>
    <button className="remote-secondary" onClick={onCloud}>Usar login no navegador da nuvem</button>
  </section>;
}
