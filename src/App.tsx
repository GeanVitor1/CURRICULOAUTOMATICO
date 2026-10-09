import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import {
  BriefcaseBusiness,
  Zap,
  FileText,
  UserRound,
  Settings2,
  Menu,
  Sun,
  Moon,
  LogOut,
  X,
  Eye,
  EyeOff,
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  UsersRound,
  Mail,
  LockKeyhole,
} from "lucide-react";
import { Context, api } from "./lib";
import { Logo, Mascot, Button, Field } from "./components";
import type { Workspace } from "../shared/types";
import loginAnimation from "../Video/output/NOVOVIDEO.mp4";
const Landing = lazy(() => import("./Landing"));
const pages = {
  vagas: lazy(() => import("./pages/Jobs")),
  candidaturas: lazy(() => import("./pages/Applications")),
  automacao: lazy(() => import("./SimpleAutomation")),
  curriculo: lazy(() => import("./SimpleResume")),
  preferencias: lazy(() => import("./CareerInterview")),
  conta: lazy(() => import("./SimpleAccount")),
};
const nav = [
  { id: "automacao", label: "Automação", icon: Zap },
  { id: "curriculo", label: "Currículo", icon: FileText },
  { id: "preferencias", label: "Preferências", icon: Settings2 },
  { id: "candidaturas", label: "Candidaturas", icon: BriefcaseBusiness },
];
const canonicalPage = (page: string) =>
  ({
    "visao-geral": "automacao",
    radar: "vagas",
    perfil: "preferencias",
    onboarding: "preferencias",
    analises: "automacao",
    notificacoes: "candidaturas",
    configuracoes: "conta",
  })[page] ||
  page ||
  "automacao";
function Privacy() {
  return (
    <div className="privacy-page">
      <a className="brand" href="/">
        <Logo />
        <strong>EmpreGatos</strong>
      </a>
      <h1>Você controla seus dados.</h1>
      <p>
        A EmpreGatos armazena sua conta, perfil, preferências, currículos e
        histórico para organizar sua busca. Currículos são privados e os
        downloads exigem uma sessão da conta proprietária.
      </p>
      <h2>Análise e consentimento</h2>
      <p>
        A análise local não envia seu currículo a um provedor de IA. Se você
        ativar a análise externa, serão enviados apenas dados profissionais
        necessários, com redução de contatos e identificadores pessoais. A
        integração usa Gemini ou o provedor escolhido por você. Os provedores
        podem ter políticas diferentes de retenção e uso para melhoria. Leia a
        política exibida nas configurações e só ative após concordar.
      </p>
      <h2>Exportação e exclusão</h2>
      <p>
        Em Minha conta, você pode exportar seu workspace em JSON ou excluir sua
        conta, seus currículos e o histórico associado. A exportação inclui os
        dados profissionais armazenados; os PDFs podem ser baixados na aba
        Currículo. A chave do provedor fica no servidor.
      </p>
      <h2>Sites de vagas</h2>
      <p>
        As fontes retornam anúncios públicos de empresas. Abrir um link oficial
        não confirma uma candidatura. A cobertura varia por organização e
        região; confira requisitos e elegibilidade antes de enviar dados ao
        empregador.
      </p>
      <h2>Operação desta instalação</h2>
      <p>
        Esta versão usa o armazenamento configurado pelo operador. Antes de
        oferecê-la publicamente, o operador precisa informar sua identificação,
        contato para pedidos de privacidade, prazo de retenção e política de
        backups. Esta página descreve o comportamento implementado; não
        substitui essas informações específicas da operação.
      </p>
      <a href="/" className="button" style={{ marginTop: 30 }}>
        Voltar ao início
      </a>
    </div>
  );
}
function AuthAnimation({ className }: { className: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const playing = reduced === false;
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    if (playing) void media.play().catch(() => {});
    else media.pause();
  }, [playing]);
  return (
    <span className={`auth-video ${className}`}>
      <video
        ref={video}
        className="auth-video-media"
        src={reduced === true ? undefined : loginAnimation}
        poster="/login-video-poster.png"
        autoPlay={playing}
        muted
        loop
        playsInline
        preload={reduced === false ? "auto" : "none"}
        width={1280}
        height={720}
        aria-label="Mascote da EmpreGatos escrevendo o currículo"
      />
    </span>
  );
}
function Auth({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const register = location.pathname === "/register";
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => {
    try {
      return !!localStorage.getItem("empregatos:remembered-email");
    } catch {
      return false;
    }
  });
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("empregatos:remembered-email") || "";
    } catch {
      return "";
    }
  });
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 780px)").matches,
  );
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 780px)");
    const update = () => setCompact(screen.matches);
    screen.addEventListener("change", update);
    return () => screen.removeEventListener("change", update);
  }, []);
  return (
    <div className={`auth-page${register ? " auth-register" : ""}`}>
      <a href="/" className="auth-brand">
        <Logo />
        <span>EmpreGatos</span>
      </a>
      <main className="auth-layout">
        <div className="auth-editorial">
          <div className="eyebrow">UM PASSO DE CADA VEZ</div>
          <h2>
            Seu próximo
            <br />
            capítulo começa
            <br />
            <span>com você.</span>
          </h2>
          <p>
            Do primeiro emprego ao próximo desafio.
            <br />
            Suas oportunidades. Seu ritmo.
          </p>
          {!compact && <AuthAnimation className="auth-mascot" />}
          <ul
            className="auth-benefits"
            aria-label="Seu próximo passo com a EmpreGatos"
          >
            <li>
              <span>
                <BriefcaseBusiness size={23} aria-hidden="true" />
              </span>
              <p>
                Mais
                <br />
                oportunidades
              </p>
            </li>
            <li>
              <span>
                <ChartNoAxesColumnIncreasing size={23} aria-hidden="true" />
              </span>
              <p>
                No seu
                <br />
                ritmo
              </p>
            </li>
            <li>
              <span>
                <UsersRound size={23} aria-hidden="true" />
              </span>
              <p>
                Conexões
                <br />
                reais
              </p>
            </li>
          </ul>
        </div>
        <div className="auth-card">
          {compact && <AuthAnimation className="auth-card-mascot" />}
          <div className="eyebrow">SEU PRÓXIMO PASSO</div>
          <h1>
            {register ? (
              <>
                Seu próximo capítulo
                <br />
                começa aqui.
              </>
            ) : (
              "Bom ter você de volta."
            )}
          </h1>
          <p>
            {register
              ? "Crie sua conta e encontre oportunidades que combinam com você. Um passo de cada vez."
              : "Encontre oportunidades que combinam com você e acompanhe cada candidatura em um só lugar."}
          </p>
          <form
            aria-busy={busy}
            onSubmit={async (e) => {
              e.preventDefault();
              if (submitting.current) return;
              submitting.current = true;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await api(`/auth/${register ? "register" : "login"}`, {
                  method: "POST",
                  body: JSON.stringify({
                    name: String(f.get("name") || "").trim() || undefined,
                    email: String(f.get("email") || "").trim(),
                    password: f.get("password"),
                  }),
                });
                try {
                  if (rememberEmail) {
                    localStorage.setItem(
                      "empregatos:remembered-email",
                      String(f.get("email") || "").trim(),
                    );
                  } else {
                    localStorage.removeItem("empregatos:remembered-email");
                  }
                } catch {
                  // Email persistence is optional and must not block authentication.
                }
                await onSuccess();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Não foi possível acessar sua conta.",
                );
              } finally {
                submitting.current = false;
                setBusy(false);
              }
            }}
          >
            {register && (
              <Field label="Seu nome">
                <div className="auth-input">
                  <UserRound
                    className="auth-input-icon"
                    size={21}
                    aria-hidden="true"
                  />
                  <input
                    name="name"
                    placeholder="Como podemos chamar você?"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    disabled={busy}
                  />
                </div>
              </Field>
            )}
            <Field label="E-mail">
              <div className="auth-input">
                <Mail
                  className="auth-input-icon"
                  size={21}
                  aria-hidden="true"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  required
                  autoComplete="email"
                  maxLength={254}
                  disabled={busy}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>
            <Field
              label="Senha"
              help={register ? "Use pelo menos 10 caracteres." : undefined}
            >
              <div className="password-input auth-input">
                <LockKeyhole
                  className="auth-input-icon"
                  size={21}
                  aria-hidden="true"
                />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                  disabled={busy}
                  placeholder={register ? "Crie uma senha segura" : "Sua senha"}
                />
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <label className="auth-remember">
              <input
                type="checkbox"
                checked={rememberEmail}
                disabled={busy}
                onChange={(event) => {
                  setRememberEmail(event.target.checked);
                  if (!event.target.checked) {
                    try {
                      localStorage.removeItem("empregatos:remembered-email");
                    } catch {
                      // Browsers may disable local storage.
                    }
                  }
                }}
              />
              <span>Lembrar meu e-mail</span>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="primary full" disabled={busy}>
              <span>
                {busy ? "Aguarde…" : register ? "Criar minha conta" : "Entrar"}
              </span>
              <ArrowRight size={22} aria-hidden="true" />
            </Button>
          </form>
          <div className="auth-divider">
            <span>ou</span>
          </div>
          <a className="auth-switch" href={register ? "/login" : "/register"}>
            <UserRound size={22} aria-hidden="true" />
            {register ? "Já tenho uma conta" : "Criar uma conta"}
          </a>
          <div className="auth-foot">
            <LockKeyhole size={19} aria-hidden="true" />
            Suas oportunidades. Seu ritmo.
          </div>
        </div>
      </main>
      <span className="auth-version">EmpreGatos · Seu próximo passo</span>
    </div>
  );
}
export default function App() {
  const client = useQueryClient();
  const [route, setRoute] = useState(location.pathname);
  const [page, setPage] = useState(canonicalPage(location.hash.slice(1)));
  const [sidebar, setSidebar] = useState(false);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 780px)").matches,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const loggingOut = useRef(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [theme, setTheme] = useState(
    localStorage.getItem("orbita-theme") || "dark",
  );
  const [toastMessage, setToast] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ id: string; name: string; email: string }>("/auth/me"),
    enabled: ["/login", "/register", "/app"].includes(route),
  });
  const workspace = useQuery({
    queryKey: ["workspace", false],
    queryFn: () => api<Workspace>("/workspace?summary=true"),
    enabled: !!me.data && route === "/app",
    refetchInterval: (q) =>
      q.state.data?.routine.enabled ||
      q.state.data?.applications.some(
        (application) => application.status === "Enviando",
      ) ||
      q.state.data?.runs.some((run) =>
        ["running", "queued"].includes(run.status),
      )
        ? 2000
        : false,
  });
  const toast = (text: string, error = false) => setToast({ text, error });
  const navigate = (target: string) => {
    const next = canonicalPage(target);
    setPage(next);
    location.hash = next;
    setSidebar(false);
  };
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 780px)");
    const update = () => {
      setCompact(screen.matches);
      if (!screen.matches) setSidebar(false);
    };
    screen.addEventListener("change", update);
    return () => screen.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!sidebar || !compact) return;
    const panel = sidebarRef.current;
    if (!panel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), [tabindex='0']",
        ),
      );
    (
      panel.querySelector<HTMLElement>("[aria-current='page']") ||
      focusable()[0]
    )?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebar(false);
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (window.matchMedia("(max-width: 780px)").matches)
        menuButtonRef.current?.focus();
    };
  }, [sidebar, compact]);
  useEffect(() => {
    const change = () => {
      setRoute(location.pathname);
      setPage(canonicalPage(location.hash.slice(1)));
    };
    window.addEventListener("popstate", change);
    window.addEventListener("hashchange", change);
    return () => {
      window.removeEventListener("popstate", change);
      window.removeEventListener("hashchange", change);
    };
  }, []);
  useEffect(() => {
    const sessionExpired =
      (me.isError &&
        (me.error as Error & { status?: number }).status === 401) ||
      (workspace.isError &&
        (workspace.error as Error & { status?: number }).status === 401);
    if (sessionExpired && route === "/app") {
      client.clear();
      history.replaceState({}, "", "/login");
      setRoute("/login");
    } else if (me.data && ["/login", "/register"].includes(route)) {
      history.replaceState({}, "", "/app");
      setRoute("/app");
    }
  }, [
    client,
    me.data,
    me.isError,
    me.error,
    workspace.isError,
    workspace.error,
    route,
  ]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("orbita-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toastMessage]);
  const w = workspace.data;
  const Page = pages[page as keyof typeof pages] || pages.automacao;
  const title =
    nav.find((item) => item.id === page)?.label ||
    (page === "vagas" ? "Vagas encontradas" : "Minha conta");
  useEffect(() => {
    document.title =
      route === "/"
        ? "EmpreGatos · Seu próximo emprego"
        : `${route === "/app" ? title : route === "/register" ? "Criar conta" : route === "/login" ? "Entrar" : route === "/privacy" ? "Privacidade" : "Página não encontrada"} · EmpreGatos`;
  }, [route, title]);
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            role={toastMessage.error ? "alert" : "status"}
            className={`toast ${toastMessage.error ? "error" : ""}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span>{toastMessage.text}</span>
            <button aria-label="Fechar mensagem" onClick={() => setToast(null)}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {route === "/" ? (
        <Suspense fallback={<div className="app-loading">Carregando...</div>}>
          <Landing />
        </Suspense>
      ) : route === "/privacy" ? (
        <Privacy />
      ) : !["/login", "/register", "/app"].includes(route) ? (
        <div className="error-page">
          <h1>Página não encontrada</h1>
          <a className="button" href="/">
            Voltar ao início
          </a>
        </div>
      ) : me.isPending ? (
        <div className="app-loading">
          <Mascot
            className="page-state-mascot"
            variant="thinking"
            animated
            decorative
          />
          <span>Carregando sua conta...</span>
        </div>
      ) : me.isError &&
        (me.error as Error & { status?: number }).status !== 401 ? (
        <div className="error-page">
          <h2>Não foi possível acessar sua conta agora.</h2>
          <p>Tente novamente em instantes.</p>
          <Button onClick={() => me.refetch()}>Tentar novamente</Button>
        </div>
      ) : !me.data ? (
        <Auth
          onSuccess={async () => {
            await client.invalidateQueries({ queryKey: ["me"] });
            history.replaceState({}, "", "/app");
            setRoute("/app");
            navigate("automacao");
          }}
        />
      ) : (
        <div className="app-shell simple-shell">
          <a
            className="skip-link"
            href="#main-content"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("main-content")?.focus();
            }}
          >
            Ir para o conteúdo
          </a>
          {sidebar && (
            <button
              className="sidebar-scrim"
              aria-label="Fechar navegação"
              tabIndex={-1}
              onClick={() => setSidebar(false)}
            />
          )}
          <aside
            ref={sidebarRef}
            id="app-navigation"
            className={`sidebar ${sidebar ? "open" : ""}`}
            inert={compact && !sidebar}
            aria-hidden={compact && !sidebar ? true : undefined}
            role={compact && sidebar ? "dialog" : undefined}
            aria-modal={compact && sidebar ? true : undefined}
            aria-label={compact && sidebar ? "Navegação" : undefined}
          >
            {compact && (
              <button
                type="button"
                className="icon-button sidebar-close"
                aria-label="Fechar menu"
                onClick={() => setSidebar(false)}
              >
                <X size={20} />
              </button>
            )}
            <a
              className="brand"
              href="#automacao"
              onClick={() => navigate("automacao")}
            >
              <Logo />
              <span>EmpreGatos</span>
            </a>
            <nav aria-label="Navegação principal">
              {nav.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <button
                className={`nav-item ${page === "conta" ? "active" : ""}`}
                aria-current={page === "conta" ? "page" : undefined}
                onClick={() => navigate("conta")}
              >
                <UserRound size={17} />
                <span>Minha conta</span>
              </button>
              <div className="user-block">
                <div className="avatar">
                  {me.data.name.slice(0, 1).toUpperCase()}
                </div>
                <strong>{me.data.name}</strong>
                <button
                  className="icon-button"
                  aria-label="Sair da conta"
                  disabled={logoutPending}
                  onClick={async () => {
                    if (loggingOut.current) return;
                    loggingOut.current = true;
                    setLogoutPending(true);
                    try {
                      await api("/auth/logout", { method: "POST" });
                      client.clear();
                      history.replaceState({}, "", "/login");
                      setRoute("/login");
                    } catch (error) {
                      toast(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível sair da conta.",
                        true,
                      );
                    } finally {
                      loggingOut.current = false;
                      setLogoutPending(false);
                    }
                  }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </aside>
          <div
            className="main-shell"
            inert={compact && sidebar}
            aria-hidden={compact && sidebar ? true : undefined}
          >
            <header className="topbar">
              <div>
                <button
                  className="icon-button mobile-menu"
                  ref={menuButtonRef}
                  aria-label="Abrir navegação"
                  aria-expanded={sidebar}
                  aria-controls="app-navigation"
                  onClick={() => setSidebar(true)}
                >
                  <Menu size={20} />
                </button>
                <span>{title}</span>
              </div>
              <button
                className="icon-button"
                aria-label={
                  theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
                }
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </header>
            <main id="main-content" tabIndex={-1}>
              {workspace.isPending ? (
                <div className="app-loading">Carregando...</div>
              ) : workspace.error ? (
                <div className="error-page">
                  <h2>Não conseguimos carregar sua conta</h2>
                  <p>{workspace.error.message}</p>
                  <Button onClick={() => workspace.refetch()}>
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                w && (
                  <Context.Provider value={{ w, demo: false, navigate, toast }}>
                    <Suspense
                      fallback={
                        <div className="app-loading">Carregando...</div>
                      }
                    >
                      <Page />
                    </Suspense>
                  </Context.Provider>
                )
              )}
            </main>
            <footer className="app-footer">
              <span>EmpreGatos</span>
              <a href="/privacy">Privacidade</a>
            </footer>
          </div>
        </div>
      )}
    </MotionConfig>
  );
}
