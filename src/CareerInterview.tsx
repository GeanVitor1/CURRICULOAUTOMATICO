import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Play } from "lucide-react";
import { Button, Field, Mascot, PageHead } from "./components";
import { api, useAction, useApp } from "./lib";
import { candidatePortals, portals } from "../shared/portals";
import type { InterviewAnswers } from "../shared/types";
import PortalConnections from "./PortalConnections";

export type SiteCapability = {
  id: string;
  name: string;
  discovery: boolean;
  automatic: boolean;
  connected?: boolean;
  connectable?: boolean;
  connectedAt?: string | null;
  profileResumeId?: string | null;
  needsResumeApproval?: boolean;
  sessionState?: "disconnected" | "expired" | "verified" | "unavailable";
  sessionSaved?: boolean;
  verifiedAt?: string | null;
  authMethod?: "oauth" | "authorized-browser" | "external";
  oauthConfigured?: boolean;
  identityConnected?: boolean;
  identityExpired?: boolean;
  limitation?: string;
  applicationMethod?: "authorized-api" | "authorized-browser" | "external";
};
export function Choices({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="interview-choices">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={value.includes(option)}
          className={value.includes(option) ? "selected" : ""}
          onClick={() =>
            onChange(
              value.includes(option)
                ? value.filter((item) => item !== option)
                : [...value, option],
            )
          }
        >
          <span>{value.includes(option) ? <Check size={16} /> : null}</span>
          {option}
        </button>
      ))}
    </div>
  );
}
export default function CareerInterview() {
  const { w, navigate, toast } = useApp();
  const a = useAction();
  const resume = w.resumes[0];
  const saved =
    w.interviewDraft?.answers.resumeId === resume?.id
      ? w.interviewDraft
      : w.interview?.answers.resumeId === resume?.id
        ? w.interview
        : undefined;
  const [step, setStep] = useState(
    saved?.completed ? 0 : Math.min(5, Math.max(0, saved?.step || 0)),
  );
  const [answers, setAnswers] = useState<InterviewAnswers>(
    saved?.answers || {
      resumeId: resume?.id || "",
      phone: w.profile.phone || "",
      titles:
        resume?.targets?.slice(0, 3).map((target) => target.title) ||
        w.filters.titles,
      modalities: w.filters.modalities.length
        ? w.filters.modalities
        : ["Remoto"],
      city: w.profile.location,
      sameCityOnly: true,
      salaryMin: w.filters.salaryMin,
      salaryMax: w.filters.salaryMax || 0,
      includeUnknownSalary: !w.filters.salaryOnly,
      ageDays: 7,
      contracts: w.filters.contracts,
      sites: candidatePortals.filter((site) =>
        w.sources.some((source) => source.enabled && source.board === site),
      ).length
        ? candidatePortals.filter((site) =>
            w.sources.some((source) => source.enabled && source.board === site),
          )
        : ["linkedin", "gupy"],
      dailyLimit: w.routine.dailyLimit,
    },
  );
  const [customTitle, setCustomTitle] = useState("");
  const [error, setError] = useState("");
  const saving = useRef(false);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      questionHeading.current?.focus();
      previousStep.current = step;
    }
  }, [step]);
  const capabilities = useQuery({
    queryKey: ["automation-sites"],
    queryFn: () => api<SiteCapability[]>("/automation/sites"),
  });
  const automaticReady =
    answers.sites.length > 0 &&
    answers.sites.some((site) =>
      capabilities.data?.some((item) => item.id === site && item.automatic),
    );
  const unavailableSites = answers.sites.filter(
    (site) => !capabilities.data?.find((item) => item.id === site)?.automatic,
  );
  const update = <K extends keyof InterviewAnswers>(
    key: K,
    value: InterviewAnswers[K],
  ) => {
    if (saving.current) return;
    setError("");
    setAnswers((old) => ({ ...old, [key]: value }));
  };
  const save = (
    next: number,
    start: "save" | "prepare" | "automatic" = "save",
    complete = false,
  ) => {
    if (saving.current) return;
    if (
      !answers.titles.length ||
      (step >= 1 && !answers.modalities.length) ||
      (step >= 4 && !answers.sites.length)
    ) {
      setError("Selecione pelo menos uma opção para continuar.");
      return;
    }
    if (
      step === 1 &&
      answers.sameCityOnly &&
      !answers.city.trim() &&
      answers.modalities.some((item) => item !== "Remoto")
    ) {
      setError("Informe a cidade onde deseja trabalhar.");
      return;
    }
    if (
      step === 2 &&
      answers.salaryMax &&
      answers.salaryMax < answers.salaryMin
    ) {
      setError("O salário máximo deve ser maior que o mínimo.");
      return;
    }
    if (
      step === 2 &&
      [answers.salaryMin, answers.salaryMax].some(
        (value) => !Number.isFinite(value) || value < 0 || value > 10000000,
      )
    ) {
      setError("Informe salários entre R$ 0 e R$ 10.000.000.");
      return;
    }
    if (
      complete &&
      (!Number.isInteger(answers.dailyLimit) ||
        answers.dailyLimit < 1 ||
        answers.dailyLimit > 50)
    ) {
      setError("Escolha um limite de 1 a 50 candidaturas por dia.");
      return;
    }
    saving.current = true;
    a.mutate(
      {
        path: "/interview",
        method: "PUT",
        body: { step: next, answers, complete, start },
      },
      {
        onSuccess: () => {
          if (complete) {
            toast(
              start === "save"
                ? "Preferências salvas."
                : start === "automatic"
                  ? "Automação de envio ativada."
                  : "Busca e preparação automáticas ativadas. O envio ainda será concluído por você.",
            );
            navigate("automacao");
          } else setStep(next);
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  };
  const questions = [
    "Quais cargos você quer procurar?",
    "Como você quer trabalhar?",
    "Qual salário você procura?",
    "Que vagas podemos considerar?",
    "Em quais sites você quer se candidatar?",
    "Podemos começar?",
  ];
  if (!resume)
    return (
      <div className="journey-card">
        <Mascot
          variant="handing-resume"
          className="journey-mascot"
          decorative
        />
        <h1>Primeiro, seu currículo</h1>
        <p>Vamos analisar sua experiência antes de fazer as perguntas.</p>
        <Button className="primary" onClick={() => navigate("curriculo")}>
          Enviar currículo
        </Button>
      </div>
    );
  return (
    <div className="career-flow">
      <PageHead
        title="Suas preferências"
        description="Uma pergunta de cada vez. Você pode mudar as respostas depois."
      />
      <section
        className="interview-card"
        aria-label="Entrevista de preferências"
        aria-busy={a.isPending}
      >
        <div className="interview-progress">
          <span>Pergunta {step + 1} de 6</span>
          <div aria-hidden="true">
            {questions.map((_, index) => (
              <i key={index} className={index <= step ? "done" : ""} />
            ))}
          </div>
        </div>
        <h2 ref={questionHeading} tabIndex={-1}>
          {questions[step]}
        </h2>
        <fieldset className="interview-fields" disabled={a.isPending}>
          {step === 0 && (
            <>
              <p>
                Estes cargos combinam com o seu currículo. Selecione os que
                deseja.
              </p>
              <Choices
                options={[
                  ...new Set([
                    ...(resume.targets?.map((target) => target.title) || []),
                    ...answers.titles,
                  ]),
                ]}
                value={answers.titles}
                onChange={(titles) => update("titles", titles.slice(0, 8))}
              />
              <details className="interview-extra">
                <summary>Quero incluir outro cargo</summary>
                <div className="form-grid">
                  <Field label="Outro cargo">
                    <input
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      maxLength={100}
                    />
                  </Field>
                  <Button
                    disabled={
                      customTitle.trim().length < 2 ||
                      answers.titles.length >= 8
                    }
                    onClick={() => {
                      update("titles", [
                        ...new Set([...answers.titles, customTitle.trim()]),
                      ]);
                      setCustomTitle("");
                    }}
                  >
                    Adicionar cargo
                  </Button>
                </div>
              </details>
            </>
          )}
          {step === 1 && (
            <>
              <Choices
                options={["Remoto", "Presencial", "Híbrido"]}
                value={answers.modalities}
                onChange={(modalities) => update("modalities", modalities)}
              />
              <Field label="Em qual cidade você mora?">
                <input
                  placeholder="Ex.: Ilhéus, BA"
                  value={answers.city}
                  maxLength={200}
                  autoComplete="address-level2"
                  onChange={(e) => update("city", e.target.value)}
                />
              </Field>
              {answers.modalities.some((modality) => modality !== "Remoto") && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={answers.sameCityOnly}
                    onChange={(e) => update("sameCityOnly", e.target.checked)}
                  />
                  Presencial e híbrido somente na minha cidade
                </label>
              )}
              <p className="interview-help">
                Vagas remotas podem ser de empresas em outras cidades.
                Conferimos as restrições de contratação no anúncio.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-grid">
                <Field label="Salário mínimo por mês (R$)">
                  <input
                    type="number"
                    min={0}
                    max={10000000}
                    value={answers.salaryMin || ""}
                    placeholder="Sem mínimo"
                    onChange={(e) =>
                      update("salaryMin", Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Salário máximo por mês (opcional)">
                  <input
                    type="number"
                    min={0}
                    max={10000000}
                    value={answers.salaryMax || ""}
                    placeholder="Sem limite"
                    onChange={(e) =>
                      update("salaryMax", Number(e.target.value))
                    }
                  />
                </Field>
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={answers.includeUnknownSalary}
                  onChange={(e) =>
                    update("includeUnknownSalary", e.target.checked)
                  }
                />
                Pode considerar vagas sem salário anunciado
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <Field label="Quando a vaga deve ter sido publicada?">
                <select
                  value={answers.ageDays}
                  onChange={(e) => update("ageDays", Number(e.target.value))}
                >
                  <option value={1}>Últimas 24 horas</option>
                  <option value={3}>Últimos 3 dias</option>
                  <option value={7}>Última semana</option>
                  <option value={30}>Último mês</option>
                  <option value={365}>Qualquer data</option>
                </select>
              </Field>
              <Field label="Qual contratação você aceita?">
                <Choices
                  options={["CLT", "PJ", "Estágio", "Aprendiz", "Temporário"]}
                  value={answers.contracts}
                  onChange={(contracts) => update("contracts", contracts)}
                />
              </Field>
              <p className="interview-help">
                Sem marcar um tipo, consideramos todos. Quando você escolhe uma
                data, vagas sem data informada ficam de fora.
              </p>
            </>
          )}
          {step === 4 && (
            <>
              <div className="interview-sites">
                {candidatePortals.map((site) => (
                  <button
                    type="button"
                    key={site}
                    aria-pressed={answers.sites.includes(site)}
                    className={answers.sites.includes(site) ? "selected" : ""}
                    onClick={() =>
                      update(
                        "sites",
                        answers.sites.includes(site)
                          ? answers.sites.filter((item) => item !== site)
                          : [...answers.sites, site],
                      )
                    }
                  >
                    <span>{portals[site].name}</span>
                    <span>
                      {answers.sites.includes(site) && <Check size={18} />}
                    </span>
                  </button>
                ))}
              </div>
              <p className="interview-help">
                O envio depende da conexão disponível em cada site. Vamos
                mostrar a disponibilidade antes de começar.
              </p>
              <PortalConnections selected={answers.sites} />
            </>
          )}
          {step === 5 && (
            <>
              <dl className="interview-review">
                <div>
                  <dt>Cargos</dt>
                  <dd>{answers.titles.join(", ")}</dd>
                </div>
                <div>
                  <dt>Modalidade</dt>
                  <dd>
                    {answers.modalities.join(", ")}
                    {answers.sameCityOnly && answers.city
                      ? ` · presencial/híbrido em ${answers.city}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Salário</dt>
                  <dd>
                    {answers.salaryMin
                      ? `A partir de R$ ${answers.salaryMin.toLocaleString("pt-BR")}`
                      : "Sem mínimo"}
                    {answers.salaryMax
                      ? ` até R$ ${answers.salaryMax.toLocaleString("pt-BR")}`
                      : ""}{" "}
                    ·{" "}
                    {answers.includeUnknownSalary
                      ? "aceita não anunciado"
                      : "somente divulgado"}
                  </dd>
                </div>
                <div>
                  <dt>Publicação</dt>
                  <dd>
                    {answers.ageDays === 365
                      ? "Qualquer data"
                      : `Últimos ${answers.ageDays} dias`}
                  </dd>
                </div>
                <div>
                  <dt>Sites</dt>
                  <dd>
                    {answers.sites
                      .map(
                        (site) => portals[site as keyof typeof portals]?.name,
                      )
                      .join(", ")}
                  </dd>
                </div>
              </dl>
              <Field label="Limite de candidaturas por dia">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={answers.dailyLimit}
                  onChange={(e) => update("dailyLimit", Number(e.target.value))}
                />
              </Field>
              <Field label="Telefone para as candidaturas (com DDD)">
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={answers.phone || ""}
                  placeholder="Ex.: (73) 99999-9999"
                  onChange={(e) => update("phone", e.target.value)}
                />
              </Field>
              {!!unavailableSites.length && (
                <p className="interview-availability" role="status">
                  O envio automático ainda não está disponível para{" "}
                  {answers.sites
                    .filter(
                      (site) =>
                        !capabilities.data?.find((item) => item.id === site)
                          ?.automatic,
                    )
                    .map((site) => portals[site as keyof typeof portals]?.name)
                    .join(", ")}
                  .{" "}
                  {automaticReady
                    ? "O envio será automático nas fontes autorizadas. Nos demais sites, você concluirá a candidatura."
                    : "Você pode salvar suas preferências ou automatizar a busca e a preparação enquanto o envio não estiver conectado."}
                </p>
              )}
              {capabilities.isError && (
                <div className="recoverable-error" role="alert">
                  <p>
                    Não conseguimos verificar a disponibilidade dos sites. Suas
                    respostas foram mantidas.
                  </p>
                  <Button
                    disabled={capabilities.isFetching}
                    onClick={() => capabilities.refetch()}
                  >
                    {capabilities.isFetching
                      ? "Verificando…"
                      : "Tentar novamente"}
                  </Button>
                </div>
              )}
              <p className="interview-help">
                Ao confirmar, você aprova este currículo e as preferências para
                suas candidaturas.
              </p>
            </>
          )}
          {error && (
            <p className="negative" role="alert">
              {error}
            </p>
          )}
          <div className="interview-actions">
            {step > 0 && (
              <Button disabled={a.isPending} onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} />
                Voltar
              </Button>
            )}
            {step < 5 ? (
              <Button
                className="primary"
                disabled={a.isPending}
                onClick={() => save(step + 1)}
              >
                Continuar
                <ArrowRight size={16} />
              </Button>
            ) : (
              <>
                <Button
                  disabled={a.isPending}
                  onClick={() => save(5, "save", true)}
                >
                  Salvar preferências
                </Button>
                <Button
                  className="primary"
                  disabled={
                    a.isPending ||
                    capabilities.isPending ||
                    capabilities.isError
                  }
                  onClick={() =>
                    save(5, automaticReady ? "automatic" : "prepare", true)
                  }
                >
                  <Play size={16} />
                  {automaticReady
                    ? "Ativar envio automático"
                    : "Iniciar busca e preparação"}
                </Button>
              </>
            )}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
