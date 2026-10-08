import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Search,
  SlidersHorizontal,
  FileText,
  Plug,
  CheckCircle2,
  Clock3,
  BriefcaseBusiness,
  Bookmark,
  ArrowUpRight,
  Pause,
} from "lucide-react";
import {
  Button,
  DiscoveryStatus,
  Empty,
  JobDetail,
  JobRow,
  Panel,
  PageHead,
  StatusBadge,
} from "./components";
import { api, useApp, useAction, date, isToday, submitted } from "./lib";
import type { Job } from "../shared/types";
import "./product.css";

export default function Dashboard() {
  const { w, navigate, toast } = useApp();
  const action = useAction();
  const [selected, setSelected] = useState<Job | null>(null);
  const jobs = w.jobs
    .filter((j) => !j.discarded && j.availability !== "closed")
    .sort((a, b) => b.match.score - a.match.score);
  const recommendations = useQuery({
    queryKey: ["jobs", "recommended", w.filters, w.profile, w.runs[0]?.status],
    queryFn: () =>
      api<{ items: Job[]; total: number }>("/jobs?tab=compatible&pageSize=4"),
  });
  const recommended = recommendations.data?.items || [];
  const totalJobs = w.jobCounts?.total ?? jobs.length;
  const totalSaved = w.jobCounts?.saved ?? jobs.filter((j) => j.saved).length;
  const sources = w.sources.filter((s) => s.enabled && s.discovery);
  const sent = w.applications.filter((a) => submitted(a.status));
  const pending = w.applications.filter((a) =>
    [
      "Aguardando aprovação",
      "Requer ação manual",
      "Resultado desconhecido",
      "Falha no envio",
    ].includes(a.status),
  );
  const next = !w.filters.titles.length
    ? {
        title: "O que você quer encontrar?",
        text: "Escolha os cargos e os lugares que fazem sentido para você.",
        label: "Definir preferências",
        page: "onboarding",
        icon: SlidersHorizontal,
      }
    : !w.resumes.length
      ? {
          title: "Sua história merece um bom começo",
          text: "Envie seu currículo ou crie um com perguntas simples. Experiências informais também contam.",
          label: "Preparar meu currículo",
          page: "curriculo",
          icon: FileText,
        }
      : !sources.length
        ? {
            title: "Escolha onde vamos procurar",
            text: "Conecte um mural público de uma empresa para começar a buscar oportunidades reais.",
            label: "Conectar uma fonte",
            page: "configuracoes",
            icon: Plug,
          }
        : pending.length
          ? {
              title: pending.length + " candidaturas precisam da sua atenção",
              text: "Revise as oportunidades e confira o próximo passo de cada candidatura.",
              label: "Revisar candidaturas",
              page: "candidaturas",
              icon: BriefcaseBusiness,
            }
          : {
              title: "Tudo pronto para seu próximo passo",
              text: "Faça uma nova busca ou explore as oportunidades que você já encontrou.",
              label: "Explorar oportunidades",
              page: "vagas",
              icon: Search,
            };
  const name = w.profile.name.trim().split(" ")[0];
  const latestRun = w.runs[0];
  return (
    <div className="dashboard product-dashboard">
      <PageHead
        eyebrow="SEU PRÓXIMO CAPÍTULO"
        title={
          name
            ? "Bom ter você aqui, " + name + "."
            : "Seu próximo passo começa aqui."
        }
        description="Uma visão clara da sua busca. Uma oportunidade de cada vez."
      >
        <Button onClick={() => navigate("onboarding")}>
          <SlidersHorizontal size={16} />
          Minhas preferências
        </Button>
        <Button
          className="primary"
          disabled={action.isPending || !sources.length}
          onClick={() =>
            action.mutate(
              { path: "/discover" },
              { onSuccess: (r) => toast(r.message) },
            )
          }
        >
          <Search size={16} />
          {action.isPending ? "Consultando fontes…" : "Buscar vagas"}
        </Button>
      </PageHead>
      <div className="search-status-line">
        <span className={"live-dot " + (w.routine.enabled ? "on" : "")} />
        <strong>
          {w.routine.enabled ? "Busca agendada ativa" : "Busca no seu ritmo"}
        </strong>
        <span>
          {w.routine.enabled
            ? "Próxima busca: " + date(w.routine.nextRun, true)
            : "Você decide quando procurar."}
        </span>
        <button className="text-button" onClick={() => navigate("automacao")}>
          Gerenciar <ArrowUpRight size={13} />
        </button>
      </div>
      <DiscoveryStatus />
      <section className="next-action-panel">
        <div className="next-action-copy">
          <span className="eyebrow">PRÓXIMA AÇÃO</span>
          <h2>{next.title}</h2>
          <p>{next.text}</p>
          <Button className="primary" onClick={() => navigate(next.page)}>
            {next.label}
            <ArrowRight size={15} />
          </Button>
        </div>
        <div className="next-action-art" aria-hidden="true">
          <next.icon size={48} strokeWidth={1} />
          <span>Um passo de cada vez.</span>
        </div>
      </section>
      <div className="dashboard-editorial-grid">
        <div className="stack">
          <Panel
            title="Oportunidades para você"
            detail={
              recommended.length
                ? recommended.length + " compatíveis com suas preferências"
                : "As conexões começam com o seu perfil."
            }
            action={
              <button className="text-button" onClick={() => navigate("vagas")}>
                Ver todas <ArrowUpRight size={14} />
              </button>
            }
          >
            {recommended.length ? (
              recommended
                .slice(0, 4)
                .map((j) => (
                  <JobRow key={j.id} job={j} onClick={() => setSelected(j)} />
                ))
            ) : (
              <Empty
                title={
                  jobs.length
                    ? "Vamos ajustar a direção?"
                    : "Sua próxima oportunidade ainda está por vir"
                }
                description={
                  jobs.length
                    ? "As vagas encontradas ainda não atendem aos seus critérios. Revise as preferências ou explore todas as vagas."
                    : sources.length
                      ? "Busque nas fontes conectadas. Quando houver vagas para suas preferências, elas aparecerão aqui."
                      : "Conecte uma fonte oficial para descobrir vagas. Você também pode adicionar uma oportunidade encontrada por conta própria."
                }
                icon={<Search size={26} />}
                action={
                  <Button
                    onClick={() =>
                      navigate(sources.length ? "vagas" : "configuracoes")
                    }
                  >
                    {sources.length ? "Explorar vagas" : "Conectar fontes"}
                  </Button>
                }
              />
            )}
          </Panel>
          <Panel
            title="Candidaturas recentes"
            action={
              <button
                className="text-button"
                onClick={() => navigate("candidaturas")}
              >
                Acompanhar <ArrowUpRight size={14} />
              </button>
            }
          >
            {w.applications.length ? (
              [...w.applications]
                .sort(
                  (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
                )
                .slice(0, 4)
                .map((app) => {
                  const job = w.jobs.find((j) => j.id === app.jobId);
                  return (
                    <button
                      className="recent-application"
                      key={app.id}
                      onClick={() => navigate("candidaturas")}
                    >
                      <div>
                        <strong>
                          {job?.title || "Oportunidade registrada"}
                        </strong>
                        <span>
                          {job?.company} · {date(app.updatedAt)}
                        </span>
                      </div>
                      <StatusBadge status={app.status} />
                      <ArrowUpRight size={15} />
                    </button>
                  );
                })
            ) : (
              <Empty
                title="Cada candidatura tem uma história"
                description="Salve uma oportunidade e prepare sua candidatura. Você poderá acompanhar os próximos passos aqui."
                icon={<BriefcaseBusiness size={26} />}
                action={
                  <Button onClick={() => navigate("vagas")}>
                    Conhecer oportunidades
                  </Button>
                }
              />
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel
            title="Sua busca em perspectiva"
            detail="Seus registros, sem estimativas."
          >
            <div className="quiet-metrics">
              {[
                {
                  label: "Oportunidades encontradas",
                  value: totalJobs,
                  icon: Search,
                },
                {
                  label: "Salvas para depois",
                  value: totalSaved,
                  icon: Bookmark,
                },
                {
                  label: "Candidaturas enviadas",
                  value: sent.length,
                  icon: CheckCircle2,
                },
                {
                  label: "Envios confirmados hoje",
                  value: sent.filter((a) =>
                    isToday(a.submittedAt || a.createdAt),
                  ).length,
                  icon: Clock3,
                },
              ].map((s) => (
                <div key={s.label}>
                  <s.icon size={16} />
                  <span>{s.label}</span>
                  <strong>{s.value}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Fontes conectadas"
            action={
              <button
                className="icon-button"
                aria-label="Gerenciar fontes"
                onClick={() => navigate("configuracoes")}
              >
                <ArrowUpRight size={16} />
              </button>
            }
          >
            <div className="integration-info">
              {sources.length ? (
                sources.map((s) => (
                  <div className="dashboard-source" key={s.id}>
                    <Plug size={16} />
                    <div>
                      <strong>{s.company}</strong>
                      <small>
                        {s.status || "Aguardando primeira consulta"}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <p>
                  Nenhuma fonte conectada. Escolha um mural de vagas para
                  começar.
                </p>
              )}
              {latestRun && (
                <div
                  className={
                    "last-search-note " +
                    (latestRun.status === "failed" ? "negative" : "")
                  }
                >
                  <Clock3 size={14} />
                  <span>
                    Última consulta · {date(latestRun.at, true)}
                    <br />
                    {latestRun.message}
                  </span>
                </div>
              )}
              <Button
                className="full"
                onClick={() => navigate("configuracoes")}
              >
                Gerenciar integrações
              </Button>
            </div>
          </Panel>
          <Panel title="No seu tempo">
            <div className="integration-info">
              <p>
                <Pause size={16} className="inline-icon" /> Você pode pausar as
                buscas, mudar suas preferências e revisar cada candidatura.
              </p>
              <p>
                Para fontes públicas, você conclui o envio no site oficial da
                empresa.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <JobDetail
        job={
          selected ? w.jobs.find((j) => j.id === selected.id) || selected : null
        }
        close={() => setSelected(null)}
      />
    </div>
  );
}
