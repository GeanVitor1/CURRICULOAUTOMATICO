import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BatteryLow,
  Ban,
  Check,
  FileText,
  Flame,
  Handshake,
  CalendarCheck,
  MapPin,
  Rabbit,
  Cat,
  Snail,
  ThumbsDown,
  Upload,
  WandSparkles,
  Compass,
} from "lucide-react";
import { Mascot } from "./components";
import { api, useAction, useApp } from "./lib";
import type { VerifiedOrganization } from "../server/source-registry";
import ResumeBuilder from "./ResumeBuilder";
import ResumeScore from "./ResumeScore";
import "./onboarding-flow.css";

type Answers = {
  goal: string;
  location: string;
  resumeChoice: "upload" | "build" | "later" | "";
  experience: string;
  modalities: string[];
  contracts: string[];
  salaryMin: number;
  country: string;
  timelineMonths: number;
  interviewsPerWeek: number;
  blockers: string[];
  seniority: string;
};
type Progress = { step: number; completed: boolean; answers: Partial<Answers> };

const AREAS = [
  "Primeiro emprego", "Atendimento", "Administrativo", "Vendas",
  "Logística", "Saúde", "Educação", "Tecnologia", "Financeiro", "Marketing",
];
const SENIORITY = [
  ["Primeiro emprego", "Ainda não trabalhei com carteira assinada"],
  ["Estágio / Aprendiz", "Estou estudando ou começando"],
  ["Júnior", "Até 2 anos de experiência"],
  ["Pleno", "De 2 a 5 anos"],
  ["Sênior / Especialista", "Mais de 5 anos"],
];
const COUNTRIES = [
  ["BR", "Brasil"], ["PT", "Portugal"], ["US", "Estados Unidos"], ["CA", "Canadá"],
  ["ES", "Espanha"], ["DE", "Alemanha"], ["GB", "Reino Unido"], ["JP", "Japão"],
];
const BLOCKERS = [
  { label: "Não me candidato o suficiente", icon: BatteryLow },
  { label: "Não recebo convites para entrevistas", icon: Ban },
  { label: "Faltam boas ofertas de emprego", icon: ThumbsDown },
  { label: "Não sei por onde começar", icon: Compass },
];
const CONTRACTS = ["CLT", "Aprendiz", "Estágio", "Temporário", "PJ", "Freelancer", "Trainee"];

type StepId =
  | "goal" | "seniority" | "country" | "where" | "timeline" | "interviews"
  | "blockers" | "insight" | "resume" | "score" | "experience" | "contracts" | "review";

const TITLES: Record<StepId, string> = {
  goal: "Qual trabalho você procura?",
  seniority: "Qual é o seu momento de carreira?",
  country: "Em qual país você está se candidatando?",
  where: "Onde e como você quer trabalhar?",
  timeline: "Em quanto tempo você quer conseguir um emprego?",
  interviews: "Quantas entrevistas por semana você quer ter?",
  blockers: "O que impede você de alcançar seus objetivos?",
  insight: "Seu plano de candidaturas",
  resume: "Você já tem um currículo?",
  score: "Veja a nota do seu currículo",
  experience: "Conte um pouco da sua experiência",
  contracts: "Que tipos de vaga você aceita?",
  review: "Tudo pronto! Confira suas respostas",
};

function Slider({
  min, max, value, onChange, icons, labels, caption,
}: {
  min: number; max: number; value: number; onChange: (v: number) => void;
  icons: React.ComponentType<{ size?: number }>[]; labels: string[]; caption: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const active = Math.min(icons.length - 1, Math.floor((pct / 100) * icons.length));
  return (
    <div className="flow-slider">
      <div className="flow-slider-icons">
        {icons.map((Icon, i) => (
          <span key={i} className={i === active ? "on" : ""}><Icon size={i === active ? 34 : 26} /></span>
        ))}
      </div>
      <input
        type="range" min={min} max={max} value={value}
        style={{ "--pct": pct + "%" } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flow-slider-labels">{labels.map((l) => <small key={l}>{l}</small>)}</div>
      <p className="flow-pill">{caption}</p>
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const { w, navigate, toast } = useApp();
  const progress = (w as typeof w & { onboarding?: Progress }).onboarding;
  const action = useAction();
  const client = useQueryClient();
  const registry = useQuery({
    queryKey: ["source-registry"],
    queryFn: () => api<VerifiedOrganization[]>("/source-registry"),
  });
  const [answers, setAnswers] = useState<Answers>({
    goal: w.filters.titles.join(", "),
    location: w.profile.location || w.filters.locations.join(", "),
    resumeChoice: w.resumes.length ? "upload" : "",
    experience: w.profile.experience,
    modalities: [...w.filters.modalities],
    contracts: w.filters.contracts.length ? [...w.filters.contracts] : ["CLT"],
    salaryMin: w.filters.salaryMin,
    country: "Brasil",
    timelineMonths: 3,
    interviewsPerWeek: 3,
    blockers: [],
    seniority: "",
    ...(progress?.answers || {}),
    ...(w.resumes.length && !progress?.answers?.resumeChoice ? { resumeChoice: "upload" as const } : {}),
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [builder, setBuilder] = useState(false);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const hasResume = w.resumes.length > 0 || !!uploadName;
  const flow = useMemo<StepId[]>(
    () => [
      "goal", "seniority", "country", "where", "timeline", "interviews", "blockers",
      "insight", "resume", ...(hasResume ? (["score"] as StepId[]) : []),
      "experience", "contracts", "review",
    ],
    [hasResume],
  );
  const [step, setStep] = useState(
    Math.min(flow.length - 1, Math.max(0, progress?.completed ? 0 : progress?.step || 0)),
  );
  const id = flow[Math.min(step, flow.length - 1)];
  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setError("");
    setAnswers((old) => ({ ...old, [key]: value }));
  };
  const toggle = (key: "modalities" | "contracts" | "blockers", v: string) =>
    update(key, answers[key].includes(v) ? answers[key].filter((x) => x !== v) : [...answers[key], v]);

  const persist = (next: number) =>
    api("/onboarding", {
      method: "PUT",
      body: JSON.stringify({ step: next, completed: false, answers }),
    }).catch(() => undefined);

  const validate = (): string => {
    if (id === "goal" && answers.goal.trim().length < 2) return "Escolha ou escreva uma área para continuar.";
    if (id === "seniority" && !answers.seniority) return "Escolha a opção mais próxima de você.";
    if (id === "where" && !answers.modalities.length) return "Escolha pelo menos uma forma de trabalhar.";
    if (id === "where" && !answers.location.trim() && !answers.modalities.includes("Remoto"))
      return "Informe sua cidade para vagas presenciais ou híbridas.";
    if (id === "blockers" && !answers.blockers.length) return "Escolha pelo menos uma opção.";
    if (id === "resume" && !answers.resumeChoice) return "Escolha como quer preparar seu currículo.";
    if (id === "resume" && answers.resumeChoice === "upload" && !hasResume) return "Envie seu arquivo ou escolha outra opção.";
    if (id === "contracts" && !answers.contracts.length) return "Escolha pelo menos um tipo de vaga.";
    return "";
  };
  const next = () => {
    const problem = validate();
    if (problem) return setError(problem);
    if (id === "resume" && answers.resumeChoice === "build" && !hasResume) return setBuilder(true);
    if (id === "review") return void finish();
    const n = Math.min(flow.length - 1, step + 1);
    setStep(n);
    void persist(n);
  };
  const back = () => { setError(""); setStep(Math.max(0, step - 1)); };

  const finish = async () => {
    setFinishing(true);
    setError("");
    try {
      const selected = registry.data?.find((s) => s.type + ":" + s.board === source);
      if (selected && !w.sources.some((s) => s.type === selected.type && s.board === selected.board))
        await api("/sources", { method: "POST", body: JSON.stringify({ ...selected, enabled: true }) });
      await api("/onboarding", {
        method: "PUT",
        body: JSON.stringify({ step: flow.length - 1, answers, complete: true }),
      });
      if (selected || w.sources.some((s) => s.enabled && s.discovery)) {
        try {
          const run = await api<{ message: string }>("/discover", { method: "POST" });
          toast(run.message);
        } catch (failure) {
          toast(failure instanceof Error ? failure.message : "Preferências salvas, mas a busca não iniciou.", true);
        }
      } else toast("Preferências salvas. Veja as vagas compatíveis com você.");
      await client.invalidateQueries({ queryKey: ["workspace"] });
      onComplete ? onComplete() : navigate("vagas");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setFinishing(false);
    }
  };

  if (builder)
    return (
      <ResumeBuilder
        onCancel={() => setBuilder(false)}
        onComplete={() => { setBuilder(false); setUploadName("Currículo criado"); }}
      />
    );

  const weekly = answers.interviewsPerWeek * 12;
  const timelineCaption =
    answers.timelineMonths <= 1 ? "Ritmo intenso" : answers.timelineMonths <= 3 ? "Recomendado" : "Com calma";
  const interviewCaption =
    answers.interviewsPerWeek <= 2 ? "Bom começo" : answers.interviewsPerWeek <= 4 ? "Ótimo ritmo" : "Ritmo acelerado";
  const card = (selected: boolean) => "flow-option" + (selected ? " selected" : "");

  return (
    <section className="flow-shell">
      <header className="flow-top">
        <button type="button" className="flow-back" onClick={back} disabled={step === 0} aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="flow-progress" aria-label={`Etapa ${step + 1} de ${flow.length}`}>
          <span style={{ width: ((step + 1) / flow.length) * 100 + "%" }} />
        </div>
      </header>
      <form className="flow-body" onSubmit={(e) => { e.preventDefault(); next(); }} key={id}>
        <h1>{TITLES[id]}</h1>

        {id === "goal" && (
          <>
            <div className="flow-chips">
              {AREAS.map((a) => (
                <button type="button" key={a} className={card(answers.goal === a)} onClick={() => update("goal", a)}>
                  {answers.goal === a && <Check size={14} />} {a}
                </button>
              ))}
            </div>
            <label className="flow-field">
              <span>Ou escreva com suas palavras (separe por vírgulas)</span>
              <input value={answers.goal} onChange={(e) => update("goal", e.target.value)} placeholder="Ex.: desenvolvedor .NET, analista de sistemas" />
            </label>
          </>
        )}

        {id === "seniority" && (
          <div className="flow-list">
            {SENIORITY.map(([t, d]) => (
              <button type="button" key={t} className={card(answers.seniority === t)} onClick={() => update("seniority", t)}>
                <strong>{t}</strong><small>{d}</small>
              </button>
            ))}
          </div>
        )}

        {id === "country" && (
          <div className="flow-grid">
            {COUNTRIES.map(([code, name]) => (
              <button type="button" key={code} className={card(answers.country === name)} onClick={() => update("country", name)}>
                <em>{code}</em> {name}
              </button>
            ))}
          </div>
        )}

        {id === "where" && (
          <>
            <div className="flow-grid three">
              {["Remoto", "Híbrido", "Presencial"].map((m) => (
                <button type="button" key={m} className={card(answers.modalities.includes(m))} onClick={() => toggle("modalities", m)}>
                  {answers.modalities.includes(m) && <Check size={14} />} {m}
                </button>
              ))}
            </div>
            <label className="flow-field">
              <span><MapPin size={14} /> Sua cidade e estado</span>
              <input value={answers.location} onChange={(e) => update("location", e.target.value)} placeholder="Ex.: Fortaleza, CE" />
            </label>
          </>
        )}

        {id === "timeline" && (
          <>
            <p className="flow-big">{answers.timelineMonths >= 6 ? "6+ meses" : answers.timelineMonths === 1 ? "1 mês" : answers.timelineMonths + " meses"}</p>
            <Slider
              min={1} max={6} value={answers.timelineMonths} onChange={(v) => update("timelineMonths", v)}
              icons={[Cat, Rabbit, Snail]} labels={["1 mês", "3 meses", "6+ meses"]} caption={timelineCaption}
            />
          </>
        )}

        {id === "interviews" && (
          <>
            <p className="flow-big">{answers.interviewsPerWeek} por semana</p>
            <Slider
              min={1} max={7} value={answers.interviewsPerWeek} onChange={(v) => update("interviewsPerWeek", v)}
              icons={[Handshake, CalendarCheck, Flame]} labels={["1", "4", "7"]} caption={interviewCaption}
            />
          </>
        )}

        {id === "blockers" && (
          <div className="flow-list">
            {BLOCKERS.map(({ label, icon: Icon }) => (
              <button type="button" key={label} className={card(answers.blockers.includes(label))} onClick={() => toggle("blockers", label)}>
                <Icon size={18} /> <strong>{label}</strong>
              </button>
            ))}
          </div>
        )}

        {id === "insight" && (
          <div className="flow-card insight">
            <Mascot variant="idea" className="flow-mascot" />
            <p>
              Em média, <b>1 a cada 10–15 candidaturas</b> vira entrevista. Para chegar a{" "}
              <b>{answers.interviewsPerWeek} entrevista{answers.interviewsPerWeek > 1 ? "s" : ""} por semana</b>, o ideal é enviar cerca de:
            </p>
            <strong className="flow-number">{weekly} candidaturas/semana</strong>
            <p className="flow-muted">
              A EmpreGatos busca vagas compatíveis e envia por você, todos os dias, para manter esse ritmo sem esforço.
            </p>
          </div>
        )}

        {id === "resume" && (
          <>
            <div className="flow-list">
              {([
                ["upload", "Já tenho currículo", "Envie seu PDF ou DOCX e veja sua nota.", Upload],
                ["build", "Ainda não tenho", "Criamos um com perguntas simples.", WandSparkles],
                ["later", "Prefiro depois", "Quero ver as vagas primeiro.", FileText],
              ] as const).map(([cid, t, d, Icon]) => (
                <button type="button" key={cid} className={card(answers.resumeChoice === cid)} onClick={() => update("resumeChoice", cid)}>
                  <Icon size={18} /> <span><strong>{t}</strong><small>{d}</small></span>
                </button>
              ))}
            </div>
            {answers.resumeChoice === "upload" && (
              <div className="flow-upload">
                {hasResume ? (
                  <p className="flow-ok"><Check size={15} /> {uploadName || w.resumes[0].name} · salvo</p>
                ) : (
                  <>
                    <input
                      type="file" accept=".pdf,.docx" disabled={action.isPending}
                      onChange={(e) => {
                        const chosen = e.target.files?.[0] || null;
                        if (chosen && chosen.size > 5 * 1024 * 1024) { setError("Escolha um arquivo de até 5 MB."); return; }
                        setError(""); setFile(chosen);
                      }}
                    />
                    <button
                      type="button" className="flow-secondary" disabled={!file || action.isPending}
                      onClick={() => {
                        if (!file) return;
                        const form = new FormData();
                        form.append("file", file);
                        action.mutate({ path: "/resumes", body: form }, {
                          onSuccess: () => { setUploadName(file.name); toast("Currículo enviado. Calculando sua nota…"); },
                        });
                      }}
                    >
                      <Upload size={15} /> {action.isPending ? "Lendo seu currículo…" : "Enviar currículo"}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {id === "score" && (w.resumes[0] ? <ResumeScore resume={w.resumes[0]} /> : <p className="flow-muted">Calculando…</p>)}
        {id === "score" && (
          <p className="flow-muted center">
            Depois do cadastro, abra <b>Currículo Perfeito</b> para corrigir cada ponto e subir sua nota.
          </p>
        )}

        {id === "experience" && (
          <label className="flow-field">
            <span>Empregos, bicos, voluntariado ou projetos (opcional)</span>
            <textarea rows={6} value={answers.experience} onChange={(e) => update("experience", e.target.value)}
              placeholder="Ex.: 2 anos como atendente; curso técnico em informática." />
          </label>
        )}

        {id === "contracts" && (
          <>
            <div className="flow-chips">
              {CONTRACTS.map((c) => (
                <button type="button" key={c} className={card(answers.contracts.includes(c))} onClick={() => toggle("contracts", c)}>
                  {answers.contracts.includes(c) && <Check size={14} />} {c}
                </button>
              ))}
            </div>
            <label className="flow-field">
              <span>Salário mínimo por mês (opcional)</span>
              <input type="number" min={0} value={answers.salaryMin || ""} placeholder="R$"
                onChange={(e) => update("salaryMin", Number(e.target.value))} />
            </label>
          </>
        )}

        {id === "review" && (
          <>
            <div className="flow-card flow-summary">
              {[
                ["Procura", answers.goal, 0],
                ["Momento", answers.seniority, 1],
                ["Local", [answers.country, answers.location, answers.modalities.join(", ")].filter(Boolean).join(" · "), 3],
                ["Meta", `${answers.interviewsPerWeek} entrevistas/semana em ${answers.timelineMonths >= 6 ? "6+" : answers.timelineMonths} ${answers.timelineMonths === 1 ? "mês" : "meses"}`, 5],
                ["Vagas", answers.contracts.join(", ") + (answers.salaryMin ? ` · a partir de R$ ${answers.salaryMin.toLocaleString("pt-BR")}` : ""), flow.indexOf("contracts")],
              ].map(([t, v, target]) => (
                <div key={t as string}>
                  <small>{t}</small>
                  <p>{v || "—"}</p>
                  <button type="button" onClick={() => setStep(target as number)}>Editar</button>
                </div>
              ))}
            </div>
            <label className="flow-field">
              <span>Onde pesquisar primeiro? (opcional)</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} disabled={registry.isPending || finishing}>
                <option value="">Usar minhas fontes atuais</option>
                {registry.data?.map((s) => (
                  <option key={s.type + ":" + s.board} value={s.type + ":" + s.board}>{s.company} · {s.sector}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {error && <p className="flow-error" role="alert">{error}</p>}
        {action.isError && !error && <p className="flow-error" role="alert">{action.error?.message}</p>}

        <footer className="flow-footer">
          <button className="flow-primary" disabled={action.isPending || finishing}>
            {finishing ? "Preparando sua busca…" : id === "review" ? "Ver vagas compatíveis" : "Continuar"}
          </button>
        </footer>
      </form>
    </section>
  );
}
