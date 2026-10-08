import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, FileText } from "lucide-react";
import { Button, Field } from "./components";
import { api, split, useAction, useApp } from "./lib";
import "./product.css";

type Draft = {
  name: string;
  email: string;
  location: string;
  headline: string;
  education: string;
  experience: string;
  skills: string;
  languages: string;
};
const questions = [
  ["Vamos começar por você.", "O básico para uma empresa entrar em contato."],
  [
    "Que trabalho você procura?",
    "Pode ser uma profissão, uma área ou seu primeiro emprego.",
  ],
  [
    "Conte sobre seus estudos.",
    "Qualquer etapa da sua formação pode fazer parte da sua história.",
  ],
  [
    "O que você já fez?",
    "Trabalhos informais, voluntariado e ajuda no negócio da família também contam.",
  ],
  [
    "O que você sabe fazer bem?",
    "Pense no que aprendeu estudando, trabalhando ou no dia a dia.",
  ],
  [
    "Seu currículo, do seu jeito.",
    "Confira as informações antes de criar o documento. Você pode voltar e ajustar.",
  ],
];

export default function ResumeBuilder({
  onComplete,
  onCancel,
}: {
  onComplete?: (id: string) => void;
  onCancel?: () => void;
}) {
  const { w, navigate, toast } = useApp();
  const action = useAction();
  const [draft, setDraft] = useState<Draft>(
    w.resumeDraft?.data || {
      name: w.profile.name,
      email: w.profile.email,
      location: w.profile.location,
      headline: w.profile.headline,
      education: w.profile.education,
      experience: w.profile.experience,
      skills: w.profile.skills.join(", "),
      languages: w.profile.languages,
    },
  );
  const [step, setStep] = useState(
    Math.min(5, Math.max(0, w.resumeDraft?.step || 0)),
  );
  const [error, setError] = useState("");
  const [ready, setReady] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveDraft = () => {
    setDraftStatus("Salvando rascunho…");
    const request = saveQueue.current
      .catch(() => {})
      .then(() =>
        api("/resumes/draft", {
          method: "PUT",
          body: JSON.stringify({ step, data: draft }),
        }),
      );
    saveQueue.current = request;
    return request.then(
      () => setDraftStatus("Rascunho salvo na sua conta"),
      (failure: Error) => {
        setDraftStatus("Não foi possível salvar o rascunho");
        throw failure;
      },
    );
  };
  useEffect(() => {
    if (ready || finalizing || action.isPending) return;
    const timer = setTimeout(() => {
      saveDraft().catch(() => {});
    }, 750);
    return () => clearTimeout(timer);
  }, [draft, step, ready, finalizing, action.isPending]);
  const exit = async () => {
    try {
      await saveDraft();
      onCancel ? onCancel() : navigate("curriculo");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível salvar. Tente novamente.",
      );
    }
  };
  const update = (key: keyof Draft, value: string) => {
    setError("");
    setDraft((old) => ({ ...old, [key]: value }));
  };
  const next = () => {
    if (step === 0 && draft.name.trim().length < 2) {
      setError("Como você gostaria que seu nome aparecesse no currículo?");
      return;
    }
    if (
      step === 0 &&
      draft.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)
    ) {
      setError("Confira o e-mail antes de continuar.");
      return;
    }
    if (step === 1 && draft.headline.trim().length < 2) {
      setError("Conte qual trabalho ou área você procura.");
      return;
    }
    setError("");
    setStep(step + 1);
  };
  if (ready)
    return (
      <section className="wizard-shell builder-success">
        <span className="success-mark">
          <Check size={28} />
        </span>
        <span className="eyebrow">UM NOVO COMEÇO</span>
        <h1>Seu currículo está pronto.</h1>
        <p>
          Seu documento foi salvo. Baixe o PDF e confira seu perfil antes de
          usar em uma candidatura.
        </p>
        <div className="wizard-success-actions">
          <a
            className="button primary"
            href={"/api/resumes/" + encodeURIComponent(ready) + "/download"}
          >
            <Download size={16} />
            Baixar meu currículo em PDF
          </a>
          <Button
            onClick={() =>
              onComplete ? onComplete(ready) : navigate("curriculo")
            }
          >
            Continuar <ArrowRight size={16} />
          </Button>
        </div>
      </section>
    );
  return (
    <section className="wizard-shell resume-builder">
      <div className="wizard-topline">
        <span>
          <FileText size={16} /> Seu primeiro currículo
        </span>
        <Button disabled={finalizing || action.isPending} onClick={exit}>
          Salvar e sair
        </Button>
      </div>
      <div
        className="wizard-progress"
        aria-label={"Etapa " + (step + 1) + " de " + questions.length}
      >
        {questions.map((_, i) => (
          <span key={i} className={i <= step ? "done" : ""} />
        ))}
      </div>
      <div className="wizard-heading">
        <span className="eyebrow">
          ETAPA {String(step + 1).padStart(2, "0")} /{" "}
          {String(questions.length).padStart(2, "0")}
        </span>
        <h1>{questions[step][0]}</h1>
        <p>{questions[step][1]}</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (step < questions.length - 1) {
            next();
            return;
          }
          if (!confirmed) {
            setError("Confirme que as informações representam sua história.");
            return;
          }
          setFinalizing(true);
          try {
            await saveDraft();
            await action.mutateAsync(
              {
                path: "/resumes/build",
                body: { ...draft, skills: split(draft.skills) },
              },
              {
                onSuccess: (result) => {
                  setReady(result.resumeId);
                  toast("Currículo criado e salvo.");
                },
              },
            );
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Não foi possível criar o currículo.",
            );
          } finally {
            setFinalizing(false);
          }
        }}
      >
        <div className="wizard-body">
          {step === 0 && (
            <>
              <Field label="Seu nome completo">
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Como você quer se apresentar?"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="E-mail para contato">
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => update("email", e.target.value)}
                  autoComplete="email"
                  placeholder="seunome@email.com"
                />
              </Field>
              <Field label="Cidade e estado">
                <input
                  value={draft.location}
                  onChange={(e) => update("location", e.target.value)}
                  autoComplete="address-level2"
                  placeholder="Ex.: Recife, PE"
                />
              </Field>
            </>
          )}
          {step === 1 && (
            <Field
              label="Seu objetivo profissional"
              help="Não precisa saber o nome exato do cargo."
            >
              <input
                autoFocus
                value={draft.headline}
                onChange={(e) => update("headline", e.target.value)}
                placeholder="Ex.: Primeiro emprego em atendimento"
                required
              />
              <div className="suggestion-chips">
                {[
                  "Primeiro emprego",
                  "Atendimento ao cliente",
                  "Área administrativa",
                  "Logística",
                ].map((text) => (
                  <button
                    type="button"
                    key={text}
                    onClick={() => update("headline", text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {step === 2 && (
            <Field
              label="Formação e cursos"
              help="Informe o que você estudou, onde e quando. Pode deixar em branco."
            >
              <textarea
                autoFocus
                rows={5}
                value={draft.education}
                onChange={(e) => update("education", e.target.value)}
                placeholder="Ex.: Ensino médio completo — Escola Municipal, 2024. Curso de atendimento ao cliente, 2025."
              />
            </Field>
          )}
          {step === 3 && (
            <>
              <Field
                label="Experiências que você quer incluir"
                help="Conte o que fazia e o período, com suas próprias palavras. Pode deixar em branco."
              >
                <textarea
                  autoFocus
                  rows={6}
                  value={draft.experience}
                  onChange={(e) => update("experience", e.target.value)}
                  placeholder="Ex.: Ajudei na loja da família entre 2023 e 2025, atendendo clientes e organizando produtos."
                />
              </Field>
              <p className="wizard-hint">
                Procurando seu primeiro emprego? Tudo bem. Seu currículo pode
                destacar sua formação e o que você sabe fazer.
              </p>
            </>
          )}
          {step === 4 && (
            <>
              <Field
                label="Suas habilidades"
                help="Separe por vírgulas. Inclua somente o que você sabe fazer."
              >
                <textarea
                  autoFocus
                  rows={4}
                  value={draft.skills}
                  onChange={(e) => update("skills", e.target.value)}
                  placeholder="Ex.: atendimento, organização de estoque, planilhas"
                />
              </Field>
              <Field label="Idiomas (opcional)">
                <input
                  value={draft.languages}
                  onChange={(e) => update("languages", e.target.value)}
                  placeholder="Ex.: Português, espanhol básico"
                />
              </Field>
            </>
          )}
          {step === 5 && (
            <>
              <article className="resume-document-preview">
                <header>
                  <h2>{draft.name}</h2>
                  <p>
                    {[draft.email, draft.location].filter(Boolean).join(" · ")}
                  </p>
                </header>
                {[
                  ["Objetivo", draft.headline],
                  ["Formação", draft.education],
                  ["Experiência", draft.experience],
                  ["Habilidades", split(draft.skills).join(" · ")],
                  ["Idiomas", draft.languages],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <section key={label}>
                      <h3>{label}</h3>
                      <p>{value}</p>
                    </section>
                  ))}
              </article>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Revisei e confirmo que estas informações são verdadeiras.
              </label>
            </>
          )}
        </div>
        {(error || action.isError) && (
          <p className="wizard-error" role="alert">
            {error || action.error?.message}
          </p>
        )}
        <div className="wizard-footer">
          <Button
            type="button"
            onClick={() => {
              setError("");
              step > 0 ? setStep(step - 1) : exit();
            }}
            disabled={action.isPending || finalizing}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <span aria-live="polite">{draftStatus}</span>
          <Button className="primary" disabled={action.isPending || finalizing}>
            {action.isPending || finalizing
              ? "Criando seu documento…"
              : step === 5
                ? "Criar meu currículo"
                : "Continuar"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </section>
  );
}
