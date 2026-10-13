import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Field, Modal, PageHead } from "./components";
import { api, useApp } from "./lib";
import IntelligenceControl from "./IntelligenceControl";
import Billing from "./Billing";
import {
  GoogleMark,
  googleErrorMessage,
  useAuthProviders,
  type AuthIdentity,
} from "./GoogleSignIn";
export default function SimpleAccount() {
  const { w, toast } = useApp();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<AuthIdentity>("/auth/me"),
    refetchInterval: 30000,
  });
  const providers = useAuthProviders();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const [error, setError] = useState("");
  const close = () => {
    if (deleting.current) return;
    setOpen(false);
    setPassword("");
    setConfirmEmail("");
    setError("");
  };
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const error = query.get("google_error");
    if (error) setGoogleError(googleErrorMessage(error));
    const success = query.get("google");
    if (success)
      toast(
        success === "linked"
          ? "Google conectado à sua conta."
          : "Identidade confirmada com Google.",
      );
    if (error || success) {
      query.delete("google_error");
      query.delete("google");
      history.replaceState(
        {},
        "",
        `${location.pathname}${query.size ? `?${query}` : ""}${location.hash}`,
      );
    }
  }, []);
  const startGoogle = async (intent: "link" | "reauthenticate") => {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError("");
    try {
      const result = await api<{ url: string }>("/auth/google/start", {
        method: "POST",
        body: JSON.stringify({ intent }),
      });
      location.assign(result.url);
    } catch (error) {
      setGoogleError(
        error instanceof Error
          ? error.message
          : "Não foi possível acessar o Google.",
      );
      setGoogleBusy(false);
    }
  };
  return (
    <div className="career-flow account-page">
      <PageHead
        title="Minha conta"
        description="Seus dados e sua privacidade."
      />
      <div className="account-overview">
        <section className="interview-card account-profile">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              {w.profile.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{w.profile.name}</h2>
              <p>{w.profile.email}</p>
            </div>
          </div>
          <IntelligenceControl />
          <div className="interview-actions">
            <a className="button" href="/api/export" download>
              <Download size={16} />
              Baixar meus dados
            </a>
          </div>
        </section>
        <div className="account-access">
          <section className="interview-card account-google">
            <h2>Acesso com Google</h2>
            <p>
              {me.data?.googleConnected
                ? "Sua conta Google está conectada. Você pode usá-la para entrar no EmpreGatos."
                : "Conecte o Google com o mesmo e-mail para entrar sem digitar sua senha."}
            </p>
            {!me.data?.googleConnected && (
              <Button
                type="button"
                className="google-button"
                disabled={googleBusy || !me.data || !providers.data?.google}
                onClick={() => void startGoogle("link")}
              >
                <GoogleMark />
                {googleBusy ? "Conectando…" : "Conectar Google"}
              </Button>
            )}
            {!providers.isPending && !providers.data?.google && (
              <p className="interview-help">
                O acesso com Google ainda não está disponível nesta instalação.
              </p>
            )}
            {googleError && (
              <p className="form-error" role="alert">
                {googleError}
              </p>
            )}
          </section>
          <section className="interview-card account-privacy">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h2>Você controla seus dados</h2>
              <p>
                Baixe uma cópia do seu perfil e histórico. Para entender como
                seus dados são usados, consulte nossa{" "}
                <a href="/privacy">política de privacidade</a>.
              </p>
            </div>
          </section>
        </div>
      </div>
      <Billing />
      <section className="account-danger">
        <div>
          <h2>Excluir conta</h2>
          <p>
            A exclusão remove seus currículos e o histórico de candidaturas
            definitivamente.
          </p>
        </div>
        <Button className="danger-ghost" onClick={() => setOpen(true)}>
          <Trash2 size={16} />
          Excluir minha conta
        </Button>
      </section>
      <Modal
        title="Excluir minha conta"
        description="Seus currículos e candidaturas serão excluídos. Esta ação não pode ser desfeita."
        open={open}
        busy={busy}
        onOpenChange={(value) => (value ? setOpen(true) : close())}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (deleting.current) return;
            deleting.current = true;
            setBusy(true);
            setError("");
            try {
              await api("/account", {
                method: "DELETE",
                body: JSON.stringify(
                  me.data?.hasPassword ? { password } : { confirmEmail },
                ),
              });
              location.href = "/";
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Não foi possível excluir.",
              );
              deleting.current = false;
              setBusy(false);
            }
          }}
        >
          {me.data?.hasPassword ? (
            <Field label="Confirme sua senha">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                maxLength={128}
                disabled={busy}
              />
            </Field>
          ) : (
            <>
              {!me.data?.recentGoogleAuthentication && (
                <div>
                  <p>
                    Confirme sua identidade com Google antes de excluir a conta.
                  </p>
                  <Button
                    type="button"
                    className="google-button"
                    disabled={googleBusy || !providers.data?.google}
                    onClick={() => void startGoogle("reauthenticate")}
                  >
                    <GoogleMark />
                    Confirmar com Google
                  </Button>
                </div>
              )}
              <Field label="Digite o e-mail da sua conta para confirmar">
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  required
                  maxLength={254}
                  disabled={busy}
                  autoComplete="email"
                />
              </Field>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <Button type="button" disabled={busy} onClick={close}>
              Manter minha conta
            </Button>
            <Button
              className="danger"
              disabled={
                busy ||
                !me.data ||
                (!me.data.hasPassword && !me.data.recentGoogleAuthentication)
              }
            >
              {busy ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
