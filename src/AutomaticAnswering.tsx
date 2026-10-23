import { Sparkles } from "lucide-react";
import { useAction, useApp } from "./lib";
import { Button } from "./components";
import "./application-questions.css";

export default function AutomaticAnswering() {
  const { w, toast } = useApp();
  const action = useAction();
  const enabled = !!w.profile.answerPolicy?.enabled;
  return (
    <section className="question-review" aria-label="Respostas automáticas">
      <div className="question-review-heading">
        <span className="question-review-icon">
          <Sparkles size={22} />
        </span>
        <div>
          <h2>
            {enabled
              ? "A IA cuida das perguntas"
              : "Deixe as perguntas com a IA"}
          </h2>
          <p>
            {enabled
              ? "Currículo, preferências e respostas automáticas. Você acompanha tudo no histórico."
              : "Envie seu currículo, escolha suas preferências e deixe o sistema preparar as candidaturas."}
          </p>
        </div>
      </div>
      <div className="question-review-body">
        <p className="question-review-help">
          Usamos suas informações reais. Quando não houver informação
          suficiente, respondemos “não” ou “prefiro não informar”, conforme
          as opções do formulário. Informações pessoais conhecidas são preservadas. Para “como soube da vaga”, usamos a origem do anúncio.
          As respostas e a regra usada ficam no histórico.
        </p>
        <p className="question-review-help">
          Aceites de termos e consentimentos jurídicos exigem uma autorização
          específica sua.
        </p>
        <Button
          disabled={action.isPending}
          className={enabled ? "" : "primary"}
          onClick={() =>
            action.mutate(
              {
                path: "/answer-policy",
                method: "PUT",
                body: { enabled: !enabled, confirmation: true },
              },
              {
                onSuccess: () =>
                  toast(
                    enabled
                      ? "Respostas automáticas desativadas."
                      : "Respostas automáticas autorizadas. Acompanhe suas candidaturas no histórico.",
                  ),
              },
            )
          }
        >
          {action.isPending
            ? "Salvando…"
            : enabled
              ? "Desativar respostas automáticas"
              : "Autorizar respostas automáticas"}
        </Button>
      </div>
    </section>
  );
}
