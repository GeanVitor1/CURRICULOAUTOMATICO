import { confirmedApplication } from "../shared/confirmed-applications";
import { useQuery } from "@tanstack/react-query";
import { useRef,useState } from "react";
import type {AutomationConversion} from '../server/automation-conversion';
import { Play, Pause, FileText, ArrowRight, Search, Info } from "lucide-react";
import { Button, Mascot, PageHead, DiscoveryStatus } from "./components";
import { api, date, useAction, useApp } from "./lib";
import type { SiteCapability } from "./CareerInterview";
import PortalConnections from "./PortalConnections";
import { useBilling } from "./Billing";
import AntigravityConnection from "./AntigravityConnection";

export default function SimpleAutomation() {
  const { w, navigate, toast } = useApp();
  const a = useAction();
  const billing = useBilling();
  const saving = useRef(false);
  const [showConversion,setShowConversion]=useState(false);
  const conversion=useQuery({queryKey:['automation-conversion'],queryFn:()=>api<AutomationConversion>('/automation/conversion'),enabled:showConversion,refetchInterval:showConversion?30000:false});
  const sites = useQuery({
    queryKey: ["automation-sites"],
    queryFn: () => api<SiteCapability[]>("/automation/sites"),
  });
  const ready =
    w.interview?.completed &&
    w.interview.answers.resumeId === w.resumes[0]?.id &&
    w.resumes[0]?.approved &&
    w.profile.confirmed;
  const officialAvailable =
    sites.data?.some((site) => site.independentAutomatic) || false;
  const available =
    !!ready &&
    w.interview!.answers.sites.some((site) =>
      sites.data?.some(
        (item) =>
          item.id === site && (item.automatic || item.independentAutomatic),
      ),
    );
  const allAvailable =
    available &&
    w.interview!.answers.sites.every((site) =>
      sites.data?.some(
        (item) =>
          item.id === site && (item.automatic || item.independentAutomatic),
      ),
    );
  const cloudAvailable = sites.data?.some(
    (site) =>
      site.cloud &&
      site.connectable &&
      !site.externalLoginOnly &&
      w.interview?.answers.sites.includes(site.id),
  );
  const saveRoutine = (upgrade = false) => {
    if (saving.current || a.isPending) return;
    saving.current = true;
    const enabled = upgrade || !w.routine.enabled;
    const mode = upgrade
      ? "automatic"
      : w.routine.enabled
        ? w.routine.mode
        : available
          ? "automatic"
          : "approval";
    a.mutate(
      {
        path: "/routine",
        method: "PUT",
        body: {
          ...w.routine,
          enabled,
          mode,
          ...(officialAvailable && enabled
            ? { destinationPolicy: "official" }
            : {}),
        },
      },
      {
        onSuccess: () => {
          saving.current = false;
          toast(
            !enabled
              ? "Automação pausada."
              : mode === "automatic"
                ? "Envio automático ativado."
                : "Busca e preparação ativadas. O envio ainda depende de você.",
          );
          if (enabled) a.mutate({ path: "/discover" });
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  };
  const waiting = ["queued", "running"].includes(w.runs[0]?.status || "");
  const sent = w.applications.filter(confirmedApplication).length;
  return (
    <div className="career-flow">
      <PageHead
        title="Sua automação"
        description="Seu currículo, suas preferências e suas candidaturas. Tudo em um só lugar."
      />
      <AntigravityConnection />
      <details className="interview-card conversion-indicators" onToggle={e=>setShowConversion(e.currentTarget.open)}>
        <summary>Indicadores técnicos da automação</summary>
        <p>Inventário preservado e etapas de candidatura. Um executor disponível ainda pode encontrar perguntas ou verificação humana no formulário.</p>
        {conversion.isPending&&showConversion&&<p role="status">Consultando indicadores…</p>}
        {conversion.isError&&<p role="alert">Não foi possível consultar os indicadores agora.</p>}
        {conversion.data&&<>
          <table><caption>Etapas no inventário atual</caption><thead><tr><th scope="col">Etapa</th><th scope="col">Quantidade</th></tr></thead><tbody>
            {([
              ['Vagas descobertas',conversion.data.totals.discovered],['Vagas compatíveis',conversion.data.totals.compatible],
              ['Destino válido',conversion.data.totals.validDestination],['Executor disponível',conversion.data.totals.executorAvailable],
              ['Candidaturas preparadas',conversion.data.totals.prepared],['Transmissões iniciadas',conversion.data.totals.transmissionsStarted],
              ['Envios confirmados',conversion.data.totals.confirmed],['Automáticos com origem comprovada',conversion.data.totals.confirmedAutomatic],
            ] as const).map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
          </tbody></table>
          <p>Hoje: {conversion.data.today.discovered} novas vagas, {conversion.data.today.prepared} preparações, {conversion.data.today.transmissionsStarted} transmissões e {conversion.data.today.confirmedAutomatic} envios automáticos confirmados.</p>
          <table><caption>Bloqueios por plataforma e categoria</caption><thead><tr><th scope="col">Plataforma</th><th scope="col">Categoria</th><th scope="col">Quantidade</th></tr></thead><tbody>
          {Object.entries(conversion.data.platforms).flatMap(([platform,counts])=>Object.entries(counts).filter(([code])=>code.startsWith('blocked:')).map(([code,count])=><tr key={platform+code}><th scope="row">{platform}</th><td>{code.slice(8)}</td><td>{count}</td></tr>))}
          </tbody></table>
          <p>Registros removidos anteriormente não são reconstruídos. Atualizado em {date(conversion.data.at)}.</p>
        </>}
      </details>
      {billing.data && (
        <div className="automation-quota">
          <span>
            <strong>Plano {billing.data.name}</strong> ·{" "}
            {billing.data.remainingToday} de {billing.data.dailyLimit} envios
            disponíveis hoje
          </span>
          <Button onClick={() => navigate("conta")}>Ver planos</Button>
        </div>
      )}
      {w.routine.enabled && w.routine.mode==='automatic' && w.routine.progress?.day===new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}) && (
        <section className="interview-card" aria-label="Candidaturas automáticas de hoje" role="status">
          <h2>{w.routine.progress.sent} de {w.routine.progress.target} candidaturas automáticas confirmadas hoje</h2>
          <p>{`${w.routine.progress.remaining} envios disponíveis hoje. `}{w.routine.progress.message}</p>
          {(w.routine.progress.usedToday || 0)>w.routine.progress.sent && <p>A cota usada também inclui outras tentativas ou envios fora deste contador automático.</p>}
          <p>O plano permite até {w.routine.progress.target} envios por dia. O sistema continua nas vagas compatíveis com envio disponível.</p>
        </section>
      )}
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
              <Button disabled={a.isPending} onClick={() => saveRoutine()}>
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
                      ? available
                        ? w.routine.destinationPolicy === "official"
                          ? "Envio automático nas empresas ativo"
                          : "Envio automático ativo"
                        : "Conecte um site para iniciar os envios"
                      : "Busca diária ativa · envio pelo site"
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
                onClick={() => saveRoutine()}
              >
                {w.routine.enabled ? <Pause size={16} /> : <Play size={16} />}
                {w.routine.enabled
                  ? "Pausar"
                  : available
                    ? "Ativar envio automático"
                    : "Iniciar busca e preparação"}
              </Button>
              {w.routine.enabled &&
                w.routine.mode !== "automatic" &&
                available && (
                  <Button
                    className="primary"
                    disabled={a.isPending}
                    onClick={() => saveRoutine(true)}
                  >
                    <Play size={16} />
                    Ativar envio automático
                  </Button>
                )}
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
            {(officialAvailable || !allAvailable) && (
              <div className="automation-scope" role="status">
                <Info size={19} aria-hidden="true" />
                <div>
                  <strong>
                    {officialAvailable
                      ? "Candidaturas nos formulários oficiais das empresas"
                      : available
                        ? "Envio automático nas fontes autorizadas"
                        : cloudAvailable
                          ? "Buscamos destinos oficiais para suas candidaturas"
                          : "Você conclui o envio no site da empresa"}
                  </strong>
                  <p>
                    {officialAvailable
                      ? "Enviamos seu currículo aprovado quando a vaga atende às suas preferências e possui um formulário compatível. Não é necessário conectar Gupy ou LinkedIn nem instalar extensões. A IA responde com base no currículo e nas preferências. Sem informação, usa “não” ou “prefiro não informar”. O histórico mostra apenas envios confirmados."
                      : available
                        ? "Buscamos destinos oficiais e processamos automaticamente os formulários compatíveis. Apenas envios confirmados aparecem nas candidaturas."
                        : cloudAvailable
                          ? "Procuramos a mesma vaga no site da empresa e em sistemas de recrutamento. Você só precisa conectar um portal quando optar por um destino que exige login. Envios dependem de formulário verificado, autorização e dados aprovados."
                          : "Buscamos as vagas e preparamos as candidaturas compatíveis. Abra uma vaga para revisar o currículo e a apresentação, depois conclua o envio no portal. A candidatura só aparece como enviada após sua confirmação."}
                  </p>
                </div>
              </div>
            )}
          </section>
          <details className="interview-extra">
            <summary>Conexões opcionais com portais</summary>
            <p>
              Os portais são fontes de descoberta. Procuramos destinos oficiais
              equivalentes antes de depender de uma conta de portal; cada envio
              exige um destino verificado e autorizado.
            </p>
            <PortalConnections selected={w.interview!.answers.sites} />
          </details>
          <div className="automation-counters">
            <button onClick={() => navigate("vagas")}>
              <strong>
                {w.jobCounts?.collected ?? w.jobCounts?.total ?? 0}
              </strong>
              <span>Anúncios encontrados</span>
            </button>
            <button onClick={() => navigate("candidaturas")}>
              <strong>{sent}</strong>
              <span>Candidaturas enviadas</span>
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
              {w.routine.enabled && w.routine.mode === "automatic" && (
                <Button disabled={a.isPending} onClick={() => a.mutate({path:"/routine/process"}, {onSuccess: result => toast(result.queued ? `${result.queued} candidatura(s) adicionada(s) à fila automática.` : "A rotina continuará buscando vagas com formulário compatível.")})}>
                  Processar vagas encontradas
                </Button>
              )}
              <Button onClick={() => navigate("candidaturas")}>
                Ver candidaturas enviadas
                <ArrowRight size={16} />
              </Button>
            </div>
          </section>
          <DiscoveryStatus />
          {w.routine.enabled && w.infrastructure.scheduleWindow && (
            <p className="interview-help">{w.infrastructure.scheduleWindow}</p>
          )}
        </>
      )}
    </div>
  );
}
