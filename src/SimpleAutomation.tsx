import { confirmedApplication } from "../shared/confirmed-applications";
import { useQuery } from "@tanstack/react-query";
import { useRef,useState } from "react";
import type {AutomationConversion} from '../server/automation-conversion';
import { Play, Pause, FileText, ArrowRight, Search, Info } from "lucide-react";
import { Button, Mascot, PageHead, DiscoveryStatus } from "./components";
import { CountUp } from "./motion";
import { DailyProgress, AutomationHowItWorks } from "./AutomationWidgets";
import { api, date, useAction, useApp } from "./lib";
import type { SiteCapability } from "./CareerInterview";
import { useBilling } from "./Billing";
import AntigravityConnection from "./AntigravityConnection";
import GettingStarted from './GettingStarted';
import {gettingStarted} from '../shared/getting-started';

export default function SimpleAutomation() {
  const { w, navigate, toast } = useApp();
  const a = useAction();
  const billing = useBilling();
  const saving = useRef(false);
  const [showConversion,setShowConversion]=useState(false);
  const conversion=useQuery({queryKey:['automation-conversion'],queryFn:()=>api<AutomationConversion>('/automation/conversion'),enabled:showConversion,refetchInterval:showConversion?30000:false});
  const sites = useQuery({
    queryKey: ["automation-sites"],
    queryFn: async () => {
      const data = await api<SiteCapability[]>("/automation/sites");
      return Array.isArray(data) ? data : [];
    },
  });
  const ready = gettingStarted(w).configured;
  const officialAvailable =
    sites.data?.some((site) => site.independentAutomatic) || false;
  const available =
    !!ready &&
    (officialAvailable || w.interview!.answers.sites.some((site) =>
      sites.data?.some(
        (item) =>
          item.id === site && item.automatic,
      ),
    ));
  const allAvailable =
    available &&
    w.interview!.answers.sites.every((site) =>
      sites.data?.some(
        (item) =>
          item.id === site && item.automatic,
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
          destinationPolicy: w.routine.destinationPolicy || "any",
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
    <div className="career-flow app-stagger">
      <PageHead
        title={ready?'Sua automação':'Vamos preparar sua busca'}
        description={ready?'Seu currículo, suas preferências e suas candidaturas. Tudo em um só lugar.':'Veja o que já está pronto e qual é seu próximo passo.'}
      />
      {ready&&<AntigravityConnection />}
      {ready&&<details className="interview-card conversion-indicators" onToggle={e=>setShowConversion(e.currentTarget.open)}>
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
      </details>}
      {ready&&billing.data && (
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
        <DailyProgress progress={w.routine.progress} onQuestions={() => navigate("perfil-inteligente")} />      )}
      {!ready ? (
        <><GettingStarted/>
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
        </>
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
                <p className="automation-next">
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
              <AutomationHowItWorks
                steps={officialAvailable || available ? [
                  "Achamos vagas compatíveis",
                  "Enviamos pelos canais oficiais",
                  "Dúvidas ficam para você",
                ] : undefined}
                title={
                    officialAvailable
                      ? "Candidaturas automáticas nos canais disponíveis"
                      : available
                        ? "Envio automático nas fontes autorizadas"
                        : cloudAvailable
                          ? "Buscamos destinos oficiais para suas candidaturas"
                          : "Você conclui o envio no site da empresa"}
              >
              <div className="automation-scope" role="status">
                <Info size={19} aria-hidden="true" />
                <div>
                  <strong>
                    {officialAvailable
                      ? "Candidaturas automáticas nos canais disponíveis"
                      : available
                        ? "Envio automático nas fontes autorizadas"
                        : cloudAvailable
                          ? "Buscamos destinos oficiais para suas candidaturas"
                          : "Você conclui o envio no site da empresa"}
                  </strong>
                  <p>
                    {officialAvailable
                      ? "Enviamos seu currículo aprovado nas vagas compatíveis pelos formulários oficiais, e-mails verificados e portais conectados. Destinos que exigem login usam a conexão autorizada na sua conta. A IA responde com os dados aprovados e sua regra para informações ausentes. Perguntas e consentimentos sem resposta autorizada aguardam sua revisão. O histórico mostra apenas envios confirmados."
                      : available
                        ? "Buscamos destinos oficiais e processamos automaticamente os formulários compatíveis. Apenas envios confirmados aparecem nas candidaturas."
                        : cloudAvailable
                          ? "Procuramos a mesma vaga no site da empresa e em sistemas de recrutamento. Você só precisa conectar um portal quando optar por um destino que exige login. Envios dependem de formulário verificado, autorização e dados aprovados."
                          : "Buscamos as vagas e preparamos as candidaturas compatíveis. Abra uma vaga para revisar o currículo e a apresentação, depois conclua o envio no portal. A candidatura só aparece como enviada após sua confirmação."}
                  </p>
                </div>
              </div>
              </AutomationHowItWorks>
            )}
          </section>
          <section className="integration-info"><h3>Suas contas conectadas</h3><p>Gerencie LinkedIn, Gupy, InfoJobs e Glassdoor na sua área de Conexões.</p><Button onClick={()=>navigate('conexoes')}>Abrir conexões</Button></section>
          <div className="automation-counters">
            <button type="button" className="is-static" tabIndex={-1}>
              <strong>
                <CountUp value={w.jobCounts?.collected ?? w.jobCounts?.total ?? 0} />
              </strong>
              <span>Anúncios encontrados</span>
            </button>
            <button onClick={() => navigate("candidaturas")}>
              <strong><CountUp value={sent} /></strong>
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

              {w.routine.enabled && w.routine.mode === "automatic" && (
                <Button disabled={a.isPending} onClick={() => a.mutate({path:"/routine/process"}, {onSuccess: result => toast(result.queued ? `${result.queued} ${result.queued === 1 ? "candidatura adicionada" : "candidaturas adicionadas"} à fila automática.` : "A rotina continuará buscando vagas com formulário compatível.")})}>
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
