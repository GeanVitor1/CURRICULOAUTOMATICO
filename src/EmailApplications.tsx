import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field } from "./components";
import { api, useAction, useApp } from "./lib";
import type { Job } from "../shared/types";

export function EmailConnection() {
  const { demo, navigate } = useApp();
  const action = useAction(),
    client = useQueryClient();
  const connection = useQuery({
    queryKey: ["email-connection"],
    enabled: !demo,
    queryFn: () =>
      api<{ configured: boolean; connected: boolean; email: string | null }>(
        "/email/connection",
      ),
  });
  const failed = new URLSearchParams(window.location.search).get(
    "google_error",
  );
  return (
    <section
      className="interview-card"
      aria-label="Envio de candidaturas por e-mail"
    >
      <h2>Seu e-mail para candidaturas</h2>
      <p>
        Conecte seu Gmail para o sistema enviar candidaturas às vagas que
        publicam esse canal. Você não precisa de domínio próprio.
      </p>
      <p>
        A conexão solicita permissão para enviar e-mails. Ela não solicita
        leitura da caixa de entrada. Os envios continuam sujeitos ao currículo
        aprovado, à verificação da vaga e à sua autorização individual ou rotina
        ativa.
      </p>
      {failed && (
        <p role="alert">
          A conexão com Google não foi concluída. Verifique se escolheu a mesma
          conta do seu cadastro e autorizou o envio. Se o Google bloquear o
          aplicativo, a configuração e a verificação dele precisarão ser
          concluídas pelo operador.
        </p>
      )}
      {demo ? (
        <Button onClick={() => navigate("conta")}>Entrar na conta real</Button>
      ) : connection.isPending ? (
        <p role="status">Verificando conexão…</p>
      ) : connection.isError ? (
        <p role="alert">Não foi possível consultar a conexão.</p>
      ) : connection.data?.connected ? (
        <>
          <p>
            Gmail conectado: <strong>{connection.data.email}</strong>
          </p>
          <Button
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { path: "/email/connection", method: "DELETE" },
                {
                  onSuccess: () => {
                    void client.invalidateQueries({
                      queryKey: ["email-connection"],
                    });
                  },
                },
              )
            }
          >
            Desconectar Gmail
          </Button>
        </>
      ) : (
        <Button
          className="primary"
          disabled={action.isPending || !connection.data?.configured}
          onClick={() =>
            action.mutate(
              { path: "/auth/google/start", body: { intent: "gmail" } },
              { onSuccess: (result) => window.location.assign(result.url) },
            )
          }
        >
          Conectar Gmail para candidaturas
        </Button>
      )}
    </section>
  );
}

export function EmailDestinationReview({ job }: { job: Job }) {
  const { demo, toast } = useApp(),
    action = useAction(),
    client = useQueryClient();
  const [employerUrl, setEmployerUrl] = useState(
    job.emailDestination?.employerUrl || "",
  );
  if (demo) return null;
  return (
    <details className="interview-extra">
      <summary>Candidatura por e-mail publicado na vaga</summary>
      <p>
        O sistema confere o endereço no anúncio e no site da empresa. Um e-mail
        de contato sem instrução de candidatura no anúncio não basta.
      </p>
      {job.emailDestination && (
        <p>
          Destinatário verificado: <strong>{job.emailDestination.email}</strong>
        </p>
      )}
      <Field label="Site da empresa para confirmar o endereço (opcional)">
        <input
          type="url"
          maxLength={2000}
          value={employerUrl}
          placeholder="https://empresa.com.br"
          onChange={(event) => setEmployerUrl(event.target.value)}
        />
      </Field>
      <Button
        disabled={action.isPending}
        onClick={() =>
          action.mutate(
            {
              path: `/jobs/${job.id}/email-destination`,
              body: { employerUrl: employerUrl.trim() || undefined },
            },
            {
              onSuccess: () => {
                toast(
                  "Endereço da empresa verificado. O envio ainda não foi iniciado.",
                );
                void client.invalidateQueries({
                  queryKey: ["submission-readiness"],
                });
              },
            },
          )
        }
      >
        Verificar e-mail de candidatura
      </Button>
    </details>
  );
}
