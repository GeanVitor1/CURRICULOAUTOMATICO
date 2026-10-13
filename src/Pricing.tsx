import { Check } from "lucide-react";
import { plans, type PlanId } from "../shared/plans";
import "./pricing.css";

export function rememberPlan(plan: PlanId) {
  try {
    if (plan === "free") sessionStorage.removeItem("empregatos:selected-plan");
    else sessionStorage.setItem("empregatos:selected-plan", plan);
  } catch {
    /* Storage is optional. */
  }
}
export function selectedPlan() {
  try {
    const value = sessionStorage.getItem("empregatos:selected-plan");
    return value === "plus" || value === "pro" ? value : null;
  } catch {
    return null;
  }
}
export default function Pricing({
  current,
  disabled,
  onChoose,
}: {
  current?: PlanId;
  disabled?: boolean;
  onChoose?: (plan: PlanId) => void;
}) {
  return (
    <div className="pricing-grid">
      {plans.map((plan) => (
        <article
          key={plan.id}
          className={`pricing-card ${plan.id === "plus" ? "pricing-featured" : ""}`}
          aria-label={`Plano ${plan.name}`}
        >
          <div className="pricing-card-top">
            <h3>{plan.name}</h3>
            {plan.id === "plus" && <span>Mais candidaturas</span>}
          </div>
          <p className="pricing-price">
            <strong>{plan.price === 0 ? "Grátis" : `R$ ${plan.price}`}</strong>
            {plan.price > 0 && <span>/mês</span>}
          </p>
          <p className="pricing-allowance">
            Até <strong>{plan.dailyLimit}</strong> candidaturas automáticas por
            dia
          </p>
          <ul>
            <li>
              <Check size={16} aria-hidden="true" />
              Busca de vagas reais
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Criação e envio do currículo aprovado
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Histórico de candidaturas
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Controle das suas preferências
            </li>
          </ul>
          {onChoose ? (
            <button
              type="button"
              className="button primary"
              disabled={disabled || current === plan.id || plan.id === "free"}
              onClick={() => onChoose(plan.id)}
            >
              {current === plan.id
                ? "Seu plano atual"
                : plan.id === "free"
                  ? "Sem mensalidade"
                  : `Assinar ${plan.name}`}
            </button>
          ) : (
            <a
              className={`landing-button ${plan.id === "plus" ? "primary" : "plain"}`}
              href="/register"
              onClick={() => rememberPlan(plan.id)}
            >
              {plan.id === "free" ? "Começar grátis" : `Escolher ${plan.name}`}
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
