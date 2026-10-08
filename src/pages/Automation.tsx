import { useState } from "react";
import {
  Search,
  CheckCircle2,
  Zap,
  Play,
  Pause,
  Clock3,
  SlidersHorizontal,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import { Badge, Button, Empty, Field, PageHead, Panel } from "../components";
import { date, useAction, useApp } from "../lib";
export default function Automation() {
  const { w, demo, navigate, toast } = useApp();
  const a = useAction();
  const [r, setR] = useState({ ...w.routine });
  const save = (enabled = r.enabled) =>
    a.mutate(
      { path: "/routine", method: "PUT", body: { ...r, enabled } },
      {
        onSuccess: () => {
          setR((old) => ({ ...old, enabled }));
          toast(
            enabled
              ? "Rotina ativada. A próxima execução foi agendada."
              : "Rotina salva e pausada.",
          );
        },
      },
    );
  return (
    <div>
      <PageHead
        eyebrow="CONSISTÊNCIA, NO SEU RITMO"
        title="Central de automação"
        description="Agende a descoberta de vagas e escolha como cada candidatura avança."
      >
        <Button
          disabled={demo || a.isPending}
          onClick={() =>
            a.mutate(
              { path: "/discover" },
              { onSuccess: (result) => toast(result.message) },
            )
          }
        >
          <Search size={15} />
          {a.isPending ? "Executando…" : "Buscar agora"}
        </Button>
      </PageHead>
      <div className="routine-state">
        <div>
          <strong>
            <span
              className={`live-dot ${w.routine.enabled ? "on" : ""}`}
              style={{ display: "inline-block", marginRight: 9 }}
            />
            {w.routine.enabled
              ? "Sua rotina está ativa"
              : "Sua rotina está pausada"}
          </strong>
          <p>
            {w.routine.enabled
              ? `Próxima execução: ${date(w.routine.nextRun, true)} · Horário de Brasília`
              : "Você pode configurar tudo antes de ativar."}
          </p>
        </div>
        <Button
          className={w.routine.enabled ? "" : "primary"}
          disabled={a.isPending || demo}
          onClick={() => save(!w.routine.enabled)}
        >
          {w.routine.enabled ? <Pause size={14} /> : <Play size={14} />}{" "}
          {w.routine.enabled ? "Pausar automação" : "Ativar rotina"}
        </Button>
      </div>
      <div className="settings-grid">
        <div className="stack">
          <Panel
            title="Você escolhe o nível de autonomia"
            detail="A descoberta e o envio são etapas distintas."
          >
            <div className="routine-options">
              {[
                {
                  id: "discovery",
                  title: "Só descobrir",
                  desc: "Encontra e classifica vagas. Você decide o próximo passo.",
                  icon: Search,
                },
                {
                  id: "approval",
                  title: "Com minha aprovação",
                  desc: "Prepara uma fila para você revisar e finalizar.",
                  icon: ListChecks,
                },
                {
                  id: "automatic",
                  title: "Envio automático",
                  desc: "Apenas fontes autorizadas e candidaturas elegíveis.",
                  icon: Zap,
                },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`routine-option ${r.mode === m.id ? "active" : ""}`}
                  disabled={m.id === "automatic" && !w.infrastructure.automatic}
                  onClick={() =>
                    setR((old) => ({ ...old, mode: m.id as typeof r.mode }))
                  }
                >
                  <m.icon size={20} />
                  <strong>{m.title}</strong>
                  <p>{m.desc}</p>
                </button>
              ))}
            </div>
            {!w.infrastructure.automatic && (
              <div className="info-inline" style={{ margin: "0 22px 22px" }}>
                <ShieldCheck size={17} />O envio automático fica disponível
                quando um adapter autorizado é configurado no servidor. Fontes
                públicas seguem o fluxo assistido.
              </div>
            )}
            <form
              className="form-card"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="form-grid">
                <Field label="Horário diário (Brasília)">
                  <input
                    type="time"
                    required
                    value={r.time}
                    onChange={(e) =>
                      setR((old) => ({ ...old, time: e.target.value }))
                    }
                  />
                </Field>
                <Field
                  label="Limite diário de candidaturas"
                  help="Sugestão inicial: 5 a 15 candidaturas qualificadas."
                >
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={r.dailyLimit}
                    onChange={(e) =>
                      setR((old) => ({
                        ...old,
                        dailyLimit: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <Field
                  label={`Compatibilidade mínima para preparar: ${r.minScore}/100`}
                >
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={r.minScore}
                    onChange={(e) =>
                      setR((old) => ({
                        ...old,
                        minScore: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="form-actions">
                <Button disabled={a.isPending} className="primary">
                  <SlidersHorizontal size={14} />
                  Salvar rotina
                </Button>
              </div>
            </form>
          </Panel>
          <Panel
            title="Histórico de execuções"
            detail="Resultados persistidos de cada busca."
          >
            {w.runs.length ? (
              w.runs.map((run) => (
                <div className="run-row" key={run.id}>
                  <div>
                    <strong>{date(run.at, true)}</strong>
                    <Badge
                      tone={
                        run.status === "completed"
                          ? "green"
                          : run.status === "failed"
                            ? "red"
                            : "amber"
                      }
                    >
                      {(
                        {
                          completed: "Concluída",
                          partial: "Parcial",
                          failed: "Falhou",
                          running: "Em execução",
                          interrupted: "Interrompida",
                        } as any
                      )[run.status] || run.status}
                    </Badge>
                  </div>
                  <p>{run.message}</p>
                  <small>
                    {run.discovered} novas vagas · {run.processed} candidaturas
                    preparadas
                  </small>
                  {run.errors.map((e) => (
                    <p className="negative" key={e}>
                      {e}
                    </p>
                  ))}
                </div>
              ))
            ) : (
              <Empty
                title="Pronta para a primeira execução"
                description="Conecte uma fonte e execute uma busca. Os resultados de cada execução aparecerão aqui."
                icon={<Clock3 size={27} />}
              />
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Próximas ações">
            <div className="integration-info">
              <ul>
                <li>
                  <span>Última busca</span>
                  <span>{date(w.routine.lastRun, true)}</span>
                </li>
                <li>
                  <span>Próxima busca</span>
                  <span>
                    {w.routine.enabled
                      ? date(w.routine.nextRun, true)
                      : "Pausada"}
                  </span>
                </li>
                <li>
                  <span>Fontes ativas</span>
                  <span>
                    {w.sources.filter((s) => s.enabled && s.discovery).length}
                  </span>
                </li>
                <li>
                  <span>Modo atual</span>
                  <span>
                    {
                      {
                        approval: "Aprovação",
                        discovery: "Descoberta",
                        automatic: "Automático",
                      }[w.routine.mode]
                    }
                  </span>
                </li>
              </ul>
              <Button
                className="full"
                style={{ marginTop: 20 }}
                onClick={() => navigate("configuracoes")}
              >
                Gerenciar fontes
              </Button>
            </div>
          </Panel>
          <Panel title="Execução no servidor">
            <div className="integration-info">
              <p>
                <CheckCircle2
                  size={15}
                  style={{
                    display: "inline",
                    color: "var(--green)",
                    marginRight: 7,
                  }}
                />
                A rotina continua com o navegador fechado enquanto o servidor
                estiver rodando.
              </p>
              <p>Fila: {w.infrastructure.queue}.</p>
              <p>
                {w.infrastructure.worker
                  ? "Processo de execução disponível."
                  : "Worker ainda não está ativo. Inicie o processo para executar as rotinas."}
              </p>
              <p>
                Cada etapa aguarda a anterior concluir. Resultados de envio
                desconhecidos precisam de verificação e não são repetidos
                automaticamente.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
