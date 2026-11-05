import {useEffect,useState} from 'react';
import {CheckCircle2,Copy,Download,ExternalLink,FolderOpen,Pin,Puzzle,ShieldCheck} from 'lucide-react';
import {chromeWebStoreListing} from '../shared/chrome-extension-installation';
import './ChromeExtensionInstallation.css';

const download='/downloads/empregatos-conexoes-chrome.zip';
export default function ChromeExtensionInstallation({installedVersion,onOpenConnector,onCheckInstallation,storeUrl=import.meta.env.VITE_CHROME_WEB_STORE_URL}: {
 installedVersion?:string;onOpenConnector?:()=>void;onCheckInstallation?:()=>void;storeUrl?:string;
}){
 const listing=chromeWebStoreListing(storeUrl);
 const [copied,setCopied]=useState(''),[checking,setChecking]=useState(false);
 useEffect(()=>{if(installedVersion)setChecking(false);},[installedVersion]);
 useEffect(()=>{if(!checking)return;const timeout=setTimeout(()=>setChecking(false),5000);return()=>clearTimeout(timeout);},[checking]);
 const copy=async()=>{
  try{await navigator.clipboard.writeText('chrome://extensions');setCopied('Endereço copiado. Cole na barra de endereço do Chrome e pressione Enter.');}
  catch{setCopied('Selecione e copie o endereço chrome://extensions para a barra do Chrome.');}
 };
 const check=()=>{setChecking(true);onCheckInstallation?.();};
 if(installedVersion)return <section className="extension-setup is-installed" aria-label="Instalação da extensão">
  <div className="extension-detected"><span className="extension-success-icon"><CheckCircle2 aria-hidden="true" size={26}/></span><div><span className="extension-eyebrow">Tudo pronto neste navegador</span><h2>Extensão do EmpreGatos detectada</h2><p>Versão {installedVersion}. Agora você pode conectar o portal escolhido.</p></div></div>
  {onOpenConnector&&<button className="extension-primary" onClick={onOpenConnector}><Puzzle size={18} aria-hidden="true"/>Abrir conector do Chrome</button>}
  <p className="extension-small"><Pin size={15} aria-hidden="true"/> Dica: fixe o EmpreGatos no ícone de extensões para encontrá-lo depois.</p>
 </section>;
 const manual=<ol className="extension-install-steps">
  <li><div className="extension-step-heading"><span>1</span><h3>Baixe e extraia a pasta</h3></div><div className="extension-mini-file" aria-hidden="true"><FolderOpen size={28}/><span>empregatos-conexoes-chrome</span><small>Pasta extraída</small></div><p>Baixe o arquivo e use <strong>Extrair tudo</strong> no Windows. Guarde a pasta em um lugar fácil de encontrar.</p><a href={download} download className="extension-inline-link"><Download size={15} aria-hidden="true"/>Baixar extensão (.zip)</a></li>
  <li><div className="extension-step-heading"><span>2</span><h3>Abra as extensões do Chrome</h3></div><div className="extension-mini-browser" aria-hidden="true"><div className="extension-mini-toolbar"><i/><i/><i/></div><span>Extensões</span><small>Modo do desenvolvedor <b/></small></div><p>Cole o endereço abaixo na barra do Chrome. Ative <strong>Modo do desenvolvedor</strong> no canto superior direito.</p><div className="extension-address"><code>chrome://extensions</code><button onClick={copy} aria-label="Copiar endereço chrome://extensions"><Copy size={16} aria-hidden="true"/>{copied.startsWith('Endereço copiado')?'Copiado':'Copiar'}</button></div><p className="extension-copy-feedback" aria-live="polite">{copied}</p></li>
  <li><div className="extension-step-heading"><span>3</span><h3>Selecione a pasta extraída</h3></div><div className="extension-mini-load" aria-hidden="true"><span>Carregar sem compactação</span><FolderOpen size={25}/></div><p>Clique em <strong>Carregar sem compactação</strong> e selecione a pasta do passo 1. A pasta correta contém <code>manifest.json</code>.</p><span className="extension-step-result"><CheckCircle2 size={16} aria-hidden="true"/>O EmpreGatos aparece nas extensões</span></li>
 </ol>;
 return <section className="extension-setup" aria-label="Instalação da extensão">
  <div className="extension-setup-intro"><span className="extension-brand-icon"><Puzzle size={30} aria-hidden="true"/></span><div><span className="extension-eyebrow">Primeiro acesso · Chrome no computador</span><h2>Instale uma vez. Conecte seus portais.</h2><p>A extensão faz a ponte entre seu Chrome e o EmpreGatos. Depois da instalação, volte a esta página para conectar sua conta.</p></div></div>
  {listing?<>
   <div className="extension-store-install"><a className="extension-primary" href={listing} target="_blank" rel="noopener noreferrer"><Puzzle size={18} aria-hidden="true"/>Instalar no Chrome<ExternalLink size={16} aria-hidden="true"/></a><p>Na Chrome Web Store, clique em <strong>Adicionar ao Chrome</strong> e confirme a instalação. Depois, volte para cá.</p></div>
   <details className="extension-manual-alternative"><summary>Preciso da instalação manual</summary>{manual}</details>
  </>:<>
   <div className="extension-availability"><ShieldCheck size={18} aria-hidden="true"/><p><strong>Instalação manual disponível</strong><span>A versão da Chrome Web Store ainda não foi publicada. Por enquanto, siga estes três passos.</span></p></div>
   {manual}
  </>}
  <div className="extension-setup-finish"><div><h3>Terminou de instalar?</h3><p>Volte a esta aba. Se acabou de instalar, atualize a página para o Chrome reconhecer a extensão.</p></div><button className="extension-secondary" disabled={checking} onClick={check}><CheckCircle2 size={17} aria-hidden="true"/>{checking?'Procurando extensão…':'Verificar instalação'}</button></div>
  <p className="extension-small" aria-live="polite">{checking?'Aguardando a resposta do conector neste navegador.':'Se o conector não responder, atualize esta página e tente novamente.'}</p>
 </section>;
}
