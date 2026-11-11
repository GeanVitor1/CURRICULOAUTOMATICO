import type { CSSProperties } from "react";
import {
  ArrowUpRight,
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
import { Reveal, spotlightHandler, useInViewport, useScrollProgress } from "./motion";

/* ---------- Step Path: linha pontilhada desenhada conforme o scroll ---------- */
const pathSteps = [
  { icon: UserRound, title: "Conte sobre você", text: "Perfil e currículo em etapas curtas, com PDF ao final." },
  { icon: SlidersHorizontal, title: "Defina a direção", text: "Cidade, modalidade, salário e tipo de contratação." },
  { icon: Search, title: "Revise as vagas", text: "Oportunidades com a fonte e o link do anúncio original." },
  { icon: ListChecks, title: "Acompanhe tudo", text: "Cada candidatura com o status real e o próximo passo." },
];

export function StepPath() {
  const [ref, progress] = useScrollProgress<HTMLElement>();
  const reached = Math.floor(progress * (pathSteps.length + 0.4));
  return (
    <section
      ref={ref}
      className="step-path landing-width"
      aria-labelledby="step-path-title"
      style={{ "--path-progress": progress } as CSSProperties}
    >
      <Reveal className="step-path-head">
        <div className="landing-kicker">O CAMINHO</div>
        <h2 id="step-path-title">Quatro passos, um lugar só.</h2>
      </Reveal>
      <div className="step-path-track">
        <svg className="step-path-line" aria-hidden="true" preserveAspectRatio="none">
          <line className="base" x1="0" y1="0" x2="100%" y2="0" />
          <line className="drawn" x1="0" y1="0" x2="100%" y2="0" pathLength={1} />
        </svg>
        <ol>
          {pathSteps.map((s, i) => (
            <li key={s.title} className={reached > i ? "is-reached" : ""}>
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
    text: "Veja os requisitos em comum e o que conferir. A comparação não prevê uma contratação.",
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
        {features.map((f, i) => (
          <Reveal
            as="article"
            key={f.title}
            delay={i * 70}
            className={`bento-card ${f.size}`}
            onPointerMove={spotlightHandler}
          >
            <span className="bento-icon" aria-hidden="true">
              <f.icon size={20} />
            </span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            {f.mascot && <Mascot className="bento-mascot" variant={f.mascot} decorative />}
          </Reveal>
        ))}
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
