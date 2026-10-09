import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileText,
  MapPin,
  Upload,
  WandSparkles,
} from "lucide-react";
import { Button, Field, Mascot } from "./components";
import type { MascotVariant } from "./mascots";
import { api, useAction, useApp } from "./lib";
import type { VerifiedOrganization } from "../server/source-registry";
import ResumeBuilder from "./ResumeBuilder";
import "./product.css";

type Answers = {
  goal: string;
  location: string;
  resumeChoice: "upload" | "build" | "later" | "";
  experience: string;
  modalities: string[];
  contracts: string[];
  salaryMin: number;
};
type Progress = { step: number; completed: boolean; answers: Answers };
const steps = [
  [
    "O que você procura?",
    "Vamos conhecer a direção que faz sentido para você.",
  ],
  [
    "Onde você gostaria de trabalhar?",
    "Perto de casa, de forma remota ou um pouco dos dois.",
  ],
  [
    "Você já tem um currículo?",
    "Escolha o caminho mais confortável. Dá para começar do zero.",
  ],
  [
    "Conte um pouco da sua experiência.",
    "Você não precisa ter trabalhado com carteira assinada.",
  ],
  [
    "Que tipos de vaga você aceita?",
    "Quanto mais claro seu objetivo, mais útil fica a sua busca.",
  ],
  [
    "Vamos conferir suas preferências?",
    "Tudo pode ser ajustado depois. Esse é só o começo.",
  ],
];
const stepMascots: MascotVariant[] = [
  "idea",
  "thinking",
  "handing-resume",
  "writing-to-you",
  "considering",
  "writing-right",
];
function Pick({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="wizard-picks">
      {options.map((label) => (
        <button
          type="button"
          key={label}
          className={value.includes(label) ? "selected" : ""}
          aria-pressed={value.includes(label)}
          onClick={() =>
            onChange(
              value.includes(label)
                ? value.filter((item) => item !== label)
                : [...value, label],
            )
          }
        >
          <span className="pick-check">
            {value.includes(label) && <Check size={13} />}
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Onboarding({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { w, navigate, toast } = useApp();
  const progress = (w as typeof w & { onboarding?: Progress }).onboarding;
  const action = useAction();
  const client = useQueryClient();
  const registry = useQuery({
    queryKey: ["source-registry"],
    queryFn: () => api<VerifiedOrganization[]>("/source-registry"),
  });
  const [source, setSource] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [step, setStep] = useState(
    Math.min(5, Math.max(0, progress?.completed ? 0 : progress?.step || 0)),
  );
  const [answers, setAnswers] = useState<Answers>(
    progress?.answers || {
      goal: w.filters.titles.join(", "),
      location: w.profile.location || w.filters.locations.join(", "),
      resumeChoice: w.resumes.length ? "upload" : "",
      experience: w.profile.experience,
      modalities: [...w.filters.modalities],
      contracts: [...w.filters.contracts],
      salaryMin: w.filters.salaryMin,
    },
  );
  const [file, setFile] = useState<File | null>(null);
  const [builder, setBuilder] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [uploadName, setUploadName] = useState("");
  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setError("");
    setAnswers((old) => ({ ...old, [key]: value }));
    setSaved("");
  };
  // Save completed decisions immediately; keep the current step editable until Continue.
  const save = (next: number, complete = false) =>
    action.mutate(
      {
        path: "/onboarding",
        method: "PUT",
        body: { step: next, completed: complete, answers, complete },
      },
      {
        onSuccess: () => {
          setStep(next);
          setSaved("Progresso salvo");
          if (complete) {
            toast("Preferências salvas. Seu espaço está pronto.");
            onComplete ? onComplete() : navigate("visao-geral");
          }
        },
      },
    );
  useEffect(() => {
    setError("");
  }, [step]);
  const continueStep = () => {
    if (step === 0 && answers.goal.trim().length < 2) {
      setError("Conte qual cargo ou área você procura para continuarmos.");
      return;
    }
    if (step === 1 && !answers.modalities.length) {
      setError("Escolha pelo menos uma forma de trabalhar.");
      return;
    }
    if (
      step === 1 &&
      !answers.location.trim() &&
      !answers.modalities.includes("Remoto")
    ) {
      setError("Informe uma cidade para buscar vagas presenciais ou híbridas.");
      return;
    }
    if (step === 2 && !answers.resumeChoice) {
      setError("Escolha como você quer preparar seu currículo.");
      return;
    }
    if (
      step === 2 &&
      answers.resumeChoice === "upload" &&
      !w.resumes.length &&
      !uploadName
    ) {
      setError("Envie seu arquivo ou escolha preparar o currículo depois.");
      return;
    }
    if (
      step === 2 &&
      answers.resumeChoice === "build" &&
      !w.resumes.length &&
      !uploadName
    ) {
      setBuilder(true);
      return;
    }
    if (step === 4 && !answers.contracts.length) {
      setError(
        "Escolha pelo menos um tipo de vaga. Se estiver em dúvida, selecione todas as opções que aceitaria.",
      );
      return;
    }
    if (step === 5) {
      void finish();
      return;
    }
    save(Math.min(5, step + 1));
  };
  const finish = async () => {
    setFinishing(true);
    setError("");
    try {
      const selected = registry.data?.find(
        (s) => s.type + ":" + s.board === source,
      );
      if (
        selected &&
        !w.sources.some(
          (s) => s.type === selected.type && s.board === selected.board,
        )
      )
        await api("/sources", {
          method: "POST",
          body: JSON.stringify({ ...selected, enabled: true }),
        });
      await api("/onboarding", {
        method: "PUT",
        body: JSON.stringify({ step: 5, answers, complete: true }),
      });
      if (selected || w.sources.some((s) => s.enabled && s.discovery)) {
        try {
          const run = await api("/discover", { method: "POST" });
          toast(run.message);
        } catch (failure) {
          toast(
            failure instanceof Error
              ? failure.message
              : "Preferências salvas, mas a busca não iniciou. Confira suas fontes.",
            true,
          );
        }
      } else toast("Preferências salvas. Vamos conhecer seu espaço?");
      await client.invalidateQueries({ queryKey: ["workspace"] });
      onComplete ? onComplete() : navigate("visao-geral");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setFinishing(false);
    }
  };
  if (builder)
    return (
      <ResumeBuilder
        onCancel={() => setBuilder(false)}
        onComplete={() => {
          setBuilder(false);
          setUploadName("Currículo criado");
          setSaved("Seu currículo está salvo");
        }}
      />
    );
  return (
    <section className="wizard-shell onboarding">
      <div className="wizard-topline">
        <span>
          <BriefcaseBusiness size={16} />
          Sua busca começa com você
        </span>
        <small>Você pode voltar sem perder suas respostas.</small>
      </div>
      <div
        className="wizard-progress"
        aria-label={"Etapa " + (step + 1) + " de " + steps.length}
      >
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? "done" : ""} />
        ))}
      </div>
      <div className="wizard-heading">
        <Mascot
          className="wizard-mascot"
          variant={
            error
              ? "surprised"
              : action.isPending || finishing
                ? "thinking"
                : stepMascots[step]
          }
          animated={action.isPending || finishing}
          eager
        />
        <span className="eyebrow">
          VAMOS NOS CONHECER · {String(step + 1).padStart(2, "0")} / 06
        </span>
        <h1>{steps[step][0]}</h1>
        <p>{steps[step][1]}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          continueStep();
        }}
      >
        <div className="wizard-body">
          {step === 0 && (
            <>
              <Field
                label="Cargos ou áreas de interesse"
                help="Escreva com suas palavras. Separe opções por vírgulas."
              >
                <input
                  autoFocus
                  value={answers.goal}
                  onChange={(e) => update("goal", e.target.value)}
                  placeholder="Ex.: atendimento, caixa, reposição"
                  required
                />
              </Field>
              <div className="suggestion-chips">
                {[
                  "Primeiro emprego",
                  "Atendimento",
                  "Administrativo",
                  "Vendas",
                  "Logística",
                  "Saúde",
                  "Educação",
                  "Tecnologia",
                ].map((label) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => update("goal", label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="wizard-hint">
                Não sabe o cargo exato? Tudo bem. Sua experiência e suas
                preferências ajudam a indicar caminhos relacionados.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <Field
                label="Cidade e estado"
                help="Para vagas remotas, ainda é útil saber onde você mora."
              >
                <input
                  autoFocus
                  value={answers.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="Ex.: Belo Horizonte, MG"
                />
              </Field>
              <Field label="Como você gostaria de trabalhar?">
                <Pick
                  options={["Presencial", "Híbrido", "Remoto"]}
                  value={answers.modalities}
                  onChange={(v) => update("modalities", v)}
                />
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <div className="resume-choice-grid">
                {[
                  {
                    id: "upload",
                    title: "Já tenho currículo",
                    description: "Envie seu PDF ou DOCX.",
                    icon: Upload,
                  },
                  {
                    id: "build",
                    title: "Ainda não tenho currículo",
                    description: "Vamos criar um com perguntas simples.",
                    icon: WandSparkles,
                  },
                  {
                    id: "later",
                    title: "Prefiro preparar depois",
                    description: "Quero conhecer meu espaço primeiro.",
                    icon: FileText,
                  },
                ].map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={answers.resumeChoice === choice.id}
                    className={
                      "resume-choice " +
                      (answers.resumeChoice === choice.id ? "selected" : "")
                    }
                    onClick={() =>
                      update(
                        "resumeChoice",
                        choice.id as Answers["resumeChoice"],
                      )
                    }
                  >
                    <choice.icon size={23} />
                    <strong>{choice.title}</strong>
                    <span>{choice.description}</span>
                  </button>
                ))}
              </div>
              {answers.resumeChoice === "upload" && (
                <div className="wizard-upload">
                  {w.resumes.length || uploadName ? (
                    <p className="positive">
                      <Check size={15} /> {uploadName || w.resumes[0].name} ·
                      salvo no seu espaço
                    </p>
                  ) : (
                    <>
                      <Field
                        label="Seu arquivo de currículo"
                        help="PDF com texto selecionável ou DOCX, até 5 MB."
                      >
                        <input
                          type="file"
                          accept=".pdf,.docx"
                          disabled={action.isPending}
                          onChange={(e) => {
                            const chosen = e.target.files?.[0] || null;
                            if (chosen && chosen.size > 5 * 1024 * 1024) {
                              setError("Escolha um arquivo de até 5 MB.");
                              setFile(null);
                              return;
                            }
                            setError("");
                            setFile(chosen);
                          }}
                        />
                      </Field>
                      <Button
                        type="button"
                        disabled={!file || action.isPending}
                        onClick={() => {
                          if (!file) return;
                          const form = new FormData();
                          form.append("file", file);
                          action.mutate(
                            { path: "/resumes", body: form },
                            {
                              onSuccess: () => {
                                setUploadName(file.name);
                                setSaved("Currículo enviado");
                                toast(
                                  "Currículo enviado. Você poderá revisar os dados no seu perfil.",
                                );
                              },
                            },
                          );
                        }}
                      >
                        <Upload size={15} />
                        {action.isPending
                          ? "Lendo seu currículo…"
                          : "Enviar currículo"}
                      </Button>
                    </>
                  )}
                </div>
              )}
              {answers.resumeChoice === "build" && (
                <div className="wizard-upload">
                  <p>
                    Você vai responder algumas perguntas e receber um currículo
                    em PDF.
                  </p>
                  <Button type="button" onClick={() => setBuilder(true)}>
                    <WandSparkles size={15} />
                    Começar meu currículo
                  </Button>
                </div>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <Field
                label="Experiências que gostaria de compartilhar"
                help="Conte sobre empregos, trabalhos informais, atividades voluntárias ou projetos. Pode deixar em branco."
              >
                <textarea
                  autoFocus
                  rows={5}
                  value={answers.experience}
                  onChange={(e) => update("experience", e.target.value)}
                  placeholder="Ex.: Trabalhei atendendo clientes na loja da minha família. Concluí o ensino médio."
                />
              </Field>
              <p className="wizard-hint">
                Você também pode buscar seu primeiro emprego. Não exigimos
                experiência, LinkedIn ou portfólio para começar.
              </p>
            </>
          )}
          {step === 4 && (
            <>
              <Field label="Tipos de contratação">
                <Pick
                  options={[
                    "CLT",
                    "Aprendiz",
                    "Estágio",
                    "Temporário",
                    "PJ",
                    "Freelancer",
                    "Trainee",
                  ]}
                  value={answers.contracts}
                  onChange={(v) => update("contracts", v)}
                />
              </Field>
              <Field
                label="Salário mínimo desejado por mês (opcional)"
                help="Deixe em branco para não limitar a busca por salário."
              >
                <input
                  type="number"
                  min={0}
                  value={answers.salaryMin || ""}
                  onChange={(e) => update("salaryMin", Number(e.target.value))}
                  placeholder="R$"
                />
              </Field>
            </>
          )}
          {step === 5 && (
            <>
              <div className="preference-review">
                {[
                  {
                    title: "O que você procura",
                    value: answers.goal,
                    icon: BriefcaseBusiness,
                    target: 0,
                  },
                  {
                    title: "Onde e como trabalhar",
                    value: [answers.location, answers.modalities.join(", ")]
                      .filter(Boolean)
                      .join(" · "),
                    icon: MapPin,
                    target: 1,
                  },
                  {
                    title: "Seu currículo",
                    value:
                      answers.resumeChoice === "later"
                        ? "Preparar depois"
                        : w.resumes.length || uploadName
                          ? "Já está no seu espaço"
                          : "Criar meu currículo",
                    icon: FileText,
                    target: 2,
                  },
                  {
                    title: "Sua experiência",
                    value:
                      answers.experience ||
                      "Ainda não informada. Tudo bem para começar.",
                    icon: Check,
                    target: 3,
                  },
                  {
                    title: "Tipos de vaga",
                    value:
                      answers.contracts.join(", ") +
                      (answers.salaryMin
                        ? " · A partir de R$ " +
                          answers.salaryMin.toLocaleString("pt-BR")
                        : ""),
                    icon: BriefcaseBusiness,
                    target: 4,
                  },
                ].map((item) => (
                  <div key={item.title}>
                    <item.icon size={18} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.value}</p>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => save(item.target)}
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
              <p className="wizard-hint">
                Depois, você poderá conectar os murais de empresas que quer
                acompanhar. As buscas consultam fontes externas e nunca inventam
                oportunidades.
              </p>
            </>
          )}
          {step === 5 && (
            <div className="onboarding-source">
              <Field
                label="Onde pesquisar primeiro?"
                help="Pode escolher agora ou conhecer seu espaço e fazer isso depois."
              >
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={registry.isPending || finishing}
                >
                  <option value="">Escolher depois</option>
                  {registry.data?.map((s) => (
                    <option
                      key={s.type + ":" + s.board}
                      value={s.type + ":" + s.board}
                    >
                      {s.company} · {s.sector}
                    </option>
                  ))}
                </select>
              </Field>
              {source && (
                <p className="wizard-hint">
                  {
                    registry.data?.find(
                      (s) => s.type + ":" + s.board === source,
                    )?.coverage
                  }{" "}
                  A busca consulta anúncios publicados; pode retornar zero
                  oportunidades para suas preferências.
                </p>
              )}
              {registry.isError && (
                <p className="wizard-error" role="status">
                  Não conseguimos carregar as empresas agora. Você pode concluir
                  e escolher uma fonte depois.
                </p>
              )}
            </div>
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
            disabled={step === 0 || action.isPending || finishing}
            onClick={() => save(step - 1)}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <span aria-live="polite">
            {action.isPending || finishing
              ? "Salvando suas respostas…"
              : saved || "Suas respostas ficam salvas ao continuar."}
          </span>
          <Button className="primary" disabled={action.isPending || finishing}>
            {finishing
              ? "Preparando sua busca…"
              : step === 5
                ? source || w.sources.some((s) => s.enabled && s.discovery)
                  ? "Começar minha busca"
                  : "Concluir configuração"
                : "Continuar"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </section>
  );
}
