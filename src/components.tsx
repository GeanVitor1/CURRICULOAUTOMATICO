import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import * as RDialog from "@radix-ui/react-dialog";
import {
  X,
  Radar,
  Check,
  MapPin,
  Building2,
  Bookmark,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  BriefcaseBusiness,
  Clock3,
  Pause,
  Play,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useAction, useApp, salary, date } from "./lib";
import type { Job } from "../shared/types";
import { animatedThinking, mascots, type MascotVariant } from "./mascots";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? "small" : ""}`}>
      <img
        src="/mascot-original.jpeg"
        width={small ? 16 : 32}
        height={small ? 16 : 32}
        alt=""
        aria-hidden="true"
      />
    </span>
  );
}
export function Mascot({
  className = "",
  eager = false,
  variant = "welcome",
  animated = false,
  decorative = false,
}: {
  className?: string;
  eager?: boolean;
  variant?: MascotVariant;
  animated?: boolean;
  decorative?: boolean;
}) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const canAnimate = animated && reduced === false;
  const playing = canAnimate && !paused;
  const asset = playing ? animatedThinking : mascots[variant];
  const size = playing ? animatedThinking.size : 1254;
  const illustration = (
    <img
      className={canAnimate ? "mascot-image" : `mascot ${className}`}
      data-mascot={variant}
      src={asset.src}
      alt={decorative ? "" : asset.alt}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
    />
  );
  if (!canAnimate) return illustration;
  return (
    <span className={`mascot-animation ${className}`}>
      {illustration}
      <button
        type="button"
        className="mascot-motion-toggle"
        aria-label={
          paused
            ? "Reproduzir animação do mascote"
            : "Pausar animação do mascote"
        }
        title={paused ? "Reproduzir animação" : "Pausar animação"}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </span>
  );
}
export function DiscoveryStatus() {
  const { w, navigate } = useApp();
  const run = w.runs[0];
  if (!run) return null;
  const working = ["queued", "running"].includes(run.status);
  return (
    <motion.div
      layout
      className={`discovery-status ${run.status}`}
      role="status"
    >
      <Mascot
        className="discovery-mascot"
        variant={
          working
            ? "thinking"
            : run.status === "failed"
              ? "surprised"
              : run.status === "partial"
                ? "considering"
                : "idea"
        }
        animated={working}
        eager
      />
      <div>
        <strong>
          {run.status === "queued"
            ? "Sua busca está na fila"
            : run.status === "running"
              ? "Estamos consultando suas fontes"
              : run.status === "failed"
                ? "A busca precisa de atenção"
                : run.status === "partial"
                  ? "Busca concluída com uma fonte pendente"
                  : "Busca concluída"}
        </strong>
        <p>{run.message}</p>
        {run.errors.length > 0 && <p>{run.errors.join(" · ")}</p>}
      </div>
      {run.errors.length > 0 && (
        <Button onClick={() => navigate("configuracoes")}>
          Conferir fontes
        </Button>
      )}
    </motion.div>
  );
}
export function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  const tone = /entrevista|Proposta|Contratada/.test(status)
    ? "green"
    : /Enviada|resposta/.test(status)
      ? "blue"
      : /Rejeitada|Falha/.test(status)
        ? "red"
        : "amber";
  return (
    <Badge tone={tone}>
      <span className="status-dot" />
      {status}
    </Badge>
  );
}
export function Score({
  score,
  compact = false,
  confidence,
}: {
  score: number;
  compact?: boolean;
  confidence?: "sufficient" | "insufficient";
}) {
  if (confidence === "insufficient")
    return <span className="score insufficient">Dados insuficientes</span>;
  return (
    <div
      className={`score ${score >= 80 ? "high" : score >= 60 ? "medium" : "low"} ${compact ? "compact" : ""}`}
    >
      <span>
        {score}
        <small>/100</small>
      </span>
      {!compact && (
        <>
          <div className="score-track">
            <i style={{ width: `${score}%` }} />
          </div>
          <span className="score-label">compatibilidade</span>
        </>
      )}
    </div>
  );
}
export function CompanyLogo({ name }: { name: string }) {
  const styles: Record<string, string> = {
    Nubank: "nu",
    iFood: "ifood",
    "Conta Azul": "ca",
    Totvs: "totvs",
    Stone: "stone",
    QuintoAndar: "qa",
    "CI&T": "cit",
    "RD Station": "rd",
  };
  const text: Record<string, string> = {
    Nubank: "nu",
    iFood: "if",
    "Conta Azul": "ca",
    Totvs: "T",
    Stone: "S",
    QuintoAndar: "5A",
    "CI&T": "CI",
    "RD Station": "RD",
  };
  return (
    <span className={`company-logo ${styles[name] || ""}`} aria-hidden="true">
      {text[name] || name.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
  mascot = "thinking",
  animated = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  mascot?: MascotVariant;
  animated?: boolean;
}) {
  return (
    <div className="empty">
      <Mascot
        className="empty-mascot"
        variant={mascot}
        animated={animated}
        eager={animated}
      />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="head-actions">{children}</div>
    </div>
  );
}
export function Panel({
  title,
  detail,
  action,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <span id={id}>{label}</span>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(child as ReactElement<any>, {
              "aria-labelledby": id,
              ...(help ? { "aria-describedby": `${id}-help` } : {}),
            })
          : child,
      )}
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}
export function Modal({
  title,
  description,
  open,
  onOpenChange,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="modal-overlay" />
        <RDialog.Content className={`modal ${wide ? "wide" : ""}`}>
          <div className="modal-heading">
            <div>
              <RDialog.Title>{title}</RDialog.Title>
              <RDialog.Description>
                {description || "Revise as informações abaixo."}
              </RDialog.Description>
            </div>
            <RDialog.Close className="icon-button" aria-label="Fechar">
              <X size={19} />
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
export function JobRow({ job, onClick }: { job: Job; onClick: () => void }) {
  return (
    <button className="job-row" onClick={onClick}>
      <CompanyLogo name={job.company} />
      <div className="job-row-main">
        <strong>{job.title}</strong>
        <span>
          {job.company}
          <span className="sep">·</span>
          {job.modality}
          <span className="sep">·</span>
          {job.contract}
        </span>
        <div className="skill-tags">
          {job.skills.slice(0, 4).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
      <Score score={job.match.score} confidence={job.match.confidence} />
    </button>
  );
}
export function JobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const a = useAction();
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`job-card ${job.match.score >= 80 && job.match.confidence !== "insufficient" ? "high-match" : ""}`}
    >
      <div className="job-card-top">
        <CompanyLogo name={job.company} />
        <div>
          <strong>{job.company}</strong>
          <span>{job.source}</span>
        </div>
        <button
          className={`icon-button ${job.saved ? "selected" : ""}`}
          aria-label={
            job.saved
              ? `Remover ${job.title} dos salvos`
              : `Salvar ${job.title}`
          }
          onClick={() =>
            a.mutate({
              path: `/jobs/${job.id}`,
              method: "PATCH",
              body: { saved: !job.saved },
            })
          }
        >
          <Bookmark size={18} fill={job.saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="job-card-title" onClick={onClick}>
        {job.title}
      </button>
      <div className="job-meta">
        <span>
          <MapPin size={13} />
          {job.location}
        </span>
        <span>
          <BriefcaseBusiness size={13} />
          {job.modality} · {job.contract}
        </span>
      </div>
      <div className="skill-tags">
        {job.skills.slice(0, 4).map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div className="job-card-footer">
        <Score
          score={job.match.score}
          confidence={job.match.confidence}
          compact
        />
        <span>{salary(job)}</span>
      </div>
      <div className="job-card-context">
        <span>
          {job.publishedAt
            ? `Publicada ${date(job.publishedAt)}`
            : "Publicação não informada"}
        </span>
        <span>
          {job.application?.status || (job.saved ? "Salva" : "Descoberta")}
        </span>
      </div>
      <Button className="job-card-action" onClick={onClick}>
        Ver oportunidade <ExternalLink size={13} />
      </Button>
      {job.match.blockers.length > 0 && (
        <div className="attention">
          <AlertCircle size={13} />
          Requisitos para revisar
        </div>
      )}
    </motion.article>
  );
}
export function JobDetail({
  job,
  close,
}: {
  job: Job | null;
  close: () => void;
}) {
  const { w, demo, toast } = useApp();
  const a = useAction();
  const [resumeId, setResumeId] = useState("");
  const application = job
    ? w.applications.find((a) => a.jobId === job.id)
    : undefined;
  return (
    <Modal
      title={job?.title || "Detalhes da vaga"}
      description={job ? `${job.company} · ${job.source}` : ""}
      open={!!job}
      onOpenChange={(v) => !v && close()}
      wide
    >
      {job && (
        <>
          <div className="detail-top">
            <CompanyLogo name={job.company} />
            <div>
              <h3>{job.company}</h3>
              <p>
                {job.location} · {job.modality} · {job.contract}
              </p>
              <p>{salary(job)}</p>
            </div>
            <Score score={job.match.score} confidence={job.match.confidence} />
          </div>
          {demo && (
            <div className="notice-inline">
              Oportunidade fictícia. Nenhum dado será enviado.
            </div>
          )}
          {!application && w.resumes.some((r) => r.approved) && (
            <div style={{ marginTop: 18 }}>
              <Field label="Currículo para esta candidatura">
                <select
                  value={resumeId}
                  onChange={(e) => setResumeId(e.target.value)}
                >
                  <option value="">Versão mais recente aprovada</option>
                  {w.resumes
                    .filter((r) => r.approved)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          )}
          <div className="detail-actions">
            <Button
              className="primary"
              disabled={
                a.isPending ||
                !!application ||
                job.availability === "closed" ||
                job.match.blockers.length > 0
              }
              onClick={() =>
                a.mutate(
                  {
                    path: "/applications",
                    body: { jobId: job.id, resumeId: resumeId || undefined },
                  },
                  {
                    onSuccess: () =>
                      toast(
                        "Candidatura preparada. Finalize o envio no processo oficial.",
                      ),
                  },
                )
              }
            >
              <BriefcaseBusiness size={15} />
              {application ? application.status : "Preparar candidatura"}
            </Button>
            {job.url && /^https?:\/\//.test(job.url) && (
              <a
                className="button"
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                Abrir vaga original
              </a>
            )}
            <Button
              onClick={() =>
                a.mutate({
                  path: `/jobs/${job.id}`,
                  method: "PATCH",
                  body: { saved: !job.saved },
                })
              }
            >
              <Bookmark size={14} />
              {job.saved ? "Salva" : "Salvar"}
            </Button>
          </div>
          <div className="analysis-box">
            {job.availability === "closed" && (
              <p className="negative">
                <AlertCircle size={15} />
                Esta vaga não apareceu na última consulta completa da fonte.
                Confira a disponibilidade no site oficial.
              </p>
            )}
            <h3>
              <Sparkles size={17} />
              Por que esta vaga combina com você?
            </h3>
            <p>{job.match.explanation}</p>
            {w.intelligence?.enabled && (
              <Button
                disabled={a.isPending}
                onClick={() =>
                  a.mutate(
                    { path: `/jobs/${job.id}/analyze` },
                    {
                      onSuccess: (result) => {
                        Object.assign(job.match, result.match);
                        toast(
                          "Análise atualizada. Veja a explicação e confira os requisitos.",
                        );
                      },
                    },
                  )
                }
              >
                <Sparkles size={15} />
                {a.isPending
                  ? "Analisando requisitos…"
                  : "Analisar com o provedor configurado"}
              </Button>
            )}
            {job.geographicEligibility && (
              <p className="notice-inline">
                Elegibilidade geográfica: {job.geographicEligibility}
              </p>
            )}
            <div className="analysis-columns">
              <div>
                {job.match.strengths.map((s) => (
                  <p key={s} className="positive">
                    <CheckCircle2 size={15} />
                    {s}
                  </p>
                ))}
              </div>
              <div>
                {job.match.gaps.map((s) => (
                  <p key={s} className="muted">
                    <AlertCircle size={15} />
                    {s}
                  </p>
                ))}
              </div>
            </div>
            {job.match.blockers.map((s) => (
              <p className="negative" key={s}>
                <AlertCircle size={15} />
                {s}
              </p>
            ))}
          </div>
          <h3 className="section-label">Descrição da oportunidade</h3>
          <p className="description-text">{job.description}</p>
          <div className="detail-info">
            <span>
              <Building2 size={14} />
              {job.level}
            </span>
            <span>
              <Clock3 size={14} />
              {job.publishedAt
                ? `Publicada em ${date(job.publishedAt)}`
                : `Descoberta em ${date(job.discoveredAt)} · publicação não informada`}
            </span>
          </div>
          {application && (
            <>
              <h3 className="section-label">Histórico da candidatura</h3>
              {application.history.map((e, i) => (
                <div className="history-row" key={i}>
                  <Check size={14} />
                  <span>
                    {e.message}
                    <small>
                      {date(e.at, true)} · {e.actor}
                    </small>
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="modal-footer">
            <Button
              className="danger-ghost"
              disabled={a.isPending}
              onClick={() =>
                a.mutate(
                  {
                    path: `/jobs/${job.id}`,
                    method: "PATCH",
                    body: { discarded: true },
                  },
                  { onSuccess: close },
                )
              }
            >
              Descartar vaga
            </Button>
            <Button
              className="danger-ghost"
              onClick={() =>
                a.mutate(
                  {
                    path: `/jobs/${job.id}`,
                    method: "PATCH",
                    body: { blockCompany: true },
                  },
                  {
                    onSuccess: () =>
                      toast("Empresa bloqueada nas preferências."),
                  },
                )
              }
            >
              Bloquear empresa
            </Button>
            <span className="muted">
              Pontuação de aderência, não de contratação.
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}
