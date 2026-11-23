import { SearchCheck } from "lucide-react";
import { Button } from "./components";
import { date, useApp } from "./lib";
import type { Workspace } from "../shared/types";

type Run = Workspace["runs"][number];

/** A busca rodou, mas não achou vagas novas compatíveis: não é uma falha. */
export function isNoNewJobsRun(run?: Run) {
  return !!run && run.discovered === 0 && ["completed", "partial"].includes(run.status);
}

const periodLabel = (days: number) =>
  days <= 1 ? "nas últimas 24 horas" : days >= 365 ? "em qualquer data" : `nos últimos ${days} dias`;

function reasonLabel(reason: string) {
  if (reason === "objective_preferences") return "Fora dos seus filtros (cargo, modalidade, salário ou local)";
  if (reason === "existing_or_uncertain_application") return "Você já se candidatou";
  if (reason === "excluded_by_user") return "Descartadas por você";
  return reason.replace(/\.$/, "");
}

export function NoNewJobsNotice({ run, compact = false }: { run: Run; compact?: boolean }) {
  const { w, navigate } = useApp();
  const examined = (run.sourceProductivity || []).reduce((sum, p) => sum + (p.examined || 0), 0);
  const reasons: Record<string, number> = {};
  for (const p of run.sourceProductivity || [])
    for (const [reason, n] of Object.entries(p.excluded || {})) reasons[reason] = (reasons[reason] || 0) + n;
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className={"no-jobs-notice" + (compact ? " compact" : "")} role="status">
      <span className="no-jobs-icon"><SearchCheck size={18} /></span>
      <div>
        <strong>Nenhuma vaga nova desta vez</strong>
        <p>
          {examined
            ? `Analisamos ${examined} anúncio${examined > 1 ? "s" : ""} publicado${examined > 1 ? "s" : ""} ${periodLabel(w.filters.ageDays)}, mas nenhum combinava com seu perfil e filtros.`
            : `Não apareceram anúncios novos ${periodLabel(w.filters.ageDays)} para os seus cargos.`}{" "}
          Isso não é um erro: a busca funcionou normalmente.
        </p>
        {!!top.length && (
          <ul>
            {top.map(([reason, n]) => (
              <li key={reason}><b>{n}</b> {reasonLabel(reason)}</li>
            ))}
          </ul>
        )}
        {!compact && (
          <div className="no-jobs-actions">
            {w.routine.enabled && w.routine.nextRun && (
              <small>Próxima busca: {date(w.routine.nextRun, true)}</small>
            )}
            <Button onClick={() => navigate("perfil-inteligente")}>Ampliar período ou filtros</Button>
          </div>
        )}
      </div>
    </div>
  );
}
