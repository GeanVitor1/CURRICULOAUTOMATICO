import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  Download,
  Eye,
  Link2,
  Lock,
  FileText,
  ListChecks,
  MessageSquareText,
  Scale,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Logo, Mascot } from "./components";
import { Reveal, spotlightHandler, useInViewport, useLoopStep, useScrollProgress } from "./motion";

/* ---------- Step Path: linha pontilhada desenhada conforme o scroll ---------- */
const pathSteps = [
  { icon: UserRound, title: "Envie seu currículo", text: "Lemos seu stack, sua senioridade e seus projetos." },
  { icon: SlidersHorizontal, title: "Defina a direção", text: "Cargos de TI, remoto ou presencial, salário e CLT ou PJ." },
  { icon: Search, title: "Vagas do seu stack", text: "Só vagas de TI que pedem as tecnologias que você tem." },
  { icon: ListChecks, title: "Acompanhe tudo", text: "Cada candidatura com o status real e o próximo passo." },
];

type PathGeometry = { w: number; h: number; d: string; stops: number[] };

/** Caminho curvo que passa pelo centro de cada nó (horizontal ou vertical). */
function buildPath(points: { x: number; y: number }[]): Omit<PathGeometry, "w" | "h"> {
  if (points.length < 2) return { d: "", stops: [0] };
  let d = `M${points[0].x} ${points[0].y}`;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(18, len * 0.12) * (i % 2 ? 1 : -1);
    const nx = (-dy / len) * bend;
    const ny = (dx / len) * bend;
    d += ` C${a.x + dx / 3 + nx} ${a.y + dy / 3 + ny} ${a.x + (2 * dx) / 3 + nx} ${a.y + (2 * dy) / 3 + ny} ${b.x} ${b.y}`;
    lengths.push(lengths[i - 1] + len);
  }
  const total = lengths[lengths.length - 1] || 1;
  return { d, stops: lengths.map((l) => l / total) };
}

export function StepPath() {
  const [ref, progress] = useScrollProgress<HTMLElement>();
  const trackRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<PathGeometry>({ w: 0, h: 0, d: "", stops: [0, 1 / 3, 2 / 3, 1] });
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const box = track.getBoundingClientRect();
      const points = [...track.querySelectorAll<HTMLElement>(".step-path-node")].map((n) => {
        const r = n.getBoundingClientRect();
        return { x: Math.round(r.left - box.left + r.width / 2), y: Math.round(r.top - box.top + r.height / 2) };
      });
      setGeo({ w: Math.round(box.width), h: Math.round(box.height), ...buildPath(points) });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(track);
    return () => observer?.disconnect();
  }, []);
  // A linha termina um pouco antes do fim da seção; os nós acendem quando a ponta os alcança.
  const drawn = Math.max(0, Math.min(1, (progress - 0.04) * 1.45));
  const reachedCount = progress <= 0.02 ? 0 : geo.stops.filter((s) => drawn >= s - 0.005).length;
  return (
    <section
      ref={ref}
      className="step-path landing-width"
      aria-labelledby="step-path-title"
      style={{ "--path-progress": drawn } as CSSProperties}
    >
      <Reveal className="step-path-head">
        <div className="landing-kicker">O CAMINHO</div>
        <h2 id="step-path-title">Quatro passos, um lugar só.</h2>
      </Reveal>
      <div className="step-path-track" ref={trackRef}>
        {geo.d && (
          <svg
            className="step-path-line"
            aria-hidden="true"
            width={geo.w}
            height={geo.h}
            viewBox={`0 0 ${geo.w} ${geo.h}`}
          >
            <path className="base" d={geo.d} />
            <path
              className="drawn"
              d={geo.d}
              pathLength={1}
              style={{ strokeDashoffset: 1 - drawn }}
            />
          </svg>
        )}
        <ol>
          {pathSteps.map((s, i) => (
            <li
              key={s.title}
              className={`${reachedCount > i ? "is-reached" : ""} ${reachedCount === i + 1 && drawn < 1 ? "is-current" : ""}`}
            >
              <span className="step-path-node" aria-hidden="true">
                <s.icon size={20} />
              </span>
              <span className="step-path-index">0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Bento de funcionalidades (apenas o que existe no produto) ---------- */
const features = [
  {
    size: "wide",
    icon: FileText,
    title: "Currículo guiado",
    text: "Perguntas simples, uma por etapa. Revise, ajuste e baixe o PDF para usar onde quiser.",
    mascot: "writing" as const,
  },
  {
    size: "tall",
    icon: Scale,
    title: "Compatibilidade explicada",
    text: "Veja quais tecnologias da vaga você domina e o que falta. A comparação não prevê uma contratação.",
  },
  {
    size: "",
    icon: Search,
    title: "Vagas com origem",
    text: "Cada oportunidade preserva a fonte e o link original do anúncio.",
  },
  {
    size: "",
    icon: Send,
    title: "Envio em portais conectados",
    text: "Com o portal conectado e a rotina ativada, envios compatíveis seguem; o status só muda com confirmação.",
  },
  {
    size: "",
    icon: MessageSquareText,
    title: "Perguntas pendentes",
    text: "Quando um formulário pede respostas, ele espera por você em vez de chutar.",
  },
  {
    size: "",
    icon: ShieldCheck,
    title: "Seus dados, suas regras",
    text: "Exporte ou exclua sua conta nas configurações. Análise externa só com seu consentimento.",
  },
];

/* Mini-demos ilustrativas: loops lentos, pausados fora da tela e em reduced-motion. */
function ResumeDemo() {
  const [ref, step, live] = useLoopStep<HTMLDivElement>(3, 2600);
  const labels = ["Lendo suas respostas", "Revisando o texto", "PDF pronto para baixar"];
  return (
    <div ref={ref} className={`bento-demo resume-demo stage-${step} ${live ? "is-live" : ""}`} aria-hidden="true">
      <div className="resume-sheet">
        <i className="w60" />
        <i className="w90" />
        <i className="w80" />
        <i className="w70" />
        <span className="resume-scan" />
      </div>
      <div className="resume-status">
        <span className="resume-label" key={step}>
          {step === 2 ? <Check size={13} /> : <FileText size={13} />}
          {labels[step]}
        </span>
        <span className="resume-bar"><b /></span>
      </div>
    </div>
  );
}

const matchRows = [
  { label: "Atendimento ao público", state: "em comum" },
  { label: "Pacote Office", state: "em comum" },
  { label: "Modalidade presencial", state: "conferir" },
  { label: "Inglês intermediário", state: "conferir" },
];
function MatchDemo() {
  const [ref, step, live] = useLoopStep<HTMLDivElement>(matchRows.length + 1, 1500);
  return (
    <div ref={ref} className={`bento-demo match-demo ${live ? "is-live" : "is-static"}`} aria-hidden="true">
      <div className="match-job">
        <BriefcaseBusiness size={16} />
        <div>
          <strong>Assistente administrativo</strong>
          <span>Vaga de exemplo</span>
        </div>
      </div>
      <ul>
        {matchRows.map((row, i) => (
          <li key={row.label} className={`${row.state === "em comum" ? "ok" : "check"} ${!live || step > i ? "is-on" : ""}`}>
            <span className="match-dot">{row.state === "em comum" ? <Check size={12} /> : <Eye size={12} />}</span>
            <span>{row.label}</span>
            <em>{row.state}</em>
          </li>
        ))}
      </ul>
      <p className="match-note">A comparação explica; quem decide é você.</p>
    </div>
  );
}

const sourceTabs = ["Listagens públicas", "Anúncios de empresas", "Links originais"];
function SourceDemo() {
  const [ref, step] = useLoopStep<HTMLDivElement>(sourceTabs.length, 2200);
  return (
    <div ref={ref} className="bento-demo source-demo" aria-hidden="true">
      <div className="source-filters">
        {sourceTabs.map((t, i) => (
          <span key={t} className={i === step ? "is-on" : ""}>{t.split(" ")[0]}</span>
        ))}
      </div>
      <div className="bento-source-row" key={step}>
        <Link2 size={13} />
        <span>{sourceTabs[step]}</span>
      </div>
    </div>
  );
}

const sendStates = ["Pronta para envio", "Aguardando confirmação", "Confirmada"];
function SendDemo() {
  const [ref, step] = useLoopStep<HTMLDivElement>(sendStates.length, 2300);
  return (
    <div ref={ref} className={`bento-demo send-demo state-${step}`} aria-hidden="true">
      <span className="send-track"><b /></span>
      <span className="send-status" key={step}>
        {step === 2 ? <Check size={13} /> : <Clock3 size={13} />}
        {sendStates[step]}
      </span>
    </div>
  );
}

function QuestionDemo() {
  const [ref, , live] = useLoopStep<HTMLDivElement>(2, 3000);
  return (
    <div ref={ref} className={`bento-demo question-demo ${live ? "is-live" : ""}`} aria-hidden="true">
      <span className="question-bubble">
        Pretensão salarial?
        <span className="question-dots"><i /><i /><i /></span>
      </span>
      <span className="question-badge">Requer sua ação</span>
    </div>
  );
}

function DataDemo() {
  const [ref, step] = useLoopStep<HTMLDivElement>(2, 2800);
  return (
    <div ref={ref} className="bento-demo data-demo" aria-hidden="true">
      {["Exportar meus dados", "Excluir minha conta"].map((t, i) => (
        <span key={t} className={i === step ? "is-on" : ""}>
          {i === 0 ? <Download size={13} /> : <Lock size={13} />}
          {t}
        </span>
      ))}
    </div>
  );
}

const bentoDemos = [ResumeDemo, MatchDemo, SourceDemo, SendDemo, QuestionDemo, DataDemo];

export function FeatureBento() {
  return (
    <section className="bento-section landing-width" aria-labelledby="bento-title">
      <Reveal className="bento-head">
        <div className="landing-kicker">O QUE VOCÊ ENCONTRA</div>
        <h2 id="bento-title">
          Ferramentas pequenas.
          <br />
          Diferença grande.
        </h2>
      </Reveal>
      <div className="bento-grid">
        {features.map((f, i) => {
          const Demo = bentoDemos[i];
          const spot = i === 0 || i === 1 || i === 3;
          return (
            <Reveal
              as="article"
              key={f.title}
              delay={i * 70}
              className={`bento-card ${f.size} ${spot ? "has-spot" : ""}`}
              onPointerMove={spot ? spotlightHandler : undefined}
            >
              <span className="bento-icon" aria-hidden="true">
                <f.icon size={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <Demo />
              {f.mascot && <Mascot className="bento-mascot" variant={f.mascot} decorative />}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Frase única com focus reveal ---------- */
export function FocusPhrase({ text }: { text: string }) {
  const [ref, progress] = useScrollProgress<HTMLElement>();
  const words = text.split(" ");
  const lit = progress * 1.6 * words.length;
  return (
    <section ref={ref} className="focus-phrase landing-width" aria-label={text}>
      <p aria-hidden="true">
        {words.map((w, i) => (
          <span key={`${w}-${i}`} className={lit > i ? "is-lit" : ""}>
            {w}{" "}
          </span>
        ))}
      </p>
    </section>
  );
}

/* ---------- Rodapé tipográfico ---------- */
export function LandingFooter() {
  const [ref, inView] = useInViewport<HTMLElement>({ threshold: 0.2 });
  return (
    <footer ref={ref} className={`landing-footer-v2 ${inView ? "is-in" : ""}`}>
      <div className="landing-width footer-v2-inner">
        <div className="footer-v2-top">
          <a href="/" className="landing-brand" aria-label="EmpreGatos início">
            <Logo small />
            <span>empregatos.</span>
          </a>
          <nav aria-label="Rodapé">
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
            <a href="#perguntas">Perguntas</a>
            <a href="/login">Entrar</a>
            <a href="/register">
              Criar conta <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a href="/privacy">Privacidade</a>
          </nav>
        </div>
        <p className="footer-v2-word" aria-hidden="true">
          EmpreGatos
          <Mascot className="footer-v2-mascot" variant="welcome" decorative />
        </p>
        <div className="footer-v2-bottom">
          <span>Suas oportunidades. Seu ritmo.</span>
          <span>© {new Date().getFullYear()} EmpreGatos</span>
        </div>
      </div>
    </footer>
  );
}
