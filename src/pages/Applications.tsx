import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Search,
  LayoutGrid,
  Columns3,
  List,
  Plus,
  Clock3,
  CheckCircle2,
  Save,
  ExternalLink,
  Sparkles,
  Download,
} from "lucide-react";
import {
  Badge,
  Button,
  CompanyLogo,
  Empty,
  Field,
  JobCard,
  Modal,
  PageHead,
  Score,
  StatusBadge,
  Mascot,
} from "../components";
import { api, date, useAction, useApp } from "../lib";
import type { Application, Job, Status } from "../../shared/types";
import { transitions } from "../../shared/types";
const ImportModal = lazy(() =>
  import("../JobForms").then((module) => ({ default: module.ImportModal })),
);
export default function Applications() {
  const { w, demo, navigate, toast } = useApp();
  const a = useAction();
  const [view] = useState("table"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Application | null>(null),
    [status, setStatus] = useState<Status>("Requer ação manual"),
    [confirmation, setConfirm] = useState(false),
    [note, setNote] = useState(""),
    [manual, setManual] = useState(false);
  const [importing, setImporting] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [debouncedManualSearch, setDebouncedManualSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedManualSearch(manualSearch), 250);
    return () => clearTimeout(timer);
  }, [manualSearch]);
  const [manualPage, setManualPage] = useState(1);
  const [manualJobId, setManualJobId] = useState("");
  const manualJobs = useQuery({
    queryKey: ["jobs", "manual", debouncedManualSearch, manualPage],
    enabled: manual,
    queryFn: ({ signal }) =>
      api<{ items: Job[]; total: number }>(
        "/jobs?" +
          new URLSearchParams({
            purpose: "manual",
            page: String(manualPage),
            pageSize: "50",
            search: debouncedManualSearch,
          }),
        { signal },
      ),
  });
  const apps = w.applications.filter((a) => {
    const j = w.jobs.find((j) => j.id === a.jobId);
    return (
      j &&
      (filter === "all" || a.status === filter) &&
      (j.title + j.company).toLowerCase().includes(search.toLowerCase())
    );
  });
  const open = (app: Application) => {
    setSelected(app);
    setStatus(app.status);
    setNote(app.note);
    setConfirm(false);
  };
  const columns = [
    {
      name: "Para revisar",
      statuses: [
        "Aguardando aprovação",
        "Enviando",
        "Requer ação manual",
        "Falha no envio",
        "Resultado desconhecido",
      ],
      color: "var(--amber)",
    },
    {
      name: "Enviadas",
      statuses: ["Enviada", "Aguardando resposta"],
      color: "var(--blue)",
    },
    {
      name: "Em processo",
      statuses: ["Em entrevista", "Teste técnico"],
      color: "var(--accent)",
    },
    {
      name: "Resultados",
      statuses: ["Proposta recebida", "Contratada", "Rejeitada"],
      color: "var(--green)",
    },
  ];
  const job = selected
    ? w.jobs.find((j) => j.id === selected.jobId)
    : undefined;
  const current = selected
    ? w.applications.find((a) => a.id === selected.id)
    : undefined;
  return (
    <div>
      <PageHead
        eyebrow="CADA PASSO CONTA"
        title="Candidaturas"
        description="Organize os próximos passos e mantenha um histórico de cada oportunidade."
      >
        <Button onClick={() => setManual(true)}>
          <Plus size={15} />
          Registrar candidatura
        </Button>
        <Button className="primary" onClick={() => navigate("vagas")}>
          <BriefcaseBusiness size={15} />
          Explorar oportunidades
        </Button>
      </PageHead>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Buscar candidaturas"
            placeholder="Buscar por cargo ou empresa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os status</option>
          {[...new Set(w.applications.map((a) => a.status))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="count-caption">
        {apps.length} candidaturas ·{" "}
        {
          w.applications.filter((a) =>
            ["Aguardando aprovação", "Requer ação manual"].includes(a.status),
          ).length
        }{" "}
        para revisar
      </div>
      {apps.length ? (
        view === "kanban" ? (
          <div className="kanban">
            {columns.map((c) => (
              <div className="kanban-column" key={c.name}>
                <div className="kanban-heading">
                  <span
                    className="status-dot"
                    style={{ background: c.color }}
                  />
                  {c.name}
                  <span>
                    {apps.filter((a) => c.statuses.includes(a.status)).length}
                  </span>
                </div>
                {apps.filter((a) => c.statuses.includes(a.status)).length ? (
                  apps
                    .filter((a) => c.statuses.includes(a.status))
                    .map((app) => {
                      const j = w.jobs.find((j) => j.id === app.jobId)!;
                      return (
                        <button
                          className="kanban-card"
                          key={app.id}
                          onClick={() => open(app)}
                        >
                          <div>
                            <CompanyLogo name={j.company} />
                            <Score score={j.match.score} compact />
                          </div>
                          <strong>{j.title}</strong>
                          <p>
                            {j.company} · {j.modality}
                          </p>
                          <StatusBadge status={app.status} />
                          <small style={{ display: "block", marginTop: 14 }}>
                            {date(app.updatedAt)}
                          </small>
                        </button>
                      );
                    })
                ) : (
                  <div className="kanban-empty">
                    Nenhuma candidatura nesta etapa
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : view === "table" ? (
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Compatibilidade</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Modo</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const j = w.jobs.find((j) => j.id === app.jobId)!;
                  return (
                    <tr
                      key={app.id}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open(app);
                        }
                      }}
                      onClick={() => open(app)}
                    >
                      <td>
                        <div className="table-job">
                          <CompanyLogo name={j.company} />
                          <div>
                            <strong>{j.title}</strong>
                            <span>{j.company}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Score score={j.match.score} compact />
                      </td>
                      <td>
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="muted">{date(app.createdAt)}</td>
                      <td className="muted">
                        {app.mode === "demo"
                          ? "Exemplo"
                          : app.mode === "automatic"
                            ? "Automático"
                            : app.mode === "manual"
                              ? "Manual"
                              : "Assistido"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="job-grid">
            {apps.map((app) => {
              const j = w.jobs.find((j) => j.id === app.jobId)!;
              return (
                <div key={app.id}>
                  <JobCard job={j} onClick={() => open(app)} />
                  <div style={{ padding: "12px 0" }}>
                    <StatusBadge status={app.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="panel">
          <Empty
            title="Uma jornada para acompanhar"
            mascot="handing-resume"
            description="Prepare uma candidatura a partir de uma vaga ou registre uma candidatura feita fora da EmpreGatos."
            icon={<BriefcaseBusiness size={28} />}
            action={
              <Button onClick={() => navigate("vagas")}>Explorar vagas</Button>
            }
          />
        </div>
      )}
      <Modal
        title={job?.title || "Candidatura"}
        description={job ? `${job.company} · Histórico e próximos passos` : ""}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        wide
      >
        {current && job && (
          <>
            {current.status === "Contratada" && (
              <div className="hired-celebration">
                <Mascot className="hired-mascot" variant="employed" />
                <div>
                  <h3>Um novo capítulo na sua carreira!</h3>
                  <p>
                    Você registrou sua contratação. Parabéns por essa conquista.
                  </p>
                </div>
              </div>
            )}
            <div className="detail-top">
              <CompanyLogo name={job.company} />
              <div>
                <h3>{job.company}</h3>
                <p>
                  {job.modality} · {job.contract}
                </p>
              </div>
              <StatusBadge status={current.status} />
            </div>
            {demo && (
              <div className="notice-inline">
                Esta é uma candidatura de demonstração. Nenhum envio foi
                realizado.
              </div>
            )}
            {current.receipt && (
              <div className="info-inline">
                <CheckCircle2 size={16} />
                <span>Recibo da integração: {current.receipt}</span>
              </div>
            )}
            {!demo && current.resumeId && (
              <div className="integration-info">
                <h3>Conclua sua candidatura</h3>
                <p>
                  1. Revise a apresentação e baixe seu currículo. 2. Abra o
                  anúncio e envie no portal. 3. Confirme o envio nesta tela.
                </p>
                <Button
                  disabled={a.isPending}
                  onClick={() =>
                    a.mutate(
                      { path: `/applications/${current.id}/draft` },
                      {
                        onSuccess: () =>
                          toast(
                            "Apresentação preparada. Revise antes de enviar.",
                          ),
                      },
                    )
                  }
                >
                  <Sparkles size={14} />
                  Atualizar apresentação
                </Button>
                {current.draft && (
                  <Field label="Apresentação para copiar e enviar">
                    <textarea readOnly value={current.draft} rows={8} />
                  </Field>
                )}
                <a
                  className="button"
                  href={`/api/resumes/${current.resumeId}/download?demo=false`}
                >
                  <Download size={14} />
                  Baixar currículo desta candidatura
                </a>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (a.isPending) return;
                a.mutate(
                  {
                    path: `/applications/${current.id}`,
                    method: "PATCH",
                    body: { status, confirmation, note },
                  },
                  {
                    onSuccess: () => {
                      toast("Candidatura atualizada. Histórico preservado.");
                      setSelected(null);
                    },
                  },
                );
              }}
            >
              <div style={{ marginTop: 22 }}>
                <Field label="Próxima etapa">
                  <select
                    disabled={a.isPending}
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value as Status);
                      setConfirm(false);
                    }}
                  >
                    <option value={current.status}>{current.status}</option>
                    {transitions[current.status].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                {status === "Enviada" && current.status !== "Enviada" && (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={confirmation}
                      onChange={(e) => setConfirm(e.target.checked)}
                      required
                    />
                    Confirmo que concluí o envio no processo oficial da empresa.
                  </label>
                )}
                <Field label="Observações pessoais">
                  <textarea
                    disabled={a.isPending}
                    maxLength={5000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Próximos passos, contato do recrutador, lembretes…"
                  />
                </Field>
              </div>
              <div className="detail-actions">
                {job.url && (
                  <a
                    href={job.url}
                    className="button"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={14} />
                    Abrir processo oficial
                  </a>
                )}
                <Button className="primary" disabled={a.isPending}>
                  <Save size={15} />
                  Salvar atualização
                </Button>
              </div>
            </form>
            <h3 className="section-label">Histórico de eventos</h3>
            {[...current.history].reverse().map((h, i) => (
              <div className="history-row" key={i}>
                <Clock3 size={14} />
                <span>
                  {h.message}
                  <small>
                    {date(h.at, true)} · {h.actor}
                  </small>
                </span>
              </div>
            ))}
          </>
        )}
      </Modal>
      <Modal
        title="Registrar candidatura manual"
        description="Registre um envio que você já concluiu no site da empresa. Escolha uma vaga ou adicione a oportunidade."
        open={manual}
        onOpenChange={setManual}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (a.isPending) return;
            const f = new FormData(e.currentTarget);
            a.mutate(
              {
                path: "/applications/manual",
                body: {
                  jobId: f.get("jobId"),
                  confirmation: f.get("confirmation") === "on",
                  date: f.get("date"),
                  note: f.get("note") || "",
                },
              },
              {
                onSuccess: () => {
                  toast("Candidatura manual registrada.");
                  setManual(false);
                },
              },
            );
          }}
        >
          <Field label="Buscar oportunidade para registro">
            <input
              value={manualSearch}
              onChange={(event) => {
                setManualSearch(event.target.value);
                setManualPage(1);
                setManualJobId("");
              }}
            />
          </Field>
          {manualJobs.isError && (
            <div className="recoverable-error" role="alert">
              <p>{manualJobs.error.message}</p>
              <Button
                type="button"
                disabled={manualJobs.isFetching}
                onClick={() => manualJobs.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          <Field label="Oportunidade">
            <select
              name="jobId"
              required
              value={manualJobId}
              onChange={(event) => setManualJobId(event.target.value)}
              disabled={manualJobs.isPending || manualJobs.isError}
            >
              <option value="" disabled>
                Selecione uma vaga
              </option>
              {(manualJobs.data?.items || []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company} · {j.title}
                </option>
              ))}
            </select>
          </Field>
          {(manualJobs.data?.total || 0) > 50 && (
            <div className="pagination">
              <span>
                Página {manualPage} de {Math.ceil(manualJobs.data!.total / 50)}
              </span>
              <Button
                type="button"
                disabled={manualPage === 1}
                onClick={() => {
                  setManualPage(manualPage - 1);
                  setManualJobId("");
                }}
              >
                Anterior
              </Button>
              <Button
                type="button"
                disabled={manualPage * 50 >= manualJobs.data!.total}
                onClick={() => {
                  setManualPage(manualPage + 1);
                  setManualJobId("");
                }}
              >
                Próxima
              </Button>
            </div>
          )}
          <Field label="Data do envio">
            <input
              type="date"
              name="date"
              required
              max={new Date().toLocaleDateString("en-CA", {
                timeZone: "America/Sao_Paulo",
              })}
            />
          </Field>
          <Field label="Observações">
            <textarea name="note" maxLength={5000} />
          </Field>
          <label className="checkbox-field">
            <input type="checkbox" name="confirmation" required />
            Confirmo que enviei esta candidatura no processo oficial.
          </label>
          <div className="modal-footer">
            <Button
              type="button"
              onClick={() => {
                setManual(false);
                setImporting(true);
              }}
            >
              Adicionar uma vaga
            </Button>
            <Button
              className="primary"
              disabled={
                a.isPending ||
                !manualJobId ||
                manualJobs.isPending ||
                manualJobs.isError
              }
            >
              Registrar envio
            </Button>
          </div>
        </form>
      </Modal>
      {importing && (
        <Suspense fallback={<p role="status">Abrindo formulário...</p>}>
          <ImportModal
            open={importing}
            close={() => {
              setImporting(false);
              setManualSearch("");
              setManualPage(1);
              setManualJobId("");
              setManual(true);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
