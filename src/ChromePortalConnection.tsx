import {
  browserConnectors,
  type BrowserSessionPortal,
} from "../shared/browser-connectors";
import {sessionTransferSuspension,type BrowserConnectionAccess} from '../shared/session-transfer-policy';
import ChromeExtensionInstallation from './ChromeExtensionInstallation';

const allPortals = Object.entries(browserConnectors) as [
  BrowserSessionPortal,
  (typeof browserConnectors)[BrowserSessionPortal],
][];

export default function ChromePortalConnection({
  portal,
  onCloud,
  extensionStatus,
  onOpenConnector,
  access,
}: {
  portal: BrowserSessionPortal;
  onCloud: () => void;
  extensionStatus?: {version:string;text:string;kind:string}|null;
  onOpenConnector?: () => void;
  access?: BrowserConnectionAccess|null;
}) {
  const provider = browserConnectors[portal];
  const installation=<ChromeExtensionInstallation installedVersion={extensionStatus?.version} onOpenConnector={onOpenConnector} onCheckInstallation={()=>window.postMessage({type:'empregatos:request-connector-status',portal},location.origin)}/>;
  if(portal==='linkedin'&&!access)return <div className="remote-loading" role="status"><span className="remote-spinner" aria-hidden="true"/><span>Conferindo a liberação do LinkedIn para sua conta…</span></div>;
  if(portal==='linkedin'&&access?.mode==='local-browser'){
    const recent=!!access.localLogin&&access.localLogin.expiresAt>Date.now();
    const working=extensionStatus?.kind==='connecting';
    const completed=!!access.localLogin&&!working;
    const failed=extensionStatus?.kind==='error';
    return <section className="gupy-chrome-connection"><div className="chrome-connection-shell">
      <a className="chrome-back-link" href="/app#automacao">← Voltar ao painel</a>
      <header className="chrome-connection-hero"><h1>{completed?(failed?'Verificação anterior do LinkedIn registrada':'Verificação do LinkedIn concluída'):'Verifique o LinkedIn no seu Chrome'}</h1><p>{completed?'O resultado da última verificação ficou registrado na sua conta do EmpreGatos.':access.notice}</p></header>
      <div className="chrome-notice-banner" role={extensionStatus?.kind==='error'?'alert':'status'} aria-busy={working}>
        {working&&<span className="remote-spinner" aria-hidden="true"/>}
        <strong>{working?'Verificando seu login…':failed?'Não foi possível concluir a nova verificação':recent?'Login reconhecido no Chrome':completed?'Login reconhecido na última verificação':'Verificação do login pendente'}</strong>
        {extensionStatus&&(!completed||extensionStatus.kind==='error')&&<p>Conector {extensionStatus.version}: {extensionStatus.text}</p>}
        {completed&&<p>{failed?'O registro anterior foi mantido. Você pode voltar ao painel ou tentar uma nova verificação.':'Você pode voltar ao painel. Não é necessário repetir a verificação para concluir esta etapa.'}</p>}
        {access.localLogin&&<p>Última verificação: {new Date(access.localLogin.observedAt).toLocaleString('pt-BR')}. {recent?'O login foi reconhecido recentemente.':'Este é um registro anterior; uma nova verificação pode atualizar o resultado.'}</p>}
      </div>
      {completed?<>
        <div className="chrome-install-grid"><a className="chrome-download-btn" href="/app#automacao">Concluir e voltar ao painel</a>{onOpenConnector&&<button className="remote-secondary" onClick={onOpenConnector}>Verificar novamente</button>}</div>
        <p>{access.notice}</p>
      </>:working?<p>Aguarde nesta página. O resultado aparecerá automaticamente quando a verificação terminar.</p>:<>
      {installation}
      {extensionStatus&&<div className="chrome-section-block"><div className="chrome-section-heading"><span className="chrome-section-kicker">Próximo passo</span><h2>Agora verifique seu LinkedIn</h2></div><ol className="chrome-mini-list"><li>Abra o LinkedIn e entre normalmente no seu Chrome.</li><li>No conector, selecione LinkedIn, confira sua conta do EmpreGatos e autorize a verificação local.</li><li>Clique em <strong>Verificar LinkedIn no meu Chrome</strong>. O resultado aparecerá aqui após o registro no servidor.</li></ol><a className="chrome-step-link" href={provider.accountUrl} target="_blank" rel="noreferrer">Abrir LinkedIn ↗</a></div>}
      </>}
    </div></section>;
  }
  const suspension = portal==='linkedin' ? access?.unavailableReason||sessionTransferSuspension(portal) : null;
  if (suspension) return <section className="gupy-chrome-connection">
    <div className="chrome-connection-shell">
      <a className="chrome-back-link" href="/app#automacao">← Voltar ao painel</a>
      <header className="chrome-connection-hero">
        <h1>Conexão do {provider.name} em revisão</h1>
        <p>{suspension}</p>
        <p>Não é necessário reinstalar a extensão nem repetir a transferência. Um registro de sessão salvo anteriormente não confirma que o login continua válido.</p>
        <a className="chrome-step-link" href={provider.accountUrl} target="_blank" rel="noreferrer">Abrir meu LinkedIn no Chrome ↗</a>
      </header>
    </div>
  </section>;
  return (
    <section className="gupy-chrome-connection">
      <div className="chrome-connection-shell">
        <div className="chrome-connection-topbar">
          <a className="chrome-back-link" href="/app#automacao">
            ← Voltar ao painel
          </a>
          <span className="chrome-badge">Extensão do EmpreGatos · Chrome</span>
        </div>

        <header className="chrome-connection-hero">
          <h1>Conecte o {provider.name} pelo seu Chrome</h1>
          <p>
            Use a mesma extensão do EmpreGatos para Gupy, InfoJobs, Glassdoor e
            LinkedIn. Você faz login normalmente no seu navegador e cada portal
            tem sua própria autorização explícita.
          </p>
          <div className="chrome-portal-pills" aria-label="Portais compatíveis">
            {allPortals.map(([id, item]) => (
              <span
                key={id}
                className={
                  id === portal
                    ? "chrome-portal-pill is-active"
                    : "chrome-portal-pill"
                }
              >
                {id === portal ? `● ${item.name} (selecionado)` : item.name}
              </span>
            ))}
          </div>
        </header>

        {extensionStatus&&extensionStatus.kind!=='ready' && <div className="chrome-notice-banner" role={extensionStatus.kind==='error'?'alert':'status'}><strong>Extensão {extensionStatus.version} detectada</strong><p>{extensionStatus.text}</p></div>}

        {portal === "linkedin" && (
          <div className="chrome-notice-banner" role="note">
            <strong>Sobre o LinkedIn nesta versão:</strong> Conectar a sessão do
            LinkedIn não ativa candidaturas automáticas. A disponibilidade de
            envio é informada separadamente no painel.
          </div>
        )}
        {access?.sessionRetest&&<div className="chrome-notice-banner" role="note"><strong>Conexão LinkedIn em teste</strong><p>{access.notice}</p></div>}

        {installation}
        <div className="chrome-section-block">
          <div className="chrome-section-heading">
            <span className="chrome-section-kicker">Como conectar</span>
            <h2>Siga estes 3 passos rápidos</h2>
          </div>

          <ol className="chrome-steps-grid">
            <li className="chrome-step-card">
              <div className="chrome-step-number">1</div>
              <div className="chrome-step-body">
                <h3>Entre na sua conta no {provider.name}</h3>
                <p>
                  Abra a extensão, escolha <strong>{provider.name}</strong> e
                  confira a conta de destino no EmpreGatos. Use{" "}
                  <strong>Abrir login do portal</strong> (ou o botão abaixo) e
                  entre normalmente.
                </p>
                <a
                  className="chrome-step-link"
                  href={provider.accountUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir minha conta no {provider.name} ↗
                </a>
              </div>
            </li>

            <li className="chrome-step-card">
              <div className="chrome-step-number">2</div>
              <div className="chrome-step-body">
                <h3>Autorize e envie a sessão</h3>
                <p>
                  Volte à aba do conector, que permanece aberta durante o login,
                  autorize somente o portal escolhido e clique em <strong>Conectar sessão ao EmpreGatos</strong>. O
                  Chrome pedirá acesso apenas a{" "}
                  <code>{provider.domains.join(", ")}</code>.
                </p>
              </div>
            </li>

            <li className="chrome-step-card">
              <div className="chrome-step-number">3</div>
              <div className="chrome-step-body">
                <h3>Confirme nesta página</h3>
                <p>
                  Após a verificação automática da sessão pelo servidor,
                  confirme e salve a conexão nesta página para concluir.
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="chrome-trust-card">
          <div className="chrome-trust-icon" aria-hidden="true">
            🔒
          </div>
          <div>
            <strong>Sua privacidade está protegida</strong>
            <p>
              A extensão não lê senhas nem a sessão do Google. A sessão do
              portal escolhido é verificada e só fica salva de forma cifrada
              após sua confirmação.
            </p>
          </div>
        </div>

        <footer className="chrome-connection-footer">
          <p>
            Não pode instalar a extensão neste dispositivo? Você pode tentar a
            alternativa pelo navegador remoto:
          </p>
          <button className="remote-secondary" onClick={onCloud}>
            Usar login no navegador da nuvem
          </button>
        </footer>
      </div>
    </section>
  );
}

