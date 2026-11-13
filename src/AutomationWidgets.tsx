import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Circle, Clock, Info, MessageCircleQuestion, Search, Send, ShieldAlert, UserCheck, XCircle } from "lucide-react";
import { CountUp } from "./motion";
import type { Workspace } from "../shared/types";

type Progress = NonNullable<Workspace["routine"]["progress"]>;

/** Plural pt-BR simples para rótulos curtos. */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Usa as contagens estruturadas do servidor; a regex sobre a frase é só fallback (progresso legado). */
function parseReasons(progress: Progress) {
  if (progress.blockers) return progress.blockers;
  const message = progress.message || "";
  const num = (re: RegExp) => Number(message.match(re)?.[1] || 0);
  return {
    nonReceived: num(/(\d+) tentativas?(?:\(s\))? confirmada/),
    uncertain: num(/(\d+) tentativas?(?:\(s\))? com resultado desconhecido/),
    human: num(/(\d+) candidaturas?(?:\(s\))? bloqueada/),
    questions: num(/(\d+) candidaturas?(?:\(s\))? com perguntas/),
  };
}

/** Converte "(s)" do texto do servidor em plural correto. */
export function fixPlurals(text: string) {
  return text
    .replace(/\b1 tentativa\(s\) confirmada\(s\) pelo empregador como não recebida\(s\)/g, "1 tentativa confirmada pelo empregador como não recebida")
    .replace(/\b1 ([^\s(]+)\(s\)/g, "1 $1")
    .replace(/([a-zà-ú])\(is\)/gi, "$1is")
    .replace(/\(s\)/g, "s");
}

export function DailyProgress({ progress, onQuestions }: { progress: Progress; onQuestions: () => void }) {
  const r = parseReasons(progress);
  const pct = progress.target ? Math.min(100, Math.round((progress.sent / progress.target) * 100)) : 0;
  const chips: { key: string; n: number; label: string; icon: ReactNode; tone?: string; onClick?: () => void; hint: string }[] = [
    { key: "rem", n: progress.remaining, label: plural(progress.remaining, "restante", "restantes"), icon: <Send size={16} />, hint: "Envios ainda disponíveis hoje no seu plano." },
    { key: "q", n: r.questions, label: plural(r.questions, "aguarda você", "aguardam você"), icon: <MessageCircleQuestion size={16} />, tone: "warn", onClick: onQuestions, hint: "Perguntas ou consentimentos que só você pode responder." },
    { key: "h", n: r.human, label: "com captcha", icon: <ShieldAlert size={16} />, tone: "muted", hint: "Formulários que exigem verificação humana." },
    { key: "u", n: r.uncertain, label: "sem confirmação", icon: <Clock size={16} />, tone: "muted", hint: "Resultado desconhecido, sem recibo. Não serão repetidas automaticamente." },
    { key: "n", n: r.nonReceived, label: plural(r.nonReceived, "não recebida", "não recebidas"), icon: <XCircle size={16} />, tone: "muted", hint: "O empregador informou que não recebeu. Nova tentativa exige revalidação." },
  ].filter((c) => c.n > 0);
  const extra = (progress.usedToday || 0) > progress.sent;
  return (
    <section className="interview-card daily-progress" aria-label="Candidaturas automáticas de hoje" role="status">
      <div className="daily-progress-head">
        <h2>
          <span className="daily-progress-count"><CountUp value={progress.sent} />/{progress.target}</span>
          <span>{plural(progress.sent, "candidatura confirmada hoje", "candidaturas confirmadas hoje")}</span>
        </h2>
      </div>
      <div className="daily-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={progress.sent} aria-label="Progresso do dia">
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      {chips.length > 0 && (
        <ul className="stat-chips">
          {chips.map((c, i) => {
            const body = (
              <>
                <span className="stat-chip-icon" aria-hidden="true">{c.icon}</span>
                <strong><CountUp value={c.n} /></strong>
                <span>{c.label}</span>
              </>
            );
            return (
              <li key={c.key} className={`stat-chip ${c.tone || ""}`} style={{ animationDelay: `${120 + i * 70}ms` }} title={c.hint}>
                {c.onClick ? <button type="button" onClick={c.onClick}>{body}</button> : <div>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {(progress.message || extra) && (
        <details className="daily-progress-details">
          <summary>Ver detalhes <ChevronDown size={14} aria-hidden="true" /></summary>
          {progress.message && <p>{fixPlurals(progress.message)}</p>}
          {extra && <p>A cota usada também inclui outras tentativas ou envios fora deste contador automático.</p>}
          <p>O plano permite até {progress.target} envios por dia.</p>
        </details>
      )}
    </section>
  );
}

const DEFAULT_STEPS = ["Buscamos vagas compatíveis", "Preparamos a candidatura", "Você confere e envia"];
const STEP_ICONS = [Search, Send, UserCheck];

/** Explicação recolhível: 3 passos com ícones + texto completo sob demanda. */
export function AutomationHowItWorks({ title, steps = DEFAULT_STEPS, children }: { title: string; steps?: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="how-it-works">
      <ol className="how-steps" aria-label={title}>
        {steps.map((s, i) => {
          const Icon = STEP_ICONS[i] || Search;
          return (
            <li key={s} style={{ animationDelay: `${i * 90}ms` }}>
              <span aria-hidden="true"><Icon size={16} /></span>
              {s}
            </li>
          );
        })}
      </ol>
      <button type="button" className="how-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Como funciona <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <div className="how-body">{children}</div>}
    </div>
  );
}

/** Dica curta recolhível: uma linha visível, detalhes sob demanda. */
export function InfoTip({ summary = "Ver detalhes", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="info-tip">
      <summary><Info size={14} aria-hidden="true" />{summary}</summary>
      <div className="info-tip-body">{children}</div>
    </details>
  );
}

export type Step = { icon: ReactNode; title: string; text?: ReactNode; done?: boolean };

/** Passos numerados com ícone + título + 1 linha e estado visual. */
export function StepList({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="step-list" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.title} className={s.done ? "is-done" : ""} style={{ animationDelay: `${i * 80}ms` }}>
          <span className="step-list-icon" aria-hidden="true">{s.done ? <CheckCircle2 size={18} /> : s.icon}</span>
          <div>
            <strong><span className="step-list-n">{i + 1}.</span> {s.title}</strong>
            {s.text && <p>{s.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Indicador conectado/pendente. */
export function StatusPill({ ok, okLabel = "Conectado", pendingLabel = "Pendente" }: { ok: boolean; okLabel?: string; pendingLabel?: string }) {
  return (
    <span className={`status-pill ${ok ? "is-ok" : "is-pending"}`} role="status">
      {ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
      {ok ? okLabel : pendingLabel}
    </span>
  );
}
