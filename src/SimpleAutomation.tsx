import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Play, Pause, FileText, ArrowRight, Search, Info } from "lucide-react";
import { Button, Mascot, PageHead, DiscoveryStatus } from "./components";
import { api, date, useAction, useApp } from "./lib";
import type { SiteCapability } from "./CareerInterview";
import PortalConnections from "./PortalConnections";

export default function SimpleAutomation() {
  const { w, navigate, toast } = useApp();
  const a = useAction();
  const saving = useRef(false);
  const sites = useQuery({
    queryKey: ["automation-sites"],
    queryFn: () => api<SiteCapability[]>("/automation/sites"),
  });
  const ready =
    w.interview?.completed &&
    w.interview.answers.resumeId === w.resumes[0]?.id &&
    w.resumes[0]?.approved &&
    w.profile.confirmed;
  const available =
    !!ready &&
    w.interview!.answers.sites.some((site) =>
      sites.data?.some((item) => item.id === site && item.automatic),
    );
  const allAvailable =
    available &&
    w.interview!.answers.sites.every((site) =>
      sites.data?.some((item) => item.id === site && item.automatic),
    );
  const saveRoutine = () => {
    if (saving.current || a.isPending) return;
    saving.current = true;
    a.mutate(
      {
        path: "/routine",
        method: "PUT",
        body: {
          ...w.routine,
          enabled: !w.routine.enabled,
          mode: w.routine.enabled
            ? w.routine.mode
            : available
              ? "automatic"
              : "approval",
        },
      },
      {
        onSuccess: () => {
          saving.current = false;
          toast(
            w.routine.enabled
              ? "Automação pausada."
              : available
                ? "Envio automático ativado."
                : "Busca e preparação ativadas. O envio ainda depende de você.",
          );
          if (!w.routine.enabled) a.mutate({ path: "/discover" });
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  };
  const waiting = ["queued", "running"].includes(w.runs[0]?.status || "");
  const sent = w.applications.filter((item) => !!item.submittedAt).length;
  return (
    <div className="career-flow">
      <PageHead
        title="Sua automação"
        description="Seu currículo, suas preferências e suas candidaturas. Tudo em um só lugar."
      />
      {!ready ? (
        <section className="interview-card journey-start">
          <Mascot
            className="journey-mascot"
            variant={w.resumes.length ? "idea" : "handing-resume"}
            decorative
          />
          <h2>
            {w.resumes.length
              ? "Vamos conhecer suas preferências"
              : "Seu próximo emprego começa aqui"}
          </h2>
          <p>
            {w.resumes.length
              ? "Seu currículo já está salvo. Responda algumas perguntas para definir as vagas que você quer."
              : "Envie seu currículo. Depois, responda perguntas curtas sobre trabalho, salário e sites."}
          </p>
          <ol className="journey-steps">
            <li className={w.resumes.length ? "done" : ""}>
              Envie seu currículo
            </li>
            <li>Responda às perguntas</li>
            <li>Acompanhe as candidaturas</li>
          </ol>
          {w.routine.enabled && (
            <div className="interview-availability" role="status">
              <p>
                A rotina está ativa. Revise seu currículo e suas preferências.
              </p>
              <Button disabled={a.isPending} onClick={saveRoutine}>
                <Pause size={16} />
                Pausar
              </Button>
            </div>
          )}
          <Button
            className="primary"
            onClick={() =>
              navigate(w.resumes.length ? "preferencias" : "curriculo")
            }
          >
            {w.resumes.length ? "Responder às perguntas" : "Enviar currículo"}
            <ArrowRight size={16} />
          </Button>
        </section>
      ) : (
        <>
          <section
            className="automation-overview"
            aria-label="Estado da automação"
          >
            <section
              className={`automation-summary ${w.routine.enabled ? "is-active" : ""}`}
            >
              <div>
                <span className={`live-dot ${w.routine.enabled ? "on" : ""}`} />
                <h2>
                  {w.routine.enabled
                    ? w.routine.mode === "automatic"
                      ? "Envio automático ativo"
                      : "Busca e preparação ativas"
                    : "Automação pausada"}
                </h2>
                <p>
                  {waiting
                    ? "Uma busca está em andamento. Os resultados serão atualizados aqui."
                    : w.routine.enabled
                      ? `Próxima busca: ${date(w.routine.nextRun, true)}`
                      : "Ative quando quiser começar."}
                </p>
              </div>
              <Button
                className={w.routine.enabled ? "" : "primary"}
                disabled={
                  a.isPending ||
                  (!w.routine.enabled && (sites.isPending || sites.isError))
                }
                onClick={saveRoutine}
              >
                {w.routine.enabled ? <Pause size={16} /> : <Play size={16} />}
                {w.routine.enabled
                  ? "Pausar"
                  : available
                    ? "Ativar envio automático"
                    : "Iniciar busca e preparação"}
              </Button>
            </section>
            {sites.isError && (
              <div className="recoverable-error" role="alert">
                <p>
                  Não conseguimos verificar os sites agora. Tente novamente para
                  iniciar a rotina.
                </p>
                <Button
                  disabled={sites.isFetching}
                  onClick={() => sites.refetch()}
                >
                  {sites.isFetching ? "Verificando…" : "Tentar novamente"}
                </Button>
              </div>
            )}
            {!allAvailable && (
              <div className="automation-scope" role="status">
                <Info size={19} aria-hidden="true" />
                <div>
                  <strong>
                    {available
                      ? "Envio automático nas fontes autorizadas"
                      : "Busca e preparação, com envio conforme cada fonte"}
                  </strong>
                  <p>
                    Há sites sem integração de envio disponível. Nesses sites,
                    as candidaturas preparadas ficam pendentes para você
                    concluir no site oficial.
                  </p>
                </div>
              </div>
            )}
          </section>
          <details className="interview-extra" open={!allAvailable}>
            <summary>Contas dos sites</summary>
            <PortalConnections selected={w.interview!.answers.sites} />
          </details>
          <div className="automation-counters">
            <button onClick={() => navigate("vagas")}>
              <strong>{w.jobCounts?.total || 0}</strong>
              <span>Vagas encontradas</span>
            </button>
            <button onClick={() => navigate("candidaturas")}>
              <strong>{sent}</strong>
              <span>Candidaturas enviadas</span>
            </button>
            <button onClick={() => navigate("candidaturas")}>
              <strong>
                {w.applications.filter((item) => !item.submittedAt).length}
              </strong>
              <span>Pendentes</span>
            </button>
          </div>
          <section className="automation-preferences">
            <div>
              <FileText size={18} />
              <strong>{w.filters.titles.join(", ")}</strong>
            </div>
            <p>
              {w.filters.modalities.join(" · ")} ·{" "}
              {w
                .interview!.answers.sites.map(
                  (site) =>
                    sites.data?.find((item) => item.id === site)?.name || site,
                )
                .join(", ")}
            </p>
            <div className="interview-actions">
              <Button onClick={() => navigate("preferencias")}>
                Mudar preferências
              </Button>
              <Button
                disabled={a.isPending || waiting}
                onClick={() => a.mutate({ path: "/discover" })}
              >
                <Search size={16} />
                {waiting ? "Buscando…" : "Buscar agora"}
              </Button>
              <Button onClick={() => navigate("vagas")}>
                Ver vagas encontradas
                <ArrowRight size={16} />
              </Button>
            </div>
          </section>
          <DiscoveryStatus />
        </>
      )}
    </div>
  );
}
