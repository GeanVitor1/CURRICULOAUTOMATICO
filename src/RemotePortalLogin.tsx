import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib";
import { portals } from "../shared/portals";
import type { Workspace } from "../shared/types";
import "./RemotePortalLogin.css";

type Frame = {
  viewerId: string;
  image: string;
  width: number;
  height: number;
  address: string;
  authenticated: boolean;
  blocked: boolean;
  notice: string;
};
type Action =
  | { type: "click"; x: number; y: number }
  | { type: "text" | "key"; value: string }
  | { type: "scroll"; delta: number }
  | { type: "refresh" };

export default function RemotePortalLogin({
  portal,
  workspace,
}: {
  portal: "gupy" | "infojobs" | "glassdoor";
  workspace?: Workspace;
}) {
  const name = portals[portal].name;
  const [frame, setFrame] = useState<Frame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [done, setDone] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [typing, setTyping] = useState(false);
  const current = useRef<Frame | null>(null);
  const finished = useRef(false);
  const keyboard = useRef<HTMLTextAreaElement>(null);
  const keyboardButton = useRef<HTMLButtonElement>(null);
  const sequence = useRef<Promise<void>>(Promise.resolve());
  const failed = useRef(false);
  const pending = useRef(0);
  const buffer = useRef("");
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resume = workspace?.resumes.find(
    (r) => r.id === workspace.interview?.answers.resumeId && r.approved,
  );
  const ready = !!(
    resume &&
    workspace?.profile.confirmed &&
    workspace.interview?.completed &&
    workspace.interview.answers.sites.includes(portal)
  );
  const receive = (next: Frame) => {
    current.current = next;
    setFrame(next);
  };
  const enqueue = useCallback(
    (action: Action, recover = false) => {
      const viewerId = current.current?.viewerId;
      if (!viewerId || finished.current) return Promise.resolve();
      pending.current++;
      setBusy(true);
      sequence.current = sequence.current
        .then(async () => {
          if (failed.current && !recover) return;
          if (recover) {
            failed.current = false;
            setError("");
          }
          try {
            receive(
              await api<Frame>(`/connections/${portal}/action`, {
                method: "POST",
                headers: { "X-Portal-Viewer": viewerId },
                body: JSON.stringify(action),
              }),
            );
          } catch (failure) {
            failed.current = true;
            buffer.current = "";
            setError(
              (failure as Error).message +
                " Atualize a imagem antes de continuar. Confira o campo antes de digitar novamente.",
            );
          }
        })
        .finally(() => {
          pending.current--;
          if (!pending.current) setBusy(false);
        });
      return sequence.current;
    },
    [portal],
  );
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = buffer.current;
    buffer.current = "";
    for (let offset = 0; offset < value.length; offset += 2000)
      void enqueue({ type: "text", value: value.slice(offset, offset + 2000) });
    return sequence.current;
  }, [enqueue]);
  useEffect(() => {
    const cleanup = () => {
      clearTimeout(timer.current);
      buffer.current = "";
      const viewerId = current.current?.viewerId;
      if (!viewerId || finished.current) return;
      void fetch(`/api/connections/${portal}/close`, {
        method: "POST",
        keepalive: true,
        headers: { "X-Orbita-Request": "1", "X-Portal-Viewer": viewerId },
      }).catch(() => {});
    };
    window.addEventListener("pagehide", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      cleanup();
    };
  }, [portal]);
  useEffect(() => {
    if (!frame || done || frame.authenticated || frame.blocked) return;
    const interval = setInterval(() => {
      if (
        !pending.current &&
        !buffer.current &&
        !composing.current &&
        !failed.current &&
        document.visibilityState === "visible"
      )
        void enqueue({ type: "refresh" });
    }, 3500);
    return () => clearInterval(interval);
  }, [!!frame, frame?.authenticated, frame?.blocked, done, enqueue]);
  const start = async () => {
    if (pending.current || current.current) return;
    pending.current++;
    setBusy(true);
    setError("");
    try {
      receive(
        await api<Frame>(`/connections/${portal}/open`, {
          method: "POST",
          body: JSON.stringify({ remoteBrowserConsent: true }),
        }),
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      pending.current--;
      setBusy(false);
    }
  };
  const confirm = async () => {
    await flush();
    if (
      failed.current ||
      !current.current ||
      !approved ||
      !ready ||
      !resume ||
      finished.current
    )
      return;
    pending.current++;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ automatic: boolean }>(
        `/connections/${portal}/confirm`,
        {
          method: "POST",
          headers: { "X-Portal-Viewer": current.current.viewerId },
          body: JSON.stringify({
            authorizeAutomation: true,
            profileResumeId: resume.id,
          }),
        },
      );
      finished.current = true;
      setAutomatic(result.automatic);
      setDone(true);
      window.opener?.postMessage(
        {
          type: "empregatos:portal-connected",
          portal,
          automatic: result.automatic,
        },
        location.origin,
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      pending.current--;
      setBusy(false);
    }
  };
  const close = async () => {
    clearTimeout(timer.current);
    buffer.current = "";
    await sequence.current;
    if (current.current && !finished.current) {
      setBusy(true);
      try {
        await api(`/connections/${portal}/close`, {
          method: "POST",
          headers: { "X-Portal-Viewer": current.current.viewerId },
        });
        finished.current = true;
      } catch (failure) {
        setError((failure as Error).message);
        setBusy(false);
        return;
      }
    }
    window.close();
    if (!window.closed) location.href = "/app#automacao";
  };
  return (
    <main className="remote-login">
      <header>
        <a href="/app#automacao" target="_blank" rel="noopener noreferrer">
          EmpreGatos
        </a>
        <span>Navegador na nuvem · {name}</span>
      </header>
      <h1>{done ? "Conta conectada" : `Conectar ${name} à automação`}</h1>
      {done ? (
        <section className="remote-intro">
          <p>
            {automatic
              ? "Sessão salva. As candidaturas elegíveis entram na fila automática."
              : "Sessão salva. Revise as preferências no painel para ativar os envios."}{" "}
            Acompanhe o resultado no painel; perguntas adicionais e verificações
            podem exigir sua participação.
          </p>
          <button onClick={() => void close()}>Voltar ao painel</button>
        </section>
      ) : (
        <>
          {!frame && (
            <section className="remote-intro">
              <p>
                Você fará login na página do {name}, em um navegador na nuvem
                operado pela EmpreGatos. Não precisa instalar nada nem manter
                seu computador ligado.
              </p>
              <p>
                Esta conexão não é uma autorização oficial como a do Google.
                Nosso serviço terá acesso à sessão do portal para tentar suas
                candidaturas. Você pode desconectar pelo painel.
              </p>
              <button disabled={busy} onClick={() => void start()}>
                {busy ? "Abrindo navegador…" : "Abrir navegador remoto"}
              </button>
            </section>
          )}
          {frame && (
            <>
              <p>
                Clique nos campos da página abaixo e digite normalmente. Use a
                entrada do próprio portal; login por Google ou outras contas
                externas não está habilitado nesta janela.
              </p>
              <div className="remote-toolbar">
                <span title={frame.address}>{frame.address}</span>
                <button
                  disabled={busy}
                  onClick={() => {
                    void flush();
                    void enqueue({ type: "refresh" }, true);
                  }}
                >
                  Atualizar imagem
                </button>
                <button
                  ref={keyboardButton}
                  disabled={frame.blocked}
                  onClick={() =>
                    keyboard.current?.focus({ preventScroll: true })
                  }
                >
                  Digitar na janela
                </button>
              </div>
              <div className="remote-screen" aria-busy={busy}>
                <img
                  src={frame.image}
                  width={frame.width}
                  height={frame.height}
                  alt={`Página do ${name} no navegador remoto. Clique para interagir.`}
                  draggable={false}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    void flush();
                    void enqueue({
                      type: "click",
                      x: Math.min(
                        1024,
                        Math.max(
                          0,
                          ((event.clientX - rect.left) * frame.width) /
                            rect.width,
                        ),
                      ),
                      y: Math.min(
                        720,
                        Math.max(
                          0,
                          ((event.clientY - rect.top) * frame.height) /
                            rect.height,
                        ),
                      ),
                    });
                    keyboard.current?.focus({ preventScroll: true });
                  }}
                />
              </div>
              <textarea
                className="remote-keyboard"
                ref={keyboard}
                aria-label="Teclado do navegador remoto"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                onFocus={() => setTyping(true)}
                onBlur={() => {
                  setTyping(false);
                  void flush();
                }}
                onCompositionStart={() => {
                  composing.current = true;
                  clearTimeout(timer.current);
                }}
                onCompositionEnd={(event) => {
                  composing.current = false;
                  buffer.current += event.currentTarget.value;
                  event.currentTarget.value = "";
                  void flush();
                }}
                onInput={(event) => {
                  if (composing.current) return;
                  buffer.current += event.currentTarget.value;
                  event.currentTarget.value = "";
                  clearTimeout(timer.current);
                  timer.current = setTimeout(() => void flush(), 220);
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    keyboardButton.current?.focus();
                    return;
                  }
                  let key = event.key;
                  if (key === "Tab" && event.shiftKey) key = "Shift+Tab";
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    key.toLowerCase() === "a"
                  )
                    key = "ControlOrMeta+A";
                  if (
                    [
                      "Tab",
                      "Shift+Tab",
                      "Enter",
                      "Backspace",
                      "Delete",
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowRight",
                      "Home",
                      "End",
                      "PageUp",
                      "PageDown",
                      "ControlOrMeta+A",
                    ].includes(key)
                  ) {
                    event.preventDefault();
                    void flush();
                    void enqueue({ type: "key", value: key });
                  }
                }}
              />
              <div className="remote-toolbar">
                <span role="status">
                  {busy
                    ? "Atualizando navegador…"
                    : typing
                      ? "Teclado conectado · Esc para sair"
                      : "Clique na página para interagir"}
                </span>
                <button
                  disabled={busy}
                  onClick={() => {
                    void flush();
                    void enqueue({ type: "scroll", delta: -500 });
                  }}
                >
                  Subir página
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    void flush();
                    void enqueue({ type: "scroll", delta: 500 });
                  }}
                >
                  Descer página
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    void flush();
                    void enqueue({ type: "key", value: "Enter" });
                  }}
                >
                  Enter
                </button>
              </div>
              {frame.notice && <p role="status">{frame.notice}</p>}
              <section className="remote-confirm">
                <strong>
                  {frame.authenticated
                    ? "Login confirmado pelo portal"
                    : "Aguardando login no portal"}
                </strong>
                {!ready && (
                  <p>
                    Conclua as preferências e aprove o currículo no painel antes
                    de liberar os envios.
                  </p>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={approved}
                    disabled={!ready}
                    onChange={(event) => setApproved(event.target.checked)}
                  />
                  Confirmo que o currículo do meu perfil no {name} está
                  atualizado e autorizo tentativas automáticas conforme minhas
                  preferências e meu limite diário.
                </label>
                <button
                  disabled={
                    busy ||
                    !frame.authenticated ||
                    frame.blocked ||
                    !approved ||
                    !ready ||
                    !!error
                  }
                  onClick={() => void confirm()}
                >
                  Conectar e iniciar envios
                </button>
              </section>
            </>
          )}
          {error && (
            <p className="remote-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="remote-cancel"
            disabled={busy}
            onClick={() => void close()}
          >
            Cancelar conexão
          </button>
        </>
      )}
    </main>
  );
}
