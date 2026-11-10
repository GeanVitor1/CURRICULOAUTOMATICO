import type { Resume } from "../shared/types";
import "./onboarding-flow.css";

const sectionValue = { identified: 90, needs_detail: 50, not_found: 0 } as const;

export function resumeScore(resume: Resume) {
  const review = resume.review;
  if (!review?.sections.length) return null;
  const parts = review.sections.map((s) => ({
    label: s.label,
    value: sectionValue[s.status],
  }));
  const mean = parts.reduce((t, p) => t + p.value, 0) / parts.length;
  const high = review.improvements.filter((i) => i.priority === "high").length;
  const total = Math.round(Math.max(5, Math.min(98, mean - high * 6)));
  return { total, parts };
}

const tone = (v: number) => (v >= 80 ? "good" : v >= 40 ? "mid" : "low");

export default function ResumeScore({ resume }: { resume: Resume }) {
  const score = resumeScore(resume);
  if (!score)
    return (
      <div className="flow-card score-card">
        <p className="flow-muted">
          Estamos analisando seu currículo. A nota aparece aqui em instantes.
        </p>
      </div>
    );
  const r = 52;
  const c = 2 * Math.PI * r;
  const label =
    score.total >= 80 ? "Muito bom" : score.total >= 60 ? "Na média" : "Abaixo da média";
  return (
    <div className="flow-card score-card">
      <div className={"score-ring " + tone(score.total)}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} className="track" />
          <circle
            cx="60"
            cy="60"
            r={r}
            className="value"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - score.total / 100)}
          />
        </svg>
        <div>
          <strong>{score.total}</strong>
          <small>/100</small>
        </div>
      </div>
      <p className="score-label">
        Sua pontuação: <b className={tone(score.total)}>{label}</b>
      </p>
      <p className="flow-muted">
        Currículos abaixo de 80 costumam ser descartados pelos filtros
        automáticos (ATS) das empresas.
      </p>
      <ul className="score-bars">
        {score.parts.map((p) => (
          <li key={p.label}>
            <span>{p.label}</span>
            <b className={tone(p.value)}>{p.value}%</b>
            <i>
              <em className={tone(p.value)} style={{ width: p.value + "%" }} />
            </i>
          </li>
        ))}
      </ul>
    </div>
  );
}
