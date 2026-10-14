import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useApp } from "./lib";
import { Button, Field, Panel } from "./components";

type Login = {
  attempt?: string;
  url?: string;
  expiresAt?: number;
  connected?: boolean;
};

export default function AntigravityConnection() {
  const { demo, toast } = useApp();
  const client = useQueryClient();
  const [login, setLogin] = useState<Login>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["antigravity"],
    queryFn: () =>
      api<{ available: boolean; connected: boolean }>("/antigravity"),
    enabled: !demo,
    retry: false,
  });
  if (!status.data?.available) return null;
  const connect = async () => {
    setBusy(true);
    setLogin(undefined);
    setCode("");
    try {
      const next = await api<Login>("/antigravity/login", {
        method: "POST",
        body: "{}",
      });
      setLogin(next);
      if (next.connected) {
        await status.refetch();
        toast("Antigravity conectado.");
      }
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Antigravity na nuvem"
      detail="Use a conta Google do seu plano Pro para buscar vagas, mesmo com seu computador desligado."
    >
      <div className="integration-info">
        <p>
          {status.data.connected
            ? "Sua conta está conectada. A busca diária usa o Antigravity nas fontes que precisam de IA."
            : "Conecte uma vez sua conta Google. As próximas buscas serão executadas na hospedagem."}
        </p>
        <p>
          A Gupy continua usando anúncios públicos. O limite do seu plano Google
          e da hospedagem continua valendo. Créditos extras estão desativados.
          As candidaturas continuam disponíveis para concluir no site oficial.
        </p>
        {!status.data.connected && (
          <Button disabled={busy} onClick={connect}>
            {busy
              ? "Preparando conexão…"
              : login?.url
                ? "Gerar outro link de conexão"
                : "Conectar conta Google"}
          </Button>
        )}
        {login?.url && !status.data.connected && (
          <form
            className="form-card"
            onSubmit={async (e) => {
              e.preventDefault();
              const authorizationCode = code;
              setCode("");
              setBusy(true);
              try {
                await api("/antigravity/confirm", {
                  method: "POST",
                  body: JSON.stringify({
                    attempt: login.attempt,
                    code: authorizationCode,
                  }),
                });
                setLogin(undefined);
                await status.refetch();
                await client.invalidateQueries({ queryKey: ["workspace"] });
                toast("Conta conectada. Você já pode buscar agora.");
              } catch (error) {
                toast((error as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Abra o Google, entre na conta do plano Pro e cole abaixo o código
              exibido ao concluir. O link expira em cerca de um minuto; se
              necessário, gere outro.
            </p>
            <a
              className="button"
              href={login.url}
              target="_blank"
              rel="noreferrer"
            >
              Entrar na conta Google
            </a>
            <Field label="Código de autorização Google">
              <input
                type="password"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={2048}
                disabled={busy}
              />
            </Field>
            <Button type="submit" disabled={busy || !code.trim()}>
              {busy ? "Confirmando…" : "Confirmar conexão"}
            </Button>
          </form>
        )}
        {status.data.connected && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/antigravity", { method: "DELETE" });
                await status.refetch();
                toast("Conta desconectada da hospedagem.");
              } catch (error) {
                toast((error as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Desconectar Antigravity
          </Button>
        )}
      </div>
    </Panel>
  );
}
