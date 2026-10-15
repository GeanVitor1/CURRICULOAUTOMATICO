import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Modal } from "./components";
import { api, useApp } from "./lib";
import {
  portalConnectorId,
  portalConnectorVersion,
} from "../shared/portal-connector";
import { portals } from "../shared/portals";
type Runtime = {
  lastError?: { message?: string };
  sendMessage: (
    id: string,
    message: unknown,
    callback: (response: any) => void,
  ) => void;
};
function extensionMessage(message: unknown, timeout = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const runtime = (
      globalThis as unknown as { chrome?: { runtime?: Runtime } }
    ).chrome?.runtime;
    if (!runtime?.sendMessage)
      return reject(
        new Error(
          "Instale o conector no Chrome ou Edge e recarregue este painel.",
        ),
      );
    const timer = window.setTimeout(
      () =>
        reject(
          new Error(
            "O conector não respondeu. Confira a janela de autorização ou tente novamente.",
          ),
        ),
      timeout,
    );
    try {
      runtime.sendMessage(portalConnectorId, message, (response) => {
        window.clearTimeout(timer);
        if (runtime.lastError || !response)
          return reject(
            new Error(
              "Instale o conector no Chrome ou Edge e recarregue este painel.",
            ),
          );
        resolve(response);
      });
    } catch {
      window.clearTimeout(timer);
      reject(new Error("O conector não está disponível neste navegador."));
    }
  });
}
export default function PortalConnector({
  portal,
  connected,
}: {
  portal: string;
  connected?: boolean;
}) {
  const { w, toast } = useApp();
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [installed, setInstalled] = useState(false),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    alive = useRef(true);
  const resume = w.resumes[0];
  const ready =
    resume?.approved &&
    w.profile.confirmed &&
    w.interview?.completed &&
    w.interview.answers.resumeId === resume.id;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detect = async () => {
    try {
      const result = await extensionMessage({ type: "empregatos:ping" });
      setInstalled(result.version === portalConnectorVersion);
    } catch {
      setInstalled(false);
    }
  };
  const connect = async () => {
    if (!ready || !approved || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await extensionMessage(
        { type: "empregatos:connect", portal },
        165000,
      );
      if (!response.ok)
        throw new Error(response.error || "A conexão foi cancelada.");
      if (!alive.current) return;
      const result = await api<{ ok: boolean; automatic: boolean }>(
        `/connections/${portal}/import`,
        {
          method: "POST",
          body: JSON.stringify({
            authorizeAutomation: true,
            profileResumeId: resume!.id,
            state: response.state,
          }),
        },
      );
      delete response.state;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["automation-sites"] }),
        client.invalidateQueries({ queryKey: ["workspace"] }),
      ]);
      if (!alive.current) return;
      setOpen(false);
      toast(
        result.automatic
          ? "Conta verificada na nuvem. Envios automáticos ativados para candidaturas elegíveis."
          : "Conta verificada. Revise o currículo e as preferências para ativar os envios.",
      );
    } catch (failure) {
      if (alive.current) setError((failure as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <>
      <Button
        onClick={() => {
          setApproved(false);
          setError("");
          setOpen(true);
          void detect();
        }}
      >
        {connected
          ? "Renovar conexão com a automação"
          : "Conectar com a automação"}
      </Button>
      <Modal
        title={`Conectar ${portals[portal as keyof typeof portals]?.name || portal} à automação`}
        description="Entre primeiro no site oficial e mantenha essa aba aberta. O conector permite compartilhar essa sessão, sem pedir sua senha no painel."
        open={open}
        busy={busy}
        onOpenChange={setOpen}
      >
        <p>
          A sessão compartilhada permite candidaturas em seu nome pelo servidor,
          mesmo com seu computador desligado. Você autoriza isso na janela da
          extensão e pode revogar em Desconectar.
        </p>
        {!installed && (
          <div>
            <p>
              Instale o conector no Chrome ou Edge uma vez. Esta versão tem
              instalação manual; ainda não está na loja de extensões.
            </p>
            <a className="button" href="/empregatos-conector.zip" download>
              Baixar conector
            </a>
            <ol>
              <li>Extraia o ZIP para uma pasta permanente.</li>
              <li>
                Abra <code>chrome://extensions</code> ou{" "}
                <code>edge://extensions</code> e ative o Modo do desenvolvedor.
              </li>
              <li>
                Clique em Carregar sem compactação e escolha a pasta que contém{" "}
                <code>manifest.json</code>.
              </li>
              <li>
                Recarregue este painel e clique novamente em Conectar com a
                automação.
              </li>
            </ol>
            <Button onClick={() => void detect()}>Verificar instalação</Button>
          </div>
        )}
        {installed && (
          <p role="status">
            Conector instalado. Ao continuar, autorize a conexão na janela da
            extensão.
          </p>
        )}
        {!ready && (
          <p role="status">
            Confirme seu currículo e conclua as preferências antes de conectar a
            automação.
          </p>
        )}
        {ready && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={approved}
              disabled={busy}
              onChange={(e) => setApproved(e.target.checked)}
            />
            Meu currículo neste portal corresponde a “{resume.name}”. Autorizo
            candidaturas automáticas conforme minhas preferências.
          </label>
        )}
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p role="status">
            Conclua a autorização na janela do conector. Depois verificaremos a
            sessão na nuvem.
          </p>
        )}
        <div className="modal-footer">
          <Button
            className="primary"
            disabled={!installed || !approved || !ready || busy}
            onClick={() => void connect()}
          >
            {busy ? "Conectando…" : "Autorizar conexão e envios"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
