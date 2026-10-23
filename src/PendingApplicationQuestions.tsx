import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { api, useAction, useApp } from "./lib";
import { Button, Field } from "./components";
import IntelligenceControl from "./IntelligenceControl";
import "./application-questions.css";

type Draft = {
  question: string;
  answer: string;
  evidence: string[];
  source?: "profile" | "ai";
};
type Preparation = {
  answers: Draft[];
  unresolved: { question: string; reason: string }[];
  warning?: string;
  message: string;
};

export default function PendingApplicationQuestions() {
  const { w, demo, toast } = useApp();
  const save = useAction();
  const inspect = useAction();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState("");
  const [indices, setIndices] = useState<Record<string, number>>({});
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [results, setResults] = useState<Record<string, Preparation>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = w.applications.filter(
    (a) =>
      a.status === "Requer ação manual" &&
      a.missingQuestions?.length &&
      a.destinationUrl,
  );
  const application = pending.find((a) => a.id === selected) || pending[0];
  const questions = application?.missingQuestions || [];
  const index = Math.min(
    indices[application?.id] || 0,
    Math.max(questions.length - 1, 0),
  );
  const question = questions[index];
  const job = w.jobs.find((j) => j.id === application?.jobId);
  const current = values[application?.id] || {};
  const answered = questions.filter((q) => {
    const options = application.questionOptions?.[q];
    return current[q]?.trim() && (!options?.length || options.includes(current[q]));
  });
  const preparation = results[application?.id];
  const draft = preparation?.answers.find((a) => a.question === question);
  const unresolved = preparation?.unresolved?.find(
    (a) => a.question === question,
  );
  const options = application?.questionOptions?.[question];
  const agreement = /concordo|declaro|consinto|consent|i agree|i accept/i.test(
    question || "",
  );
  const choices = options?.length ? options : agreement ? ["Sim", "Não"] : null;
  const busy = save.isPending || inspect.isPending;
  const generate = useMutation({
    mutationFn: (id: string) =>
      api<Preparation>(
        `/applications/${id}/questions/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
        demo,
      ),
    onSuccess: (result, id) => {
      setResults((previous) => ({ ...previous, [id]: result }));
      setValues((previous) => {
        const next = { ...previous[id] };
        for (const item of result.answers)
          if (!next[item.question]?.trim()) next[item.question] = item.answer;
        return { ...previous, [id]: next };
      });
      setConfirmed(false);
      setNotice("");
    },
  });
  function move(next: number) {
    setIndices((previous) => ({ ...previous, [application.id]: next }));
  }
  function edit(value: string) {
    setValues((previous) => ({
      ...previous,
      [application.id]: { ...previous[application.id], [question]: value },
    }));
    setConfirmed(false);
  }
  return (
    <section
      className="question-review"
      aria-label="Perguntas das vagas antes do envio"
    >
      <div className="question-review-heading">
        <span className="question-review-icon">
          <MessageSquareText size={22} />
        </span>
        <div>
          <h2>Respostas pendentes</h2>
          <p>
            {pending.length
              ? `${pending.length} candidaturas precisam de algumas respostas suas.`
              : "Nenhuma pergunta pendente. As próximas aparecerão aqui."}
          </p>
        </div>
        {!!pending.length && (
          <Button
            className={expanded ? "" : "primary"}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Recolher" : "Revisar perguntas"}
          </Button>
        )}
      </div>
      {expanded && application && (
        <div className="question-review-body">
          <Field label="Qual candidatura deseja revisar?">
            <select
              value={application.id}
              onChange={(event) => {
                setSelected(event.target.value);
                setConfirmed(false);
                setNotice("");
                generate.reset();
              }}
            >
              {pending.map((a) => {
                const j = w.jobs.find((item) => item.id === a.jobId);
                return (
                  <option key={a.id} value={a.id}>
                    {j?.company || "Empresa"} · {j?.title || "Candidatura"}
                  </option>
                );
              })}
            </select>
          </Field>
          <div className="question-review-toolbar">
            <Button
              className="primary"
              disabled={generate.isPending || busy}
              onClick={() => {
                setConfirmed(false);
                generate.mutate(application.id);
              }}
            >
              <Sparkles size={16} />
              {generate.isPending
                ? "Preparando respostas…"
                : "Preparar respostas com IA"}
            </Button>
            <Button
              disabled={generate.isPending || busy}
              onClick={() =>
                inspect.mutate(
                  { path: `/applications/${application.id}/questions/inspect` },
                  {
                    onSuccess: (result) => {
                      setNotice(result.message);
                      setConfirmed(false);
                    },
                  },
                )
              }
            >
              {inspect.isPending
                ? "Conferindo formulário…"
                : "Atualizar perguntas"}
            </Button>
            <a
              href={application.destinationUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ver vaga original ↗
            </a>
          </div>
          <p className="question-review-help">
            Aproveitamos suas respostas salvas e usamos a IA para sugerir as
            demais. Você revisa antes de salvar.
          </p>
          {generate.isPending && (
            <p role="status" className="question-review-feedback">
              Consultando seu perfil e currículo. Isso pode levar alguns
              segundos.
            </p>
          )}
          {generate.isError && (
            <p role="alert" className="question-review-feedback error">
              {generate.error.message}
            </p>
          )}
          {preparation && (
            <div className="question-review-feedback" role="status">
              <strong>{preparation.message}</strong>
              {preparation.warning && <p>{preparation.warning}</p>}
            </div>
          )}
          {notice && (
            <p role="status" className="question-review-feedback">
              {notice}
            </p>
          )}
          {(!w.intelligence?.enabled || !w.intelligence?.consent) && (
            <IntelligenceControl disabled={generate.isPending} />
          )}
          <div className="question-review-progress">
            <span>
              Pergunta {index + 1} de {questions.length}
            </span>
            <span>{answered.length} preenchidas</span>
          </div>
          <div className="question-review-steps" aria-label="Escolher pergunta">
            {questions.map((q, i) => (
              <button
                key={q}
                type="button"
                aria-label={`Pergunta ${i + 1}`}
                aria-current={i === index ? "step" : undefined}
                className={current[q]?.trim() ? "answered" : ""}
                onClick={() => move(i)}
              >
                {current[q]?.trim() ? <Check size={14} /> : i + 1}
              </button>
            ))}
          </div>
          <div
            className="question-review-question"
            key={`${application.id}:${question}`}
          >
            <div className="question-review-source">
              {draft?.source === "profile"
                ? "Do seu perfil · confira a resposta"
                : draft
                  ? "Sugestão da IA · revise antes de usar"
                  : agreement
                    ? "Declaração da empresa · sua decisão"
                    : "Sua resposta"}
            </div>
            <Field label={question}>
              {choices ? (
                <select
                  value={current[question] || ""}
                  onChange={(event) => edit(event.target.value)}
                >
                  <option value="">Selecione sua resposta</option>
                  {choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {agreement && !options?.length
                        ? choice === "Sim"
                          ? "Sim, concordo com esta declaração"
                          : "Não concordo"
                        : choice}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  rows={4}
                  maxLength={3000}
                  placeholder="Escreva sua resposta ou prepare uma sugestão com IA."
                  value={current[question] || ""}
                  onChange={(event) => edit(event.target.value)}
                />
              )}
            </Field>
            {unresolved && !current[question]?.trim() && (
              <p className="question-review-help">{unresolved.reason}</p>
            )}
            {agreement &&
              (question.match(/https:\/\/[^\s)]+/g) || []).map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  Ler documento da empresa ↗
                </a>
              ))}
            {draft?.source === "ai" && (
              <details className="question-review-evidence">
                <summary>Ver informações usadas pela IA</summary>
                {draft.evidence.map((quote, i) => (
                  <blockquote key={i}>{quote}</blockquote>
                ))}
              </details>
            )}
          </div>
          <div className="question-review-pagination">
            <Button disabled={index === 0} onClick={() => move(index - 1)}>
              <ChevronLeft size={16} />
              Anterior
            </Button>
            <span>{job?.company}</span>
            <Button
              disabled={index >= questions.length - 1}
              onClick={() => move(index + 1)}
            >
              Próxima
              <ChevronRight size={16} />
            </Button>
          </div>
          <div className="question-review-save">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy || generate.isPending}
              />
              <span>
                Revisei as respostas preenchidas e autorizo seu uso somente
                nesta candidatura.
              </span>
            </label>
            <Button
              className="primary"
              disabled={
                !confirmed || !answered.length || busy || generate.isPending
              }
              onClick={() =>
                save.mutate(
                  {
                    path: `/applications/${application.id}/answers`,
                    method: "PUT",
                    body: {
                      confirmation: true,
                      answers: answered.map((q) => ({
                        question: q,
                        value: current[q],
                        reuse: false,
                      })),
                    },
                  },
                  {
                    onSuccess: () => {
                      setConfirmed(false);
                      setNotice(
                        "Respostas salvas. O formulário será conferido novamente antes do envio.",
                      );
                      toast("Respostas salvas.");
                    },
                    onError: (error) => setNotice(error.message),
                  },
                )
              }
            >
              {save.isPending
                ? "Salvando…"
                : `Salvar respostas (${answered.length})`}
            </Button>
            <p>
              Você pode salvar aos poucos. A candidatura aguarda enquanto houver
              perguntas obrigatórias sem resposta.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
