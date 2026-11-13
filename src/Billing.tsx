import { appPathname } from './basePath';
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib";
import { Button } from "./components";
import Pricing, { rememberPlan, selectedPlan } from "./Pricing";
import type { BillingSummary, PlanId } from "../shared/plans";

export function useBilling(awaitingCheckout = false) {
  const started = useRef(Date.now());
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => api<BillingSummary>("/billing"),
    staleTime: 60000,
    refetchOnWindowFocus: true,
    // A brief reconciliation after returning from checkout, never an idle loop.
    refetchInterval: (query) =>
      awaitingCheckout &&
      query.state.status !== "error" &&
      Date.now() - started.current < 60000
        ? 2000
        : false,
  });
}
export default function Billing() {
  const [outcome] = useState(() =>
    new URLSearchParams(location.search).get("billing"),
  );
  const billing = useBilling(outcome === "return" || outcome === "success");
  // Retorno da InfinitePay: confirma o pagamento com os dados do redirect.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const order_nsu = q.get("order_nsu"), transaction_nsu = q.get("transaction_nsu"), slug = q.get("slug");
    if (!order_nsu || !transaction_nsu || !slug) return;
    void api("/billing/confirm", { method: "POST", body: JSON.stringify({ order_nsu, transaction_nsu, slug }) })
      .then(() => billing.refetch())
      .catch(() => undefined);
  }, []);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [intended] = useState(selectedPlan);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.has("billing")) {
      for (const k of ["billing", "order_nsu", "transaction_nsu", "slug", "receipt_url", "capture_method"]) query.delete(k);
      history.replaceState(
        {},
        "",
        `${appPathname()}${query.size ? `?${query}` : ""}${location.hash}`,
      );
    }
  }, []);
  const go = async (plan?: PlanId) => {
    if (submitting.current || plan === "free") return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(
        plan ? "/billing/checkout" : "/billing/portal",
        { method: "POST", ...(plan ? { body: JSON.stringify({ plan }) } : {}) },
      );
      rememberPlan("free");
      location.assign(result.url);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível abrir o pagamento.",
      );
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="interview-card account-billing" aria-label="Assinatura">
      <h2>Seu plano e assinatura</h2>
      {billing.isPending ? (
        <p>Consultando seu plano…</p>
      ) : billing.error ? (
        <p className="form-error" role="alert">
          {billing.error.message}
        </p>
      ) : (
        billing.data && (
          <>
            {billing.data.paymentMode === "test" && (
              <p className="billing-status" role="status">
                Pagamento em modo de teste. Nenhuma cobrança real será feita; as
                assinaturas aqui servem para validar o funcionamento.
              </p>
            )}            <div className="billing-overview">
            <div className="billing-summary">
              <div>
                <h3>{billing.data.name}</h3>
                <span>
                  Até {billing.data.dailyLimit} candidaturas automáticas por dia
                </span>
              </div>
              {billing.data.portalAvailable && (
                <Button disabled={busy} onClick={() => void go()}>
                  Gerenciar assinatura
                </Button>
              )}
            </div>
            <p className="billing-usage">
              {billing.data.usedToday} {billing.data.usedToday === 1 ? "tentativa" : "tentativas"} de envio hoje ·{" "}              {billing.data.remainingToday} {billing.data.remainingToday === 1 ? "disponível" : "disponíveis"}. A cota renova à
              meia-noite, no horário de Brasília.
            </p>
            </div>
            {(outcome === "success" || outcome === "return") && (
              <p className="billing-status" role="status">
                Pagamento recebido para confirmação. Seu plano será atualizado
                aqui após a confirmação da cobrança.
              </p>
            )}
            {outcome === "canceled" && (
              <p className="billing-status" role="status">
                Você saiu do pagamento. Seu plano atual continua disponível.
              </p>
            )}
            {billing.data.cancelAtPeriodEnd &&
              billing.data.currentPeriodEnd && (
                <p>
                  Plano pago por 30 dias, sem renovação automática. Acesso até{" "}
                  {new Date(billing.data.currentPeriodEnd).toLocaleDateString(
                    "pt-BR",
                    { timeZone: "America/Sao_Paulo" },
                  )}
                  . Para continuar depois disso, pague um novo período.
                </p>
              )}
            {["past_due", "unpaid", "incomplete"].includes(
              billing.data.status,
            ) && (
              <p className="billing-status">
                Seu pagamento precisa de atenção. Escolha o plano novamente para gerar um novo pagamento.
              </p>
            )}
            {intended && billing.data.plan === "free" && (
              <p>
                Você escolheu o plano{" "}
                {intended === "plus" ? "Essencial" : "Pro"}. Confira abaixo e
                confirme a assinatura quando o pagamento estiver disponível.
              </p>
            )}
            {!billing.data.checkoutAvailable && (
              <p className="billing-status">
                As assinaturas pagas ainda não estão disponíveis. Você pode usar
                o plano gratuito.
              </p>
            )}
            <Pricing
              compact
              testMode={billing.data.paymentMode === "test"}
              current={billing.data.plan}
              disabled={
                busy ||
                !billing.data.checkoutAvailable ||
                billing.data.plan !== "free"
              }
              onChoose={(plan) => void go(plan)}
            />
            <p className="pricing-note">
              Pagamento único por 30 dias, por Pix ou cartão, sem renovação
              automática. Para continuar depois, pague um novo período. O envio depende de
              vagas compatíveis, currículo aprovado e conexão de envio
              disponível. Tentativas com resultado incerto contam na cota para
              evitar duplicações. Limites não utilizados não acumulam.
            </p>
          </>
        )
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
