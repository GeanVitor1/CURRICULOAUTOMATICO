import { Check } from "lucide-react";
import { plans, type PlanId } from "../shared/plans";
import "./pricing.css";

const descriptions = {
  free: {
    tag: "Sem compromisso",
    audience: "Para dar os primeiros passos",
    comparison: "Comece no seu ritmo",
    benefits: ["Até 150 envios em 30 dias", "Sem cartão e sem mensalidade"],
  },
  plus: {
    tag: "10× o limite gratuito",
    audience: "Para buscar emprego todos os dias",
    comparison: "+45 envios por dia sobre o Gratuito",
    benefits: [
      "Até 1.500 envios em 30 dias",
      "De 5 para 50 candidaturas por dia",
    ],
  },
  pro: {
    tag: "Maior capacidade",
    audience: "Para ampliar o volume da sua busca",
    comparison: "Dobro do limite do Essencial",
    benefits: [
      "Até 3.000 envios em 30 dias",
      "+50 candidaturas por dia sobre o Essencial",
    ],
  },
} as const;

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
  testMode = false,
  compact = false,
}: {
  current?: PlanId;
  disabled?: boolean;
  onChoose?: (plan: PlanId) => void;
  testMode?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`pricing-comparison${compact ? " pricing-compact" : ""}`}>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={`pricing-card pricing-${plan.id} ${plan.id === "plus" ? "pricing-featured" : ""}`}
            aria-label={`Plano ${plan.name}`}
          >
            <div className="pricing-card-top">
              <h3>{plan.name}</h3>
              <span>{descriptions[plan.id].tag}</span>
            </div>
            <p className="pricing-audience">{descriptions[plan.id].audience}</p>
            <div className="pricing-capacity">
              <strong>{plan.dailyLimit}</strong>
              <span>
                candidaturas automáticas
                <br />
                por dia
              </span>
            </div>
            <p className="pricing-comparison-label">
              {descriptions[plan.id].comparison}
            </p>
            <p className="pricing-price">
              <strong>
                {plan.price === 0 ? "Grátis" : `R$ ${plan.price}`}
              </strong>
              {plan.price > 0 && <span>/mês</span>}
            </p>
            {!compact && (
              <ul>
                {descriptions[plan.id].benefits.map((benefit) => (
                  <li key={benefit}>
                    <Check size={16} aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            )}
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
                    : `${testMode ? "Testar" : "Assinar"} ${plan.name}`}
              </button>
            ) : (
              <a
                className={`landing-button ${plan.id === "plus" ? "primary" : "plain"}`}
                href="/register"
                onClick={() => rememberPlan(plan.id)}
              >
                {plan.id === "free"
                  ? "Começar grátis"
                  : `Escolher ${plan.name}`}
              </a>
            )}
          </article>
        ))}
      </div>
      <div
        className="pricing-included"
        aria-label="Recursos de todos os planos"
      >
        <strong>Em todos os planos</strong>
        <p>
          Busca de vagas reais · Currículo aprovado · Histórico de candidaturas
          · Suas preferências
        </p>
      </div>
      {!compact && (
        <p className="pricing-capacity-note">
          A capacidade em 30 dias é uma referência do limite diário. Os envios
          dependem de vagas compatíveis e integração disponível; a cota não
          acumula.
        </p>
      )}
    </div>
  );
}
