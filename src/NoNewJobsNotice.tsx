import { SearchCheck } from "lucide-react";
import { Button } from "./components";
import { date, useApp } from "./lib";
import type { Workspace } from "../shared/types";

type Run = Workspace["runs"][number];

/** A busca rodou, mas não achou vagas novas compatíveis: não é uma falha. */
export function isNoNewJobsRun(run?: Run) {
  // Sem fontes consultadas (orçamento do dia atingido, saldo já usado) não é "busca sem vagas".
  return !!run && run.discovered === 0 && ["completed", "partial"].includes(run.status) &&
    !!run.sourceProductivity?.length;
}

const periodLabel = (days: number) =>
  days <= 1 ? "nas últimas 24 horas" : days >= 365 ? "em qualquer data" : `nos últimos ${days} dias`;

function reasonLabel(reason: string) {
  if (reason === "objective_preferences") return "Fora dos seus filtros (cargo, modalidade, salário ou local)";
  if (reason === "existing_or_uncertain_application") return "Você já se candidatou";
  if (reason === "excluded_by_user") return "Descartadas por você";
  return reason.replace(/\.$/, "");
}

/** Resumo de uma busca sem vagas novas: anúncios analisados, motivos principais e texto. */
export function noNewJobsSummary(run: Run, ageDays: number) {
  const examined = (run.sourceProductivity || []).reduce((sum, p) => sum + (p.examined || 0), 0);
  const reasons: Record<string, number> = {};
  for (const p of run.sourceProductivity || [])
    for (const [reason, n] of Object.entries(p.excluded || {})) reasons[reason] = (reasons[reason] || 0) + n;
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([reason, n]) => ({ label: reasonLabel(reason), n }));
  const text = (examined
    ? `Analisamos ${examined} anúncio${examined > 1 ? "s" : ""} publicado${examined > 1 ? "s" : ""} ${periodLabel(ageDays)}, mas nenhum combinava com seu perfil e filtros.`
    : `Não apareceram anúncios novos ${periodLabel(ageDays)} para os seus cargos.`) +
    " Isso não é um erro: a busca funcionou normalmente.";
  return { examined, top, text };
}

export function NoNewJobsNotice({ run, compact = false }: { run: Run; compact?: boolean }) {
  const { w, navigate } = useApp();
  const { top, text } = noNewJobsSummary(run, w.filters.ageDays);
  return (
    <div className={"no-jobs-notice" + (compact ? " compact" : "")} role="status">
      <span className="no-jobs-icon"><SearchCheck size={18} /></span>
      <div>
        <strong>Nenhuma vaga nova desta vez</strong>
        <p>{text}</p>
        {!!top.length && (
          <ul>
            {top.map(({ label, n }) => (
              <li key={label}><b>{n}</b> {label}</li>
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
