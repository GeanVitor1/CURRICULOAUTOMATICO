import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Eye,
  EyeOff,
  Link,
  RefreshCw,
  ExternalLink,
  Search,
  Send,
} from "lucide-react";
import { Button, Field, Modal } from "./components";
import { api, useApp } from "./lib";
import { portals } from "../shared/portals";
import type { SiteCapability } from "./CareerInterview";

type Frame = {
  image: string;
  width: number;
  height: number;
  address: string;
  fields: {
    index: number;
    key: string;
    type: string;
    label: string;
    autocomplete?: string;
    inputMode?: "text" | "numeric" | "email";
    required?: boolean;
    hasValue?: boolean;
  }[];
  authenticated?: boolean;
  blocked?: boolean;
  notice?: string;
};
export default function PortalConnections({
  selected,
}: {
  selected: string[];
}) {
  const { w, toast, demo } = useApp();
  const client = useQueryClient();
  const sites = useQuery({
    queryKey: ["automation-sites"],
    queryFn: () => api<SiteCapability[]>("/automation/sites"),
    refetchInterval: 30000,
  });
  const [portal, setPortal] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState(false);
  const [verificationText, setVerificationText] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [disconnectSite, setDisconnectSite] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const disconnectPending = useRef(false);
  const refreshing = useRef<Promise<void> | null>(null);
  const editing = useRef(false);
  const pending = useRef(false);
  const active = useRef<string | null>(null);
  const resume = w.resumes[0];
  const oauthWindow = useRef<Window | null>(null);
  const [oauthPending, setOauthPending] = useState(false);
  useEffect(() => {
    if (!oauthPending) return;
    const timer = window.setInterval(() => {
      if (!oauthWindow.current || oauthWindow.current.closed) {
        oauthWindow.current = null;
        setOauthPending(false);
        void client.invalidateQueries({ queryKey: ["automation-sites"] });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [oauthPending, client]);
  useEffect(() => {
    const receiveOAuth = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== oauthWindow.current ||
        event.data?.type !== "empregatos:oauth"
      )
        return;
      void client.invalidateQueries({ queryKey: ["automation-sites"] });
      toast(
        event.data.success
          ? "Conta LinkedIn autenticada. As permissões de busca e envio são separadas."
          : "O LinkedIn não confirmou a autenticação. Tente novamente.",
        !event.data.success,
      );
      oauthWindow.current = null;
      setOauthPending(false);
    };
    window.addEventListener("message", receiveOAuth);
    return () => window.removeEventListener("message", receiveOAuth);
  }, [client, toast]);
  const openOAuth = async () => {
    if (pending.current) return;
    if (oauthWindow.current && !oauthWindow.current.closed) {
      oauthWindow.current.focus();
      return;
    }
    // Open synchronously so popup blockers do not treat the later navigation as unsolicited.
    const popup = window.open(
      "about:blank",
      "empregatos-linkedin",
      "popup,width=620,height=760",
    );
    if (!popup) {
      toast(
        "Permita a abertura da janela de autenticação e tente novamente.",
        true,
      );
      return;
    }
    oauthWindow.current = popup;
    setOauthPending(true);
    pending.current = true;
    setBusy(true);
    try {
      const result = await api<{ url: string }>("/oauth/linkedin/start", {
        method: "POST",
      });
      const url = new URL(result.url);
      if (
        url.origin !== "https://www.linkedin.com" ||
        url.pathname !== "/oauth/v2/authorization"
      )
        throw new Error("Endereço de autenticação inválido.");
      popup.location.href = url.href;
    } catch (failure) {
      popup.close();
      oauthWindow.current = null;
      setOauthPending(false);
      toast((failure as Error).message, true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const receive = (next: Frame) => {
    setFrame(next);
    setValues((old) =>
      Object.fromEntries(
        Object.entries(old).filter(
          ([key]) =>
            !next.authenticated &&
            next.fields.some((field) => field.key === key),
        ),
      ),
    );
  };
  const close = () => {
    const current = active.current;
    active.current = null;
    setPortal(null);
    setFrame(null);
    setValues({});
    editing.current = false;
    setError("");
    setRefreshError("");
    if (current)
      void api(`/connections/${current}/close`, { method: "POST" }).catch(
        () => {},
      );
  };
  useEffect(
    () => () => {
      const current = active.current;
      active.current = null;
      if (current)
        void api(`/connections/${current}/close`, { method: "POST" }).catch(
          () => {},
        );
    },
    [],
  );
  const open = async (site: string) => {
    if (pending.current) return;
    pending.current = true;
    setPortal(site);
    active.current = site;
    setFrame(null);
    setBusy(true);
    setError("");
    setApproved(false);
    setValues({});
    setVerificationText("");
    setShowPassword(false);
    try {
      const next = await api<Frame>(`/connections/${site}/open`, {
        method: "POST",
      });
      if (active.current === site) receive(next);
      else
        await api(`/connections/${site}/close`, { method: "POST" }).catch(
          () => {},
        );
    } catch (e) {
      if (active.current === site) setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const action = async (body: unknown) => {
    if (!portal || pending.current) return false;
    pending.current = true;
    editing.current = false;
    setBusy(true);
    setError("");
    setRefreshError("");
    try {
      await refreshing.current;
      const next = await api<Frame>(`/connections/${portal}/action`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (active.current === portal) receive(next);
      return true;
    } catch (e) {
      if (active.current === portal) setError((e as Error).message);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const fill = async () => {
    const fields = (frame?.fields || [])
      .filter((field) => values[field.key])
      .map((field) => ({
        index: field.index,
        key: field.key,
        value: values[field.key],
      }));
    if (!fields.length) {
      setError("Preencha os campos antes de continuar.");
      return;
    }
    await action({ type: "submit", fields });
  };
  const confirm = async () => {
    if (!portal || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await refreshing.current;
      await api(`/connections/${portal}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          profileResumeId: approved ? resume?.id || null : null,
        }),
      });
      await client.invalidateQueries({ queryKey: ["automation-sites"] });
      toast(
        "Sessão autenticada salva. Confira as capacidades deste site antes de ativar o envio.",
      );
      close();
    } catch (e) {
      if (active.current !== portal) return;
      setError((e as Error).message);
      try {
        receive(
          await api<Frame>(`/connections/${portal}/action`, {
            method: "POST",
            body: JSON.stringify({ type: "refresh" }),
          }),
        );
      } catch {}
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!portal || !frame || frame.blocked || frame.authenticated) return;
    const timer = window.setInterval(() => {
      if (
        pending.current ||
        refreshing.current ||
        editing.current ||
        document.visibilityState !== "visible" ||
        document.activeElement?.closest(".portal-controls")
      )
        return;
      refreshing.current = api<Frame>(`/connections/${portal}/action`, {
        method: "POST",
        body: JSON.stringify({ type: "refresh" }),
      })
        .then((next) => {
          if (active.current === portal) {
            receive(next);
            setRefreshError("");
          }
        })
        .catch((e) => {
          if (active.current === portal) setRefreshError((e as Error).message);
        })
        .finally(() => {
          refreshing.current = null;
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [portal, !!frame, frame?.blocked, frame?.authenticated]);
  return (
    <div className="portal-connections">
      <p>
        Cada site tem permissões próprias. Confira abaixo o que está disponível
        para busca, autenticação e envio.
      </p>
      {sites.isError && (
        <div className="recoverable-error" role="alert">
          <p>
            Não conseguimos verificar suas conexões. Tente novamente em
            instantes.
          </p>
          <Button disabled={sites.isFetching} onClick={() => sites.refetch()}>
            Verificar conexões
          </Button>
        </div>
      )}
      {!selected.length && (
        <p className="interview-help">
          Selecione um site para gerenciar a conexão.
        </p>
      )}
      <div className="connection-list">
        {selected.map((site) => {
          const status = sites.data?.find((item) => item.id === site);
          return (
            <div key={site} className="connection-card">
              <div>
                <strong>
                  {portals[site as keyof typeof portals]?.name || site}
                </strong>
                <span>
                  {status?.identityConnected && !status?.connected ? (
                    "Conta autenticada via OAuth"
                  ) : status?.sessionState === "expired" ||
                    status?.identityExpired ? (
                    "Sessão expirada · conecte novamente"
                  ) : status?.connected ? (
                    <>
                      <Check size={14} />{" "}
                      {status.needsResumeApproval
                        ? "Confirme o currículo do site"
                        : "Conta conectada"}
                    </>
                  ) : sites.isPending ? (
                    "Verificando conexão…"
                  ) : sites.isError ? (
                    "Verificação indisponível"
                  ) : !status?.connectable ? (
                    status?.automatic ? (
                      "Envio por integração autorizada"
                    ) : (
                      "Candidatura no site oficial"
                    )
                  ) : (
                    "Conta não conectada"
                  )}
                </span>
                <div className="connection-capabilities">
                  <span className={status?.discovery ? "available" : ""}>
                    <Search size={13} />
                    {status?.discovery
                      ? "Busca disponível"
                      : "Busca não configurada"}
                  </span>
                  <span className={status?.automatic ? "available" : ""}>
                    <Send size={13} />
                    {status?.automatic ? "Envio autorizado" : "Envio no site"}
                  </span>
                </div>
                <p className="connection-limitation">{status?.limitation}</p>
              </div>
              <div className="connection-actions">
                {status?.oauthConfigured && (
                  <Button
                    disabled={busy || demo || disconnecting || oauthPending}
                    onClick={() => void openOAuth()}
                  >
                    <ExternalLink size={15} />
                    {oauthPending
                      ? "Autenticando…"
                      : status.identityConnected
                        ? "Reconectar LinkedIn"
                        : "Conectar LinkedIn"}
                  </Button>
                )}
                <a
                  className="button"
                  href={portals[site as keyof typeof portals]?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={15} />
                  Abrir site oficial
                </a>
                {status?.connectable && (
                  <Button
                    disabled={
                      busy || disconnecting || demo || !status?.connectable
                    }
                    onClick={() => void open(site)}
                  >
                    <Link size={15} />
                    {status?.needsResumeApproval
                      ? "Confirmar currículo"
                      : status?.connected
                        ? "Reconectar"
                        : "Conectar"}
                  </Button>
                )}
                {(status?.connected ||
                  status?.identityConnected ||
                  status?.sessionSaved ||
                  status?.identityExpired) && (
                  <Button
                    disabled={busy || disconnecting}
                    onClick={() => setDisconnectSite(site)}
                  >
                    Desconectar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Modal
        title={`Desconectar ${disconnectSite ? portals[disconnectSite as keyof typeof portals]?.name || disconnectSite : "site"}`}
        description="A sessão salva será removida. Para enviar novas candidaturas por este site, você precisará conectá-lo novamente."
        open={!!disconnectSite}
        busy={disconnecting}
        onOpenChange={(value) => {
          if (!value) setDisconnectSite(null);
        }}
      >
        <div className="modal-footer">
          <Button
            type="button"
            disabled={disconnecting}
            onClick={() => setDisconnectSite(null)}
          >
            Manter conexão
          </Button>
          <Button
            className="danger"
            disabled={disconnecting}
            onClick={async () => {
              if (!disconnectSite || disconnectPending.current) return;
              disconnectPending.current = true;
              setDisconnecting(true);
              try {
                await api(`/connections/${disconnectSite}`, {
                  method: "DELETE",
                });
                await client.invalidateQueries({
                  queryKey: ["automation-sites"],
                });
                setDisconnectSite(null);
                toast("Conta desconectada.");
              } catch (failure) {
                toast(
                  failure instanceof Error
                    ? failure.message
                    : "Não foi possível desconectar.",
                  true,
                );
              } finally {
                disconnectPending.current = false;
                setDisconnecting(false);
              }
            }}
          >
            {disconnecting ? "Desconectando…" : "Desconectar conta"}
          </Button>
        </div>
      </Modal>
      <Modal
        wide
        busy={busy && !!frame?.authenticated}
        title={`Conectar ${portal ? portals[portal as keyof typeof portals]?.name || portal : "site"}`}
        description="Conexão por navegador autorizada nesta instalação. Entre na sua conta e conclua apenas a autenticação. As buscas acontecem no painel do Empregatos."
        open={!!portal}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        {busy && !frame && <p role="status">Abrindo o site…</p>}
        {frame && (
          <>
            <p className="portal-address">{frame.address}</p>
            {!frame.authenticated && !frame.blocked && (
              <p className="portal-login-guide" role="status">
                {frame.fields.some(
                  (field) => field.autocomplete === "one-time-code",
                )
                  ? "Digite o código recebido para verificar sua conta."
                  : frame.fields.some((field) => field.type === "password")
                    ? "Entre com os dados da sua conta neste site."
                    : frame.fields.length
                      ? "Preencha o campo abaixo para continuar."
                      : "Conclua a verificação na janela do site abaixo."}
              </p>
            )}
            {frame.authenticated && (
              <p role="status">
                Sua conta já está aberta. Confirme a conexão abaixo, sem fazer
                login novamente.
              </p>
            )}
            {!frame.authenticated &&
              !frame.blocked &&
              frame.fields.length > 0 && (
                <form
                  className="portal-login-fields"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void fill();
                  }}
                >
                  {frame.fields.map((field) => (
                    <Field key={field.key} label={field.label}>
                      <div className="portal-input-row">
                        <input
                          aria-label={field.label}
                          type={
                            field.type === "password" && showPassword
                              ? "text"
                              : field.type
                          }
                          name={`portal-${portal}-${field.index}`}
                          autoComplete={field.autocomplete || "off"}
                          inputMode={field.inputMode}
                          required={field.required && !field.hasValue}
                          autoFocus={frame.fields[0].key === field.key}
                          value={values[field.key] || ""}
                          disabled={busy}
                          onChange={(e) => {
                            editing.current = true;
                            setValues((old) => ({
                              ...old,
                              [field.key]: e.target.value,
                            }));
                          }}
                        />
                        {field.type === "password" && (
                          <Button
                            type="button"
                            disabled={busy}
                            aria-label={
                              showPassword ? "Ocultar senha" : "Mostrar senha"
                            }
                            onClick={() => setShowPassword((value) => !value)}
                          >
                            {showPassword ? (
                              <EyeOff size={17} />
                            ) : (
                              <Eye size={17} />
                            )}
                          </Button>
                        )}
                      </div>
                    </Field>
                  ))}
                  <Button className="primary" disabled={busy} type="submit">
                    Continuar no site
                  </Button>
                </form>
              )}
            {!frame.authenticated && (
              <details
                className="interview-extra"
                key={frame.fields.length ? "login" : "verification"}
                open={!frame.fields.length && !frame.authenticated}
              >
                <summary>Abrir janela do site para verificação</summary>
                <p className="interview-help">
                  Você também pode clicar na janela abaixo para aceitar cookies,
                  abrir seu perfil ou resolver a verificação. Use seu login com
                  e-mail e senha.
                </p>
                <div className="portal-screen" aria-busy={busy}>
                  <img
                    src={frame.image}
                    alt="Janela interativa do site escolhido"
                    draggable={false}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      void action({
                        type: "click",
                        x: ((e.clientX - rect.left) * frame.width) / rect.width,
                        y:
                          ((e.clientY - rect.top) * frame.height) / rect.height,
                      });
                    }}
                  />
                </div>
                <div className="portal-controls">
                  <Field label="Texto ou código de verificação">
                    <input
                      value={verificationText}
                      disabled={busy}
                      autoComplete="one-time-code"
                      onChange={(e) => setVerificationText(e.target.value)}
                      placeholder="Clique no campo da janela e digite aqui"
                    />
                  </Field>
                  <Button
                    disabled={busy || !verificationText}
                    onClick={async () => {
                      if (
                        await action({ type: "text", value: verificationText })
                      )
                        setVerificationText("");
                    }}
                  >
                    Digitar na janela
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void action({ type: "key", value: "Tab" })}
                  >
                    Próximo campo
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void action({ type: "key", value: "Enter" })}
                  >
                    Continuar
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void action({ type: "refresh" })}
                  >
                    <RefreshCw size={14} /> Atualizar janela
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void action({ type: "scroll", delta: 500 })}
                  >
                    Rolar para baixo
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void action({ type: "scroll", delta: -500 })}
                  >
                    Rolar para cima
                  </Button>
                </div>
              </details>
            )}
            {resume && frame.authenticated && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />{" "}
                Meu currículo neste site está atualizado com “{resume.name}”.
                Autorizo usar esse perfil nas candidaturas.
              </label>
            )}
            {frame.notice && (
              <p className="negative" role="status">
                {frame.notice}
              </p>
            )}
            <p className="interview-help">
              A confirmação só salva uma sessão autenticada. Sua senha não será
              salva. Se o portal bloquear o acesso, a conexão continuará
              pendente.
            </p>
            {frame.authenticated && (
              <Button
                className="primary"
                disabled={busy || frame.blocked}
                onClick={() => void confirm()}
              >
                {busy ? "Aguarde…" : "Confirmar conexão"}
              </Button>
            )}
          </>
        )}
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        {refreshError && !error && (
          <p className="interview-help" role="status">
            A atualização da janela falhou. Seus campos foram mantidos. Você
            pode tentar continuar ou atualizar a janela.
          </p>
        )}
        {error && !frame && (
          <Button disabled={busy} onClick={() => portal && void open(portal)}>
            Tentar novamente
          </Button>
        )}
      </Modal>
    </div>
  );
}
