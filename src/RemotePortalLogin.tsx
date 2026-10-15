import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib";
import { portals } from "../shared/portals";
import type { Workspace } from "../shared/types";
import "./RemotePortalLogin.css";
import { PortalLiveClient } from "./portal-live-client";
import type { LiveInput, LiveTicket } from "../shared/portal-live";

type Frame = {
  viewerId: string;
  image: string;
  width: number;
  height: number;
  address: string;
  authenticated: boolean;
  blocked: boolean;
  notice: string;
  live?: LiveTicket;
};
type Action = LiveInput;

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
  const [ending, setEnding] = useState(false);
  const current = useRef<Frame | null>(null);
  const live = useRef<PortalLiveClient | null>(null);
  const finished = useRef(false);
  const closing = useRef(false);
  const keyboard = useRef<HTMLTextAreaElement>(null);
  const screen = useRef<HTMLImageElement>(null);
  const started = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scrollDelta = useRef(0);
  const touchY = useRef<number | null>(null);
  const swiped = useRef(false);
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
  const connectLive = useCallback((next: Frame) => {
    if (!next.live) return;
    live.current?.close();
    live.current = new PortalLiveClient(next.live, {
      image: (image) => {
        const previous = current.current;
        if (previous?.viewerId === next.viewerId)
          receive({ ...previous, image });
      },
      status: (status) => {
        const previous = current.current;
        if (
          previous?.viewerId === next.viewerId &&
          (previous.authenticated !== status.authenticated ||
            previous.blocked !== status.blocked ||
            previous.notice !== status.notice)
        )
          receive({ ...previous, ...status });
      },
      error: (error) => {
        if (finished.current || closing.current) return;
        failed.current = true;
        buffer.current = "";
        setError(error.message);
      },
    });
  }, []);
  const enqueue = useCallback(
    (action: Action, recover = false) => {
      const viewerId = current.current?.viewerId;
      if (!viewerId || finished.current || closing.current)
        return Promise.resolve();
      pending.current++;
      setBusy(true);
      const perform = async () => {
        if (failed.current && !recover) return;
        if (recover) {
          failed.current = false;
          setError("");
        }
        try {
          if (current.current?.live) {
            if (!live.current || recover) connectLive(current.current);
            await live.current!.send(action);
          } else
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
              " Confira o campo antes de digitar novamente.",
          );
        }
      };
      const direct = !!current.current?.live;
      const task = (
        direct ? perform() : sequence.current.then(perform)
      ).finally(() => {
        pending.current--;
        if (!pending.current) setBusy(false);
      });
      sequence.current = direct
        ? Promise.all([sequence.current, task]).then(() => {})
        : task;
      return sequence.current;
    },
    [portal, connectLive],
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
      clearTimeout(scrollTimer.current);
      live.current?.close();
      live.current = null;
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
    if (!frame || frame.live || done || frame.authenticated || frame.blocked)
      return;
    const interval = setInterval(() => {
      if (
        !pending.current &&
        !buffer.current &&
        !composing.current &&
        !failed.current &&
        !closing.current &&
        document.visibilityState === "visible"
      )
        void enqueue({ type: "refresh" });
    }, 3500);
    return () => clearInterval(interval);
  }, [
    !!frame,
    !!frame?.live,
    frame?.authenticated,
    frame?.blocked,
    done,
    enqueue,
  ]);
  const start = useCallback(async () => {
    if (started.current || pending.current || current.current) return;
    started.current = true;
    pending.current++;
    setBusy(true);
    setError("");
    try {
      const next = await api<Frame>(`/connections/${portal}/open`, {
        method: "POST",
        body: JSON.stringify({
          remoteBrowserConsent: true,
          viewportWidth: Math.max(375, Math.min(1024, window.innerWidth)),
        }),
      });
      receive(next);
      connectLive(next);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      pending.current--;
      setBusy(false);
    }
  }, [portal, connectLive]);
  useEffect(() => {
    void start();
  }, [start]);
  const scroll = (delta: number) => {
    scrollDelta.current = Math.max(
      -1200,
      Math.min(1200, scrollDelta.current + delta),
    );
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const value = scrollDelta.current;
      scrollDelta.current = 0;
      void flush();
      void enqueue({ type: "scroll", delta: value });
    }, 120);
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
    live.current?.close();
    live.current = null;
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
      if (window.opener) window.close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      pending.current--;
      setBusy(false);
    }
  };
  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    setEnding(true);
    pending.current++;
    setBusy(true);
    clearTimeout(timer.current);
    buffer.current = "";
    await sequence.current;
    live.current?.close();
    live.current = null;
    if (current.current && !finished.current) {
      setBusy(true);
      try {
        await api(`/connections/${portal}/close`, {
          method: "POST",
          headers: { "X-Portal-Viewer": current.current.viewerId },
        });
        finished.current = true;
      } catch (failure) {
        closing.current = false;
        setEnding(false);
        pending.current--;
        setError((failure as Error).message);
        setBusy(false);
        return;
      }
    }
    pending.current--;
    window.close();
    if (!window.closed) location.href = "/app#automacao";
  };
  return (
    <main
      className="remote-login"
      aria-label={`Login do ${name} no navegador da EmpreGatos`}
    >
      {!frame && !error && (
        <div className="remote-loading" role="status">
          Abrindo login do {name}…
        </div>
      )}
      {frame && !done && (
        <>
          <div className="remote-screen" aria-busy={busy}>
            <img
              ref={screen}
              src={frame.image}
              width={frame.width}
              height={frame.height}
              alt={`Página do ${name} no navegador remoto. Clique para interagir.`}
              draggable={false}
              tabIndex={0}
              onFocus={() => keyboard.current?.focus({ preventScroll: true })}
              onWheel={(event) => scroll(event.deltaY)}
              onPointerDown={(event) => {
                touchY.current =
                  event.pointerType === "touch" ? event.clientY : null;
                swiped.current = false;
              }}
              onPointerUp={(event) => {
                if (
                  touchY.current !== null &&
                  Math.abs(touchY.current - event.clientY) > 20
                ) {
                  swiped.current = true;
                  scroll(touchY.current - event.clientY);
                }
                touchY.current = null;
              }}
              onClick={(event) => {
                if (swiped.current || frame.authenticated || frame.blocked)
                  return;
                const rect = event.currentTarget.getBoundingClientRect();
                void flush();
                void enqueue({
                  type: "click",
                  x: Math.max(
                    0,
                    Math.min(
                      frame.width,
                      ((event.clientX - rect.left) * frame.width) / rect.width,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      frame.height,
                      ((event.clientY - rect.top) * frame.height) / rect.height,
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
            onBlur={() => void flush()}
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
              timer.current = setTimeout(
                () => void flush(),
                current.current?.live ? 35 : 220,
              );
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                keyboard.current?.blur();
                return;
              }
              let key = event.key;
              if (key === "Tab" && event.shiftKey) key = "Shift+Tab";
              if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "a")
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
                void enqueue({
                  type: "key",
                  value: key as Extract<LiveInput, { type: "key" }>["value"],
                });
              }
            }}
          />
          {frame.authenticated && !error && (
            <div className="remote-overlay">
              <section
                className="remote-confirm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="remote-confirm-title"
              >
                <h1 id="remote-confirm-title">Login confirmado</h1>
                {!ready && (
                  <p>
                    Conclua suas preferências e aprove o currículo no painel
                    para liberar os envios.
                  </p>
                )}
                <label>
                  <input
                    autoFocus
                    type="checkbox"
                    checked={approved}
                    disabled={!ready}
                    onChange={(event) => setApproved(event.target.checked)}
                  />
                  Confirmo que o currículo do meu perfil no {name} está
                  atualizado e autorizo os envios conforme minhas preferências e
                  meu limite diário.
                </label>
                <button
                  disabled={busy || !approved || !ready}
                  onClick={() => void confirm()}
                >
                  {busy ? "Conectando…" : "Conectar e iniciar envios"}
                </button>
                <button
                  className="remote-secondary"
                  disabled={busy}
                  onClick={() => void close()}
                >
                  Cancelar
                </button>
              </section>
            </div>
          )}
          {frame.blocked && !error && (
            <div className="remote-overlay">
              <section className="remote-confirm" role="alert">
                <p>{frame.notice}</p>
                <button disabled={busy} onClick={() => void close()}>
                  Fechar janela
                </button>
              </section>
            </div>
          )}
        </>
      )}
      {done && (
        <div className="remote-overlay">
          <section className="remote-confirm">
            <h1>Conta conectada</h1>
            <p>
              {automatic
                ? "As candidaturas elegíveis já podem ser tentadas automaticamente."
                : "Revise suas preferências no painel para ativar os envios."}
            </p>
            <button onClick={() => void close()}>Concluir</button>
          </section>
        </div>
      )}
      {error && (
        <div className="remote-overlay">
          <section className="remote-confirm" role="alert">
            <p>{error}</p>
            <button
              disabled={busy}
              onClick={() => {
                if (current.current) void enqueue({ type: "refresh" }, true);
                else {
                  started.current = false;
                  void start();
                }
              }}
            >
              Tentar novamente
            </button>
            <button
              className="remote-secondary"
              disabled={busy}
              onClick={() => void close()}
            >
              Fechar janela
            </button>
          </section>
        </div>
      )}
      {ending && (
        <div className="remote-overlay">
          <p role="status">Encerrando conexão…</p>
        </div>
      )}
    </main>
  );
}
