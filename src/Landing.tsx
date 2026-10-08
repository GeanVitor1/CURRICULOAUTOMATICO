import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
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
} from "lucide-react";
import { Logo, Mascot, Panel, StatusBadge } from "./components";
import "./landing.css";

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
const steps = [
  {
    title: "Conte sobre você.",
    text: "Envie seu currículo ou crie um do zero. Experiência informal também conta.",
    icon: FileText,
  },
  {
    title: "Descubra oportunidades.",
    text: "Consulte vagas publicadas em fontes reais. Compare os requisitos com o seu perfil.",
    icon: Search,
  },
  {
    title: "Acompanhe cada passo.",
    text: "Salve o que interessa e registre suas candidaturas. Você sempre sabe o próximo passo.",
    icon: BriefcaseBusiness,
  },
];
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
    "As fontes públicas usam o modo assistido: você abre a vaga oficial e finaliza o envio. O status só muda para enviada com sua confirmação ou um recibo de uma integração de envio autorizada.",
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
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [step, setStep] = useState(0);
  const [organized, setOrganized] = useState(true);
  const [modality, setModality] = useState("Presencial");
  const [filterOpen, setFilterOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  useEffect(() => {
    if (!playing || reduced) return;
    const timer = setInterval(() => setStep((old) => (old + 1) % 3), 3600);
    return () => clearInterval(timer);
  }, [playing, reduced]);
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
      <header className="landing-nav landing-width">
        <a href="/" className="landing-brand" aria-label="EmpreGatos início">
          <Logo />
          <span>
            empregatos<span>.</span>
          </span>
        </a>
        <nav aria-label="Navegação principal" className={menu ? "visible" : ""}>
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
            Começar <ArrowRight size={15} />
          </a>
          <button
            className="landing-menu"
            aria-label={menu ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="conteudo">
        <section className="hero landing-width">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="landing-kicker">
              <span /> O SEU PRÓXIMO PASSO COMEÇA AQUI
            </div>
            <h1>
              Encontrar um emprego já dá trabalho.
              <br />
              <span>Procurar não deveria dar tanto.</span>
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
                Veja como funciona <ArrowRight size={16} />
              </a>
            </div>
            <div className="hero-note">
              <ShieldCheck size={15} /> Você decide onde e quando se candidatar.
            </div>
          </motion.div>
          <motion.div
            className="hero-visual"
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
          >
            <div className="hero-image-label">
              <span>UM NOVO CAPÍTULO</span>
              <span>↗</span>
            </div>
            <motion.div
              style={reduced ? undefined : { y: mascotY, x: mascotX }}
            >
              <Mascot className="hero-mascot" eager />
            </motion.div>
            <motion.div
              className="hero-sticker"
              style={reduced ? undefined : { y: stickerY }}
              whileHover={reduced ? undefined : { y: -5, rotate: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 22 }}
            >
              <Bookmark size={17} />
              <div>
                <strong>Seu futuro merece atenção.</strong>
                <span>A gente ajuda a organizar o caminho.</span>
              </div>
            </motion.div>
            <div className="hero-caption">
              <span>Seu companheiro de busca.</span>
              <span>DO PRIMEIRO EMPREGO AO PRÓXIMO DESAFIO</span>
            </div>
          </motion.div>
        </section>
        <div className="flow-strip landing-width">
          {[
            "Seu currículo",
            "Vagas compatíveis",
            "Candidaturas organizadas",
          ].map((label, i) => (
            <motion.span
              key={label}
              initial={{ opacity: 0, x: reduced ? 0 : -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: reduced ? 0 : i * 0.15 }}
            >
              <i>0{i + 1}</i>
              {label}
              {i < 2 && <ArrowRight size={14} />}
            </motion.span>
          ))}
          <span className="flow-end">MENOS ABAS. MAIS DIREÇÃO.</span>
        </div>

        <motion.section
          {...reveal}
          id="como-funciona"
          className="how-section landing-width"
        >
          <div className="section-intro">
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
          </div>
          <div className="how-grid">
            <div
              className="step-list"
              role="tablist"
              aria-label="Como funciona"
            >
              {steps.map((s, i) => (
                <button
                  key={s.title}
                  id={`step-tab-${i}`}
                  role="tab"
                  aria-selected={step === i}
                  aria-controls="step-preview"
                  onClick={() => setStep(i)}
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
              aria-labelledby={`step-tab-${step}`}
              className="step-preview"
            >
              <div className="preview-label">
                <span className="live-dot on" /> PRÉVIA ILUSTRATIVA DA INTERFACE
              </div>
              <div className="preview-sequence" aria-hidden="true">
                {steps.map((s, i) => (
                  <div key={s.title} className={step >= i ? "visited" : ""}>
                    <s.icon size={16} />
                    {i < 2 && (
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
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{
                    opacity: 0,
                    y: 10,
                    filter: reduced ? "none" : "blur(3px)",
                  }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  {step === 0 ? (
                    <Panel
                      title="Seu currículo, do seu jeito"
                      detail="Experiências reais. Uma história que é sua."
                    >
                      <div className="illustration-document">
                        <FileText size={26} />
                        <strong>Nome da pessoa</strong>
                        <span>Objetivo profissional</span>
                        <hr />
                        <div className="illustration-line" />
                        <div className="illustration-line short" />
                        <small>Formação · Experiências · Competências</small>
                      </div>
                      <div className="preview-foot">
                        <Check size={16} /> Envie um arquivo ou construa seu
                        PDF.
                      </div>
                    </Panel>
                  ) : step === 1 ? (
                    <Panel
                      title="Encontre o que faz sentido"
                      detail="Sempre com o link da publicação original."
                    >
                      <div className="job-card public-job">
                        <div className="public-job-top">
                          <span className="company-logo">
                            <Building2 size={20} />
                          </span>
                          <div>
                            <strong>Empresa da oportunidade</strong>
                            <span>Fonte da publicação</span>
                          </div>
                          <Bookmark size={16} />
                        </div>
                        <h3>Cargo de seu interesse</h3>
                        <p>
                          <MapPin size={13} /> Local e modalidade informados
                          pela fonte
                        </p>
                        <div className="public-job-bottom">
                          <span>Requisitos comparados ao seu perfil</span>
                          <ArrowUpRight size={17} />
                        </div>
                      </div>
                      <div className="preview-foot">
                        <Search size={16} /> Esta prévia não é um resultado de
                        busca.
                      </div>
                    </Panel>
                  ) : (
                    <Panel
                      title="Cada candidatura tem seu lugar"
                      detail="O status muda com confirmação de envio."
                    >
                      <div className="preview-statuses">
                        <div>
                          <span>PARA CONFERIR</span>
                          <div className="preview-note">
                            <Bookmark size={18} />
                            <strong>Oportunidade salva</strong>
                            <small>Revise antes de se candidatar</small>
                          </div>
                        </div>
                        <div>
                          <span>PRÓXIMO PASSO</span>
                          <div className="preview-note">
                            <BriefcaseBusiness size={18} />
                            <strong>Candidatura preparada</strong>
                            <StatusBadge status="Requer ação manual" />
                          </div>
                        </div>
                      </div>
                    </Panel>
                  )}
                </motion.div>
              </AnimatePresence>
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
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          id="para-voce"
          className="profession-section"
        >
          <div className="landing-width profession-grid">
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
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.035 }}
                >
                  <Icon size={20} />
                  <span>{name}</span>
                  <span className="profession-index">0{i + 1}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          className="preferences-section landing-width"
        >
          <div className="preference-preview">
            <div className="preview-label">
              <SlidersHorizontal size={15} /> SUAS PREFERÊNCIAS
            </div>
            <h3>Trabalho bom é o que cabe na sua vida.</h3>
            <div className="preference-field">
              <span>Como você quer trabalhar?</span>
              <motion.div layout className="morph-select">
                <button
                  aria-expanded={filterOpen}
                  aria-controls="preview-modalities"
                  onClick={() => setFilterOpen(!filterOpen)}
                >
                  <MapPin size={16} />
                  {modality}
                  <ChevronDown size={16} />
                </button>
                <AnimatePresence>
                  {filterOpen && (
                    <motion.div
                      id="preview-modalities"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {["Presencial", "Híbrido", "Remoto"].map((m) => (
                        <button
                          key={m}
                          aria-pressed={modality === m}
                          onClick={() => {
                            setModality(m);
                            setFilterOpen(false);
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
              <input
                aria-label="Cidade na prévia"
                placeholder="Sua cidade e estado"
              />
            </label>
            <label className="preference-field">
              <span>Salário desejado</span>
              <input
                aria-label="Salário na prévia"
                type="number"
                min="0"
                placeholder="Você também pode deixar em aberto"
              />
            </label>
            <div className="preference-foot">
              Prévia interativa · Nenhuma consulta é executada aqui.
            </div>
          </div>
          <div className="preference-copy">
            <div className="landing-kicker">VOCÊ ESCOLHE A DIREÇÃO</div>
            <h2>
              Suas preferências
              <br />
              não são um detalhe.
            </h2>
            <p>
              Localização, salário, horário, experiência e contratação. Defina o
              que importa para você e ajuste quando sua vida mudar.
            </p>
            <div className="preference-principle">
              <ShieldCheck size={22} />
              <div>
                <strong>Compatibilidade com explicação.</strong>
                <p>
                  Veja os pontos em comum e o que precisa conferir. A pontuação
                  compara requisitos; ela não prevê uma contratação.
                </p>
              </div>
            </div>
            <a href="/register" className="landing-text-link">
              Encontrar minha direção <ArrowUpRight size={18} />
            </a>
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          className="organization-section landing-width"
        >
          <div className="section-intro">
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
                  role="tab"
                  aria-selected={organized === v}
                  onClick={() => setOrganized(v)}
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
          </div>
          <div
            className={`organization-visual ${organized ? "organized" : "dispersed"}`}
          >
            <div className="organization-visual-head">
              <Logo small />
              <strong>
                {organized
                  ? "Seu espaço na EmpreGatos"
                  : "Procurando em vários lugares"}
              </strong>
              <span>DEMONSTRAÇÃO DE ORGANIZAÇÃO</span>
            </div>
            <div className="organization-cards">
              {[
                ["Descobrir", Search, "Vagas e links originais"],
                ["Salvar", Bookmark, "Oportunidades para revisar"],
                [
                  "Acompanhar",
                  BriefcaseBusiness,
                  "Histórico de cada candidatura",
                ],
              ].map(([title, Icon, desc]) => {
                const I = Icon as typeof Search;
                return (
                  <motion.div
                    layout
                    key={String(title)}
                    transition={{ type: "spring", stiffness: 200, damping: 26 }}
                    className="organization-card"
                  >
                    <I size={22} />
                    <h3>{String(title)}</h3>
                    <p>{String(desc)}</p>
                    <div className="illustration-line" />
                    <div className="illustration-line short" />
                  </motion.div>
                );
              })}
            </div>
            <div className="organization-visual-foot">
              <Check size={16} />
              {organized
                ? "Suas oportunidades reunidas, analisadas e organizadas."
                : "Sites diferentes. Anotações soltas. Próximos passos difíceis de encontrar."}
            </div>
          </div>
        </motion.section>

        <motion.section
          {...reveal}
          id="perguntas"
          className="faq-section landing-width"
        >
          <div>
            <div className="landing-kicker">PODE PERGUNTAR</div>
            <h2>
              O primeiro passo
              <br />
              sem dúvidas.
            </h2>
            <p>Algumas respostas antes de começar.</p>
          </div>
          <div className="faq-list">
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
                      transition={{ duration: 0.2 }}
                    >
                      <p>{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section {...reveal} className="final-cta landing-width">
          <div>
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
          </div>
          <Mascot className="cta-mascot" />
        </motion.section>
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
