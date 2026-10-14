import type { Resume } from "../shared/types";
import "./resume-review.css";

const statuses = {
  identified: "Identificado",
  needs_detail: "Completar detalhes",
  not_found: "Não localizado no texto",
};
const bases = {
  objective: "Interesse declarado",
  experience: "Experiência ou projeto",
  education: "Formação ou curso",
  skills: "Competências declaradas",
};

export default function ResumeReviewPanel({
  resume,
  showTargets = false,
}: {
  resume: Resume;
  showTargets?: boolean;
}) {
  const report = resume.review;
  if (!report)
    return (
      <p className="muted">
        Selecione “Analisar novamente” para gerar o diagnóstico detalhado desta
        versão.
      </p>
    );
  return (
    <section className="resume-review" aria-label="Diagnóstico do currículo">
      <div className="resume-review-heading">
        <div>
          <span className="eyebrow">SEU PLANO DE MELHORIA</span>
          <h2>Sua análise de currículo</h2>
        </div>
        <span className="resume-review-method">
          {report.method === "local" ? "Diagnóstico local" : "Com apoio de IA"}
        </span>
      </div>
      <p>{report.summary}</p>
      <p className="resume-review-note">
        Os itens abaixo descrevem o conteúdo do documento. Informações não
        localizadas podem ser completadas por você.
      </p>
      {report.coverage.truncated && (
        <p role="status" className="resume-review-note">
          A IA recebeu somente parte do texto deste documento longo. O
          diagnóstico local considera o restante; confira a extração antes de
          usar as sugestões.
        </p>
      )}
      <dl className="resume-review-sections">
        {report.sections.map((section) => (
          <div key={section.category} data-status={section.status}>
            <dt>{section.label}</dt>
            <dd>{statuses[section.status]}</dd>
          </div>
        ))}
      </dl>
      {!!report.strengths.length && (
        <details className="resume-review-evidence">
          <summary>
            O que já aparece no currículo ({report.strengths.length})
          </summary>
          <ul>
            {report.strengths.map((strength, index) => (
              <li key={`${strength.label}-${index}`}>
                <strong>{strength.label}</strong>
                <blockquote>{strength.evidence}</blockquote>
              </li>
            ))}
          </ul>
        </details>
      )}
      <h3>O que melhorar primeiro</h3>
      {report.improvements.length ? (
        <ol className="resume-review-actions">
          {report.improvements.map((item) => (
            <li key={item.id}>
              <div className="resume-review-action-heading">
                <h4>{item.title}</h4>
                <span>
                  {item.priority === "high" ? "Prioridade" : "Refinamento"}
                  {item.source === "ai" ? " · IA" : ""}
                </span>
              </div>
              <p>{item.action}</p>
              {!!item.evidence && <blockquote>{item.evidence}</blockquote>}
              <p className="resume-review-question">
                Para completar: {item.question}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          As principais seções foram identificadas. Confira se os fatos estão
          corretos e adapte o conteúdo aos requisitos de cada vaga.
        </p>
      )}
      {showTargets && (
        <div className="resume-review-targets">
          <h3>Vagas para investigar</h3>
          <p className="resume-review-note">
            Estas sugestões orientam a busca. Confira os requisitos do anúncio e
            confirme suas preferências nas perguntas.
          </p>
          {resume.targets?.length ? (
            <ul>
              {resume.targets.map((target) => (
                <li key={target.title}>
                  <strong>{target.title}</strong>
                  <span className="resume-review-note">
                    {target.basis
                      ? bases[target.basis]
                      : "Sugestão baseada no currículo"}
                  </span>
                  <p>{target.reason}</p>
                  <details>
                    <summary>Ver o motivo e os cuidados</summary>
                    <blockquote>{target.evidence}</blockquote>
                    <p>{target.caution}</p>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Complete o objetivo e as atividades para obter sugestões de cargos
              com evidência suficiente.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
