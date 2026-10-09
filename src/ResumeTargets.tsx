import { useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { Button, Mascot } from "./components";
import { useAction, useApp } from "./lib";
import type { Resume } from "../shared/types";

export default function ResumeTargets({ resume }: { resume: Resume }) {
  const { w, toast } = useApp();
  const action = useAction();
  const [selected, setSelected] = useState(
    resume.targetsConfirmed
      ? resume.targetTitles || w.filters.titles
      : resume.targets?.map((target) => target.title) || [],
  );
  return (
    <section className="resume-targets" aria-label="Tipos de vaga sugeridos">
      <div className="resume-target-heading">
        <Mascot className="target-mascot" variant="idea" decorative />
        <h3>
          <Sparkles size={17} /> Para quais vagas este currículo faz sentido?
        </h3>
      </div>
      <p>
        {resume.targetsMessage ||
          "Analise esta versão para ver sugestões de cargos baseadas no currículo."}
      </p>
      {!!resume.targets?.length && (
        <>
          <div className="resume-target-list">
            {resume.targets.map((target, index) => (
              <div className="resume-target" key={target.title}>
                <input
                  id={`target-${resume.id}-${index}`}
                  type="checkbox"
                  checked={selected.includes(target.title)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, target.title]
                        : old.filter((title) => title !== target.title),
                    )
                  }
                />
                <div>
                  <label htmlFor={`target-${resume.id}-${index}`}>
                    <strong>{target.title}</strong>
                  </label>
                  <details className="target-evidence">
                    <summary>Entenda a sugestão</summary>
                    <p>{target.reason}</p>
                    <blockquote>“{target.evidence}”</blockquote>
                    {target.caution && <small>{target.caution}</small>}
                  </details>
                </div>
              </div>
            ))}
          </div>
          <p>
            <strong>
              {resume.targetsConfirmed &&
              selected.join("\0") ===
                (resume.targetTitles || w.filters.titles).join("\0")
                ? "Cargos confirmados na busca:"
                : "Ao confirmar, vamos procurar estes tipos de vaga:"}
            </strong>{" "}
            {selected.join(", ") || "Selecione pelo menos um cargo."}
          </p>
          <p>
            As candidaturas dependem dos requisitos de cada anúncio e de um
            currículo aprovado. Você finaliza o envio no portal.
          </p>
          <Button
            disabled={!selected.length || action.isPending}
            onClick={() =>
              action.mutate(
                {
                  path: `/resumes/${resume.id}/targets`,
                  method: "PUT",
                  body: { titles: selected },
                },
                {
                  onSuccess: () =>
                    toast(
                      "Cargos confirmados. Suas buscas e candidaturas seguirão esses critérios.",
                    ),
                },
              )
            }
          >
            <Check size={14} />
            Confirmar cargos para minha busca
          </Button>
        </>
      )}
    </section>
  );
}
