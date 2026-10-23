import { useState } from "react";
import {
  BriefcaseBusiness,
  Search,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  Button,
  CompanyLogo,
  Empty,
  Modal,
  PageHead,
  Score,
} from "../components";
import { date, useApp } from "../lib";
import { confirmedApplication } from "../../shared/confirmed-applications";

export default function Applications() {
  const { w, navigate } = useApp();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const applications = w.applications.filter(confirmedApplication);
  const apps = applications.filter((app) => {
    const job = w.jobs.find((job) => job.id === app.jobId);
    return (
      job &&
      `${job.title} ${job.company}`.toLowerCase().includes(search.toLowerCase())
    );
  });
  const current = applications.find((app) => app.id === selectedId);
  const job = w.jobs.find((job) => job.id === current?.jobId);
  return (
    <div>
      <PageHead
        eyebrow="ENVIOS CONFIRMADOS"
        title="Candidaturas enviadas"
        description="Seu histórico mostra apenas candidaturas concluídas com confirmação de envio."
      >
        <Button onClick={() => navigate("automacao")}>
          <BriefcaseBusiness size={15} />
          Ver automação
        </Button>
      </PageHead>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Buscar candidaturas"
            placeholder="Buscar por cargo ou empresa…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="count-caption">{apps.length} candidaturas enviadas</div>
      {apps.length ? (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Oportunidade</th>
                <th>Compatibilidade</th>
                <th>Status</th>
                <th>Data do envio</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => {
                const vacancy = w.jobs.find((item) => item.id === app.jobId)!;
                return (
                  <tr
                    key={app.id}
                    tabIndex={0}
                    onClick={() => setSelectedId(app.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(app.id);
                      }
                    }}
                  >
                    <td>
                      <div className="table-job">
                        <CompanyLogo name={vacancy.company} />
                        <div>
                          <strong>{vacancy.title}</strong>
                          <span>{vacancy.company}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Score score={vacancy.match.score} compact />
                    </td>
                    <td>
                      <span className="badge">
                        <CheckCircle2 size={14} />
                        Enviada
                      </span>
                    </td>
                    <td className="muted">{date(app.submittedAt!)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={
              search ? "Nenhum envio encontrado" : "Seus envios aparecerão aqui"
            }
            mascot="handing-resume"
            icon={<BriefcaseBusiness size={28} />}
            description={
              search
                ? "Tente outro cargo ou empresa."
                : "A automação usa seu currículo e suas preferências para concluir candidaturas. Cada envio aparece aqui após a confirmação."
            }
            action={
              <Button onClick={() => navigate("automacao")}>
                Acompanhar automação
              </Button>
            }
          />
        </div>
      )}
      <Modal
        title={job?.title || "Candidatura enviada"}
        description={job?.company || ""}
        open={!!current}
        onOpenChange={(open) => !open && setSelectedId(null)}
        wide
      >
        {current && job && (
          <>
            <div className="notice-inline">
              <CheckCircle2 size={18} />
              Enviada em {date(current.submittedAt!, true)}
            </div>
            <p>Confirmação: {current.receipt}</p>
            <a
              href={
                current.verification?.destinationUrl ||
                current.destinationUrl ||
                job.url
              }
              target="_blank"
              rel="noreferrer"
            >
              Ver destino da candidatura <ExternalLink size={14} />
            </a>
            {!!(
              current.answersUsed?.length || current.automaticAnswers?.length
            ) && (
              <section aria-label="Respostas da candidatura">
                <h3>Respostas da candidatura</h3>
                {(current.answersUsed?.length
                  ? current.answersUsed
                  : current.automaticAnswers || []
                ).map((answer, index) => (
                  <details key={index}>
                    <summary>{answer.question}</summary>
                    <p>{answer.value}</p>
                    <small>
                      {answer.source === "ai"
                        ? "Preparada pela IA com base no currículo"
                        : answer.source === "default_no"
                          ? "Regra para informações ausentes"
                          : answer.source === "job_source"
                            ? "Origem do anúncio"
                            : "Dados confirmados"}
                    </small>
                  </details>
                ))}
              </section>
            )}
            <details>
              <summary>Histórico do envio</summary>
              {current.history.map((event, index) => (
                <p key={index}>
                  <small>
                    {date(event.at, true)} · {event.actor}
                  </small>
                  <br />
                  {event.message}
                </p>
              ))}
            </details>
          </>
        )}
      </Modal>
    </div>
  );
}
