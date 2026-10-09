import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="error-page unexpected-error" role="alert">
        <AlertCircle size={32} aria-hidden="true" />
        <h1>Esta tela não carregou como esperado</h1>
        <p>
          Recarregue a página para tentar novamente. Os dados já salvos
          continuam na sua conta.
        </p>
        <button
          type="button"
          className="button primary"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Recarregar página
        </button>
        <a className="button" href="/">
          Voltar ao início
        </a>
      </main>
    );
  }
}
