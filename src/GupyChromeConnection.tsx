import { Download, LogIn, PlugZap, Puzzle } from "lucide-react";
import { InfoTip, StepList } from "./AutomationWidgets";
export default function GupyChromeConnection({onCloud}:{onCloud:()=>void}) {
  return <section className="gupy-chrome-connection">
    <h1>Conecte a Gupy pelo seu Chrome</h1>
    <p>Use o Chrome onde você já entra na Gupy.</p>
    <StepList label="Passos para conectar a Gupy" steps={[
      { icon: <LogIn size={18} />, title: "Entre na Gupy", text: <><a href="https://portal.gupy.io/my/applications" target="_blank" rel="noreferrer">Abra a Gupy</a> e deixe a página de candidaturas aberta.</> },
      { icon: <Download size={18} />, title: "Baixe o conector", text: <><a href="/downloads/empregatos-gupy-chrome.zip" download>Baixe o ZIP</a> e extraia em uma pasta.</> },
      { icon: <Puzzle size={18} />, title: "Carregue no Chrome", text: <>Em <strong>chrome://extensions</strong>, ative <strong>Modo do desenvolvedor</strong> e use <strong>Carregar sem compactação</strong>.</> },
      { icon: <PlugZap size={18} />, title: "Autorize a conexão", text: <>Recarregue esta página e clique em <strong>Conectar sessão da Gupy</strong> no conector.</> },
    ]} />
    <InfoTip summary="Privacidade e limites">
      <p>O conector transfere somente a sessão da Gupy, com sua autorização. Não lê sua senha nem a sessão do Google. O servidor verifica o acesso antes de permitir a confirmação; a conexão sozinha não envia candidaturas.</p>
      <p>Se a Gupy exigir nova verificação no servidor, mostraremos o impedimento. A transferência não garante que o portal aceitará a sessão.</p>
    </InfoTip>
    <a href="/app#preferencias">Revisar preferências</a>
    <button className="remote-secondary" onClick={onCloud}>Usar login no navegador da nuvem</button>
  </section>;
}
