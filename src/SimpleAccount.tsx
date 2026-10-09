import { useRef, useState } from "react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Field, Modal, PageHead } from "./components";
import { api, useApp } from "./lib";
import IntelligenceControl from "./IntelligenceControl";
export default function SimpleAccount() {
  const { w } = useApp();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const [error, setError] = useState("");
  const close = () => {
    if (deleting.current) return;
    setOpen(false);
    setPassword("");
    setError("");
  };
  return (
    <div className="career-flow">
      <PageHead
        title="Minha conta"
        description="Seus dados e sua privacidade."
      />
      <section className="interview-card account-profile">
        <span className="account-avatar" aria-hidden="true">
          {w.profile.name.slice(0, 1).toUpperCase()}
        </span>
        <h2>{w.profile.name}</h2>
        <p>{w.profile.email}</p>
        <IntelligenceControl />
        <div className="interview-actions">
          <a className="button" href="/api/export" download>
            <Download size={16} />
            Baixar meus dados
          </a>
        </div>
      </section>
      <section className="account-privacy">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2>Você controla seus dados</h2>
          <p>
            Baixe uma cópia do seu perfil e histórico. Para entender como seus
            dados são usados, consulte nossa{" "}
            <a href="/privacy">política de privacidade</a>.
          </p>
        </div>
      </section>
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
                body: JSON.stringify({ password }),
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <Button type="button" disabled={busy} onClick={close}>
              Manter minha conta
            </Button>
            <Button className="danger" disabled={busy}>
              {busy ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
