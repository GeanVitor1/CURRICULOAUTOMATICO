import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Search,
  BriefcaseBusiness,
  MapPin,
  ShieldCheck,
  Bookmark,
  SlidersHorizontal,
  Menu,
  X,
  Plus,
  HeartPulse,
  Truck,
  GraduationCap,
  ShoppingBag,
  Monitor,
  Building2,
  Users,
  Play,
  Clock3,
  ChartNoAxesColumnIncreasing,
  ListChecks,
  CircleDollarSign,
  Info,
} from "lucide-react";
import { Logo, Mascot } from "./components";
import "./landing.css";
import "./demo.css";
import "./landing-hero.css";
import "./landing-preferences.css";
import "./landing-theme.css";
import WorkflowDemo, { demoStages } from "./WorkflowDemo";
import OrganizationDemo from "./OrganizationDemo";

const professions = [
  ["Primeiro emprego", Users],
  ["Atendimento", ShoppingBag],
  ["Administrativo", Building2],
  ["Vendas", BriefcaseBusiness],
  ["Logística", Truck],
  ["Saúde", HeartPulse],
  ["Educação", GraduationCap],
  ["Tecnologia", Monitor],
] as const;
const steps = demoStages;
const faqs = [
  [
    "Preciso ter experiência?",
    "Não. Você pode começar pelo primeiro emprego, por uma vaga de aprendiz ou estágio. Experiências informais, estudos e habilidades também podem compor seu perfil.",
  ],
  [
    "E se eu ainda não tiver currículo?",
    "O construtor faz perguntas simples, uma por etapa. Ao terminar, você pode baixar um PDF, conferir suas informações e usá-lo nas candidaturas.",
  ],
  [
    "A EmpreGatos envia meu currículo automaticamente?",
    "Você pode buscar e preparar candidaturas para finalizar no site oficial. O envio automático depende de conectar sua conta a um portal compatível, confirmar o currículo e ativar a rotina. Perguntas sem resposta ou verificações do portal ficam pendentes. O status só muda para enviada com sua confirmação ou uma confirmação de envio do portal.",
  ],
  [
    "Preciso conectar meu LinkedIn?",
    "Não. LinkedIn, GitHub e portfólio não são requisitos para usar a plataforma. Inclua apenas o que fizer sentido para sua profissão.",
  ],
  [
    "Como sei de onde vem uma vaga?",
    "Cada oportunidade encontrada preserva a fonte e o link do anúncio original. Confira a descrição e a empresa no canal oficial. A publicação numa API não é uma garantia contra fraude; nunca pague para participar de uma seleção.",
  ],
  [
    "Como meus dados são tratados?",
    "Seu currículo e histórico ficam associados à sua conta. Você pode exportar os dados ou excluir sua conta nas configurações. A análise local funciona sem enviar dados a um provedor de IA; análise externa exige consentimento e informa o provedor.",
  ],
  [
    "Funciona para qualquer profissão?",
    "Você pode informar qualquer profissão e suas preferências. As oportunidades dependem das empresas e regiões cobertas pelas fontes cadastradas. Se não houver cobertura ou resultados, a plataforma informa isso.",
  ],
];

export default function Landing() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const pageProgress = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 30,
  });
  const pointerY = useMotionValue(0),
    pointerX = useMotionValue(0);
  const mascotY = useSpring(pointerY, { stiffness: 75, damping: 24 }),
    mascotX = useSpring(pointerX, { stiffness: 75, damping: 24 });
  const stickerY = useTransform(mascotY, (v) => -v * 0.6);
  const [playing, setPlaying] = useState(true);
  const heroPlaying = reduced === false;
  const [menu, setMenu] = useState(false);
  const [step, setStep] = useState(0);
  const [organized, setOrganized] = useState(reduced === true);
  const [organizationRevision, setOrganizationRevision] = useState(0);
  const [modality, setModality] = useState("Presencial");
  const [filterOpen, setFilterOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const publicHeader = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewVisible = useInView(previewRef, { amount: 0.25 });
  const organizationRef = useRef<HTMLDivElement>(null);
  const organizationVisible = useInView(organizationRef, { amount: 0.2 });
  const modalityControl = useRef<HTMLDivElement>(null);
  const modalityTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu && !filterOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filterOpen) {
        setFilterOpen(false);
        modalityTrigger.current?.focus();
      } else if (menu) {
        setMenu(false);
        menuTrigger.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menu && !publicHeader.current?.contains(event.target)) setMenu(false);
      if (filterOpen && !modalityControl.current?.contains(event.target))
        setFilterOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [menu, filterOpen]);
  useEffect(() => {
    if (filterOpen)
      modalityControl.current
        ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
        ?.focus();
  }, [filterOpen]);
  const chooseStep = (index: number) => {
    setPlaying(false);
    setStep(index);
  };
  const chooseOrganization = (value: boolean) => {
    setOrganized(value);
    setOrganizationRevision((revision) => revision + 1);
  };
  const tabKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    count: number,
    orientation: "vertical" | "horizontal",
    select: (index: number) => void,
  ) => {
    const previous = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : event.key === previous
            ? (index + count - 1) % count
            : event.key === next
              ? (index + 1) % count
              : null;
    if (target === null) return;
    event.preventDefault();
    select(target);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [target]?.focus();
  };
  useEffect(() => {
    if (!playing || reduced || !previewVisible) return;
    const timer = setInterval(() => {
      if (!document.hidden) setStep((old) => (old + 1) % steps.length);
    }, 3600);
    return () => clearInterval(timer);
  }, [playing, reduced, previewVisible]);
  useEffect(() => {
    if (reduced !== false || !organizationVisible) return;
    const timer = setInterval(() => {
      if (
        !document.hidden &&
        !organizationRef.current
          ?.closest("section")
          ?.contains(document.activeElement)
      ) {
        setOrganized((value) => !value);
      }
    }, 4800);
    return () => clearInterval(timer);
  }, [reduced, organizationVisible, organizationRevision]);
  const reveal = {
    initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.08 },
    transition: {
      duration: reduced ? 0 : 0.65,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  };
  return (
    <div className="landing">
      {!reduced && (
        <motion.div
          className="reading-progress"
          style={{ scaleX: pageProgress }}
          aria-hidden="true"
        />
      )}
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <header ref={publicHeader} className="landing-nav landing-width">
        <a href="/" className="landing-brand" aria-label="EmpreGatos início">
          <Logo />
          <span>
            empregatos<span>.</span>
          </span>
        </a>
        <nav
          id="public-navigation"
          aria-label="Navegação principal"
          className={menu ? "visible" : ""}
        >
          <a href="#como-funciona" onClick={() => setMenu(false)}>
            Como funciona
          </a>
          <a href="#para-voce" onClick={() => setMenu(false)}>
            Feito para você
          </a>
          <a href="#perguntas" onClick={() => setMenu(false)}>
            Perguntas frequentes
          </a>
        </nav>
        <div className="landing-nav-actions">
          <a href="/login" className="landing-login">
            Entrar <ArrowUpRight size={15} />
          </a>
          <a href="/register" className="landing-button primary">
            Começar grátis <ArrowRight size={16} />
          </a>
          <button
            ref={menuTrigger}
            type="button"
            className="landing-menu"
            aria-label={menu ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menu}
            aria-controls="public-navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1}>
        <section className="hero landing-width">
          <motion.div
            className="hero-copy"
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.6 }}
          >
            <div className="landing-kicker">
              <span /> O SEU PRÓXIMO PASSO COMEÇA AQUI
            </div>
            <h1>
              <span className="hero-heading-main">
                Encontrar um emprego já dá trabalho.
              </span>{" "}
              <span className="hero-heading-accent">
                Procurar não deveria dar tanto.
              </span>
            </h1>
            <p>
              Conte sobre você, escolha o que procura e descubra oportunidades
              que combinam com seu perfil. Tudo em um só lugar.
            </p>
            <div className="hero-actions">
              <a href="/register" className="landing-button primary">
                Encontrar meu próximo emprego <ArrowUpRight size={19} />
              </a>
              <a href="#como-funciona" className="landing-button plain">
                <span className="hero-play-icon">
                  <Play size={17} aria-hidden="true" />
                </span>
                Veja como funciona
              </a>
            </div>
            <div className="hero-note">
              <ShieldCheck size={15} /> Você decide onde e quando se candidatar.
            </div>
          </motion.div>
          <motion.div
            className="hero-visual hero-visual-native"
            onPointerMove={(e) => {
              if (reduced || e.pointerType !== "mouse") return;
              const rect = e.currentTarget.getBoundingClientRect();
              pointerY.set((e.clientY - rect.top - rect.height / 2) * 0.025);
              pointerX.set((e.clientX - rect.left - rect.width / 2) * 0.02);
            }}
            onPointerLeave={() => {
              pointerY.set(0);
              pointerX.set(0);
            }}
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0 : 0.7,
              delay: reduced ? 0 : 0.12,
            }}
          >
            <div className="hero-sparkles" aria-hidden="true">
              <Plus />
              <Plus />
              <Plus />
              <Plus />
              <Plus />
            </div>
            <motion.div
              className="hero-artwork"
              style={reduced ? undefined : { y: mascotY, x: mascotX }}
            >
              <span className="hero-animation">
                <img
                  className="hero-mascot"
                  data-mascot="cover-animation"
                  src={
                    heroPlaying ? "/novogifcapa.gif" : "/novogifcapa-poster.png"
                  }
                  alt="Mascote da EmpreGatos: gato preto de terno e gravata azul, com uma pasta"
                  width={400}
                  height={225}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </span>
            </motion.div>
            <motion.div
              className="hero-profile-card"
              style={reduced ? undefined : { y: stickerY }}
            >
              <span className="hero-profile-icon">
                <ChartNoAxesColumnIncreasing size={25} aria-hidden="true" />
              </span>
              <p>
                Vagas que
                <br />
                combinam com você
              </p>
              <strong>Seu perfil</strong>
              <svg
                className="hero-profile-chart"
                viewBox="0 0 88 46"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 40C17 39 18 17 33 22S49 36 59 20S73 8 85 4"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>
            <motion.div
              className="hero-sticker"
              style={reduced ? undefined : { y: stickerY }}
              whileHover={reduced ? undefined : { y: -5, rotate: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 22 }}
            >
              <span className="hero-sticker-icon">
                <Bookmark size={23} aria-hidden="true" />
              </span>
              <div>
                <strong>Seu futuro merece atenção.</strong>
                <span>A gente ajuda a organizar o caminho.</span>
              </div>
            </motion.div>
          </motion.div>
        </section>
        <div className="flow-strip landing-width">
          {[
            "Seu currículo",
            "Vagas compatíveis",
            "Candidaturas organizadas",
          ].map((label, i) => {
            const Icon = [FileText, Search, ListChecks][i];
            return (
              <motion.span
                key={label}
                initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: reduced ? 0 : 0.4,
                  delay: reduced ? 0 : i * 0.15,
                }}
              >
                <i>0{i + 1}</i>
                <Icon className="flow-icon" size={21} aria-hidden="true" />
                {label}
                <ArrowRight
                  className="flow-arrow"
                  size={18}
                  aria-hidden="true"
                />
              </motion.span>
            );
          })}
          <span className="flow-end">
            <span className="flow-dot" aria-hidden="true" />
            MENOS ABAS. MAIS DIREÇÃO.
          </span>
        </div>

        <section id="como-funciona" className="how-section landing-width">
          <motion.div {...reveal} className="section-intro">
            <div>
              <div className="landing-kicker">
                SIMPLES DESDE O PRIMEIRO PASSO
              </div>
              <h2>
                Você tem um objetivo.
                <br />A gente ajuda com o caminho.
              </h2>
            </div>
            <p>
              Sem precisar entender de tecnologia. Sem se perder entre sites,
              arquivos e anotações.
            </p>
          </motion.div>
          <motion.div {...reveal} className="how-grid">
            <div
              className="step-list"
              role="tablist"
              aria-orientation="vertical"
              aria-label="Como funciona"
            >
              {steps.map((s, i) => (
                <button
                  key={s.title}
                  id={`step-tab-${i}`}
                  role="tab"
                  type="button"
                  tabIndex={step === i ? 0 : -1}
                  aria-selected={step === i}
                  aria-controls="step-preview"
                  onClick={() => chooseStep(i)}
                  onKeyDown={(event) =>
                    tabKey(event, i, steps.length, "vertical", chooseStep)
                  }
                  className={`step-button ${step === i ? "active" : ""}`}
                >
                  <span className="step-number">0{i + 1}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                  {step === i && (
                    <motion.span
                      className="step-active"
                      layoutId="step-active"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 32,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div
              id="step-preview"
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={`step-tab-${step}`}
              className="step-preview"
              ref={previewRef}
            >
              <div className="preview-label">
                <span className="live-dot on" /> PRÉVIA ILUSTRATIVA DA INTERFACE
              </div>
              <div className="preview-companion">
                <Mascot
                  className="preview-mascot"
                  variant={
                    step === 0
                      ? "writing"
                      : step === 1
                        ? "considering"
                        : "handing-resume"
                  }
                />
                <span>Seu companheiro em cada etapa.</span>
              </div>
              <div className="preview-sequence" aria-hidden="true">
                {steps.map((s, i) => (
                  <div key={s.title} className={step >= i ? "visited" : ""}>
                    <s.icon size={16} />
                    {i < steps.length - 1 && (
                      <span>
                        <motion.i
                          animate={{ scaleX: step > i ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.5 }}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <WorkflowDemo stage={step} playing={playing} />
              <button
                className="preview-play"
                aria-pressed={playing}
                onClick={() => setPlaying(!playing)}
                disabled={!!reduced}
              >
                {reduced
                  ? "Escolha cada etapa ao lado"
                  : playing
                    ? "Pausar demonstração"
                    : "Ver as etapas em movimento"}
                <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
        </section>

        <section id="para-voce" className="profession-section">
          <motion.div {...reveal} className="landing-width profession-grid">
            <div>
              <div className="landing-kicker">
                TODAS AS TRAJETÓRIAS TÊM LUGAR
              </div>
              <h2>
                O próximo passo
                <br />é <em>para você.</em>
              </h2>
              <p>
                Para quem está começando. Para quem quer mudar de área. Para
                quem sabe bem o que procura.
              </p>
              <a href="/register" className="landing-text-link">
                Conte o que você procura <ArrowUpRight size={18} />
              </a>
            </div>
            <div className="profession-list">
              {professions.map(([name, Icon], i) => (
                <motion.div
                  key={name}
                  initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: reduced ? 0 : undefined,
                    delay: reduced ? 0 : i * 0.035,
                  }}
                >
                  <Icon size={20} />
                  <span>{name}</span>
                  <span className="profession-index">0{i + 1}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section
          id="suas-preferencias"
          aria-labelledby="preferences-heading"
          className="preferences-section landing-width"
        >
          <motion.div {...reveal} className="preference-preview">
            <div className="preview-label">
              <span className="preference-heading-icon">
                <SlidersHorizontal size={21} aria-hidden="true" />
              </span>
              SUAS PREFERÊNCIAS
            </div>
            <h3>Trabalho bom é o que cabe na sua vida.</h3>
            <div className="preference-field">
              <span>Como você quer trabalhar?</span>
              <motion.div ref={modalityControl} layout className="morph-select">
                <button
                  ref={modalityTrigger}
                  type="button"
                  aria-expanded={filterOpen}
                  aria-controls="preview-modalities"
                  onClick={() => setFilterOpen(!filterOpen)}
                >
                  <MapPin size={20} aria-hidden="true" />
                  {modality}
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                <AnimatePresence>
                  {filterOpen && (
                    <motion.div
                      id="preview-modalities"
                      role="group"
                      aria-label="Opções de modalidade"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: reduced ? 0 : 0.2 }}
                    >
                      {["Presencial", "Híbrido", "Remoto"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={modality === m}
                          onClick={() => {
                            setModality(m);
                            setFilterOpen(false);
                            modalityTrigger.current?.focus();
                          }}
                        >
                          {m}
                          {modality === m && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
            <label className="preference-field">
              <span>Onde gostaria de trabalhar?</span>
              <span className="preference-input">
                <Building2 size={20} aria-hidden="true" />
                <input
                  aria-label="Cidade na prévia"
                  placeholder="Sua cidade e estado"
                />
              </span>
            </label>
            <label className="preference-field">
              <span>Salário desejado</span>
              <span className="preference-input">
                <CircleDollarSign size={20} aria-hidden="true" />
                <input
                  aria-label="Salário na prévia"
                  type="number"
                  min="0"
                  placeholder="Você também pode deixar em aberto"
                />
              </span>
            </label>
            <div className="preference-foot">
              <Info size={17} aria-hidden="true" />
              <span>
                Prévia interativa · Nenhuma consulta é executada aqui.
              </span>
            </div>
          </motion.div>
          <motion.div {...reveal} className="preference-copy">
            <div className="landing-kicker">VOCÊ ESCOLHE A DIREÇÃO</div>
            <h2 id="preferences-heading">
              Suas preferências
              <br />
              não são um detalhe.
            </h2>
            <p>
              Localização, salário, horário, experiência e contratação. Defina o
              que importa para você e ajuste quando sua vida mudar.
            </p>
            <div className="preference-principle">
              <span className="preference-shield">
                <ShieldCheck size={29} aria-hidden="true" />
              </span>
              <div>
                <strong>Compatibilidade com explicação.</strong>
                <p>
                  Veja os pontos em comum e o que precisa conferir. A pontuação
                  compara requisitos; ela não prevê uma contratação.
                </p>
              </div>
            </div>
            <a href="/register" className="landing-text-link">
              Encontrar minha direção{" "}
              <ArrowRight size={19} aria-hidden="true" />
            </a>
          </motion.div>
        </section>

        <section className="organization-section landing-width">
          <motion.div {...reveal} className="section-intro">
            <div>
              <div className="landing-kicker">
                MAIS CLAREZA. MENOS IDAS E VINDAS.
              </div>
              <h2>
                Da busca espalhada
                <br />
                ao próximo passo à vista.
              </h2>
            </div>
            <div
              className="organization-toggle"
              role="tablist"
              aria-label="Visualizar organização"
            >
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  id={`organization-tab-${Number(v)}`}
                  role="tab"
                  type="button"
                  tabIndex={organized === v ? 0 : -1}
                  aria-selected={organized === v}
                  aria-controls="organization-preview"
                  onClick={() => chooseOrganization(v)}
                  onKeyDown={(event) =>
                    tabKey(event, Number(v), 2, "horizontal", (index) =>
                      chooseOrganization(Boolean(index)),
                    )
                  }
                >
                  {v ? "Tudo organizado" : "Antes"}
                  {organized === v && (
                    <motion.span
                      layoutId="organization-tab"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
          <motion.div
            {...reveal}
            ref={organizationRef}
            id="organization-preview"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={`organization-tab-${Number(organized)}`}
            className={`organization-visual ${organized ? "organized" : "dispersed"}`}
          >
            <div className="organization-visual-head">
              <Logo small />
              <strong>
                {organized
                  ? "Seu espaço na EmpreGatos"
                  : "Procurando em vários lugares"}
              </strong>
              <span>PRÉVIA ILUSTRATIVA</span>
            </div>
            <OrganizationDemo organized={organized} />
            <div className="organization-visual-foot">
              {organized ? <Check size={16} /> : <Clock3 size={16} />}
              {organized
                ? "Suas oportunidades reunidas, analisadas e organizadas."
                : "Sites diferentes. Anotações soltas. Próximos passos difíceis de encontrar."}
            </div>
          </motion.div>
        </section>

        <section id="perguntas" className="faq-section landing-width">
          <motion.div {...reveal}>
            <div className="landing-kicker">PODE PERGUNTAR</div>
            <h2>
              O primeiro passo
              <br />
              sem dúvidas.
            </h2>
            <p>Algumas respostas antes de começar.</p>
          </motion.div>
          <motion.div {...reveal} className="faq-list">
            {faqs.map(([q, a], i) => (
              <div className={`faq-item ${faq === i ? "open" : ""}`} key={q}>
                <h3>
                  <button
                    aria-expanded={faq === i}
                    aria-controls={`faq-${i}`}
                    onClick={() => setFaq(faq === i ? null : i)}
                  >
                    {q}
                    <Plus size={18} />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {faq === i && (
                    <motion.div
                      id={`faq-${i}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.2 }}
                    >
                      <p>{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </motion.div>
        </section>

        <section className="final-cta landing-width">
          <motion.div {...reveal}>
            <div className="landing-kicker">O SEU PRÓXIMO CAPÍTULO</div>
            <h2>
              Você não precisa organizar
              <br />
              esse caminho sozinho.
            </h2>
            <p>Um currículo. Suas preferências. Um passo de cada vez.</p>
            <a href="/register" className="landing-button primary">
              Vamos encontrar seu próximo emprego <ArrowUpRight size={18} />
            </a>
          </motion.div>
          <Mascot className="cta-mascot" variant="idea" />
        </section>
      </main>
      <footer className="landing-footer landing-width">
        <a href="/" className="landing-brand">
          <Logo small />
          <span>empregatos.</span>
        </a>
        <p>Suas oportunidades. Seu ritmo.</p>
        <div>
          <a href="/login">Entrar</a>
          <a href="/register">Criar conta</a>
          <a href="/privacy">Privacidade</a>
        </div>
        <span>FEITO PARA O SEU PRÓXIMO PASSO.</span>
      </footer>
    </div>
  );
}
