import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  LayoutDashboard,
  Radar,
  BriefcaseBusiness,
  Zap,
  FileText,
  UserRound,
  ChartNoAxesCombined,
  Bell,
  Settings2,
  Search,
  ChevronDown,
  Command,
  Menu,
  Sun,
  Moon,
  LogOut,
  HelpCircle,
  FlaskConical,
  ArrowUpRight,
  X,
  AlertCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { Context, api } from "./lib";
import { Logo, Mascot, Button, Modal, Field } from "./components";
import Dashboard from "./Dashboard";
import type { Workspace } from "../shared/types";
const Landing = lazy(() => import("./Landing"));
const Onboarding = lazy(() => import("./Onboarding"));
const GuidedTour = lazy(() => import("./GuidedTour"));
const pages = {
  vagas: lazy(() => import("./pages/Jobs")),
  radar: lazy(() => import("./pages/Jobs")),
  candidaturas: lazy(() => import("./pages/Applications")),
  automacao: lazy(() => import("./pages/Automation")),
  curriculo: lazy(() => import("./pages/Resume")),
  perfil: lazy(() => import("./pages/Profile")),
  analises: lazy(() => import("./pages/Analytics")),
  notificacoes: lazy(() => import("./pages/Notifications")),
  configuracoes: lazy(() => import("./pages/Settings")),
  onboarding: Onboarding,
};
const nav = [
  { id: "visao-geral", label: "Visão geral", icon: LayoutDashboard },
  { id: "radar", label: "Radar de oportunidades", icon: Radar },
  { id: "vagas", label: "Explorar vagas", icon: Search },
  { id: "candidaturas", label: "Candidaturas", icon: BriefcaseBusiness },
  { id: "automacao", label: "Automação", icon: Zap },
  { id: "curriculo", label: "Meu currículo", icon: FileText },
  { id: "perfil", label: "Perfil profissional", icon: UserRound },
  { id: "analises", label: "Análises", icon: ChartNoAxesCombined },
  { id: "notificacoes", label: "Notificações", icon: Bell },
];
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
        podem ter políticas diferentes de retenção e uso para
        melhoria. Leia a política exibida nas configurações e só ative após
        concordar.
      </p>
      <h2>Exportação e exclusão</h2>
      <p>
        Em Configurações → Dados, você pode exportar seu workspace em JSON ou
        excluir sua conta, seus currículos e o histórico associado. A exportação
        inclui os dados profissionais armazenados; os PDFs podem ser baixados na
        página de currículos. A chave do provedor fica no servidor.
      </p>
      <h2>Fontes de oportunidades</h2>
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
function Auth({
  onSuccess,
  toast,
}: {
  onSuccess: () => void;
  toast: (s: string, e?: boolean) => void;
}) {
  const register = location.pathname === "/register";
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <a href="/" className="auth-brand">
        <Logo />
        <span>EmpreGatos</span>
      </a>
      <div className="auth-editorial">
        <div className="eyebrow">UM PASSO DE CADA VEZ</div>
        <h2>
          Seu próximo capítulo
          <br />
          começa com você.
        </h2>
        <Mascot className="auth-mascot" />
        <p>
          Do primeiro emprego ao próximo desafio.
          <br />
          Suas oportunidades. Seu ritmo.
        </p>
      </div>
      <div className="auth-card">
        <div className="eyebrow">SEU PRÓXIMO PASSO</div>
        <h1>
          {register
            ? "Uma nova direção para sua carreira."
            : "Bom ter você de volta."}
        </h1>
        <p>
          Encontre oportunidades que combinam com você e acompanhe cada
          candidatura em um só lugar.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await api(`/auth/${register ? "register" : "login"}`, {
                method: "POST",
                body: JSON.stringify({
                  name: f.get("name") || undefined,
                  email: f.get("email"),
                  password: f.get("password"),
                }),
              });
              onSuccess();
            } catch (e: any) {
              toast(e.message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <Field label="Seu nome">
              <input
                name="name"
                placeholder="Como podemos chamar você?"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="E-mail">
            <input
              name="email"
              type="email"
              placeholder="voce@exemplo.com"
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Senha" help="Use pelo menos 10 caracteres.">
            <input
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </Field>
          <Button type="submit" className="primary full" disabled={busy}>
            {busy ? "Aguarde…" : register ? "Criar minha conta" : "Entrar"}
          </Button>
        </form>
        <a
          className="text-button auth-switch"
          href={register ? "/login" : "/register"}
        >
          {register ? "Já tenho uma conta" : "Criar uma conta"}
        </a>
        <div className="auth-foot">
          <BriefcaseBusiness size={14} />
          Suas oportunidades. Seu ritmo.
        </div>
      </div>
      <span className="auth-version">EmpreGatos · Seu próximo passo</span>
    </div>
  );
}
export default function App() {
  const client = useQueryClient();
  const [route, setRoute] = useState(location.pathname);
  const [page, setPage] = useState(location.hash.slice(1) || "visao-geral"),
    [demo, setDemo] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [theme, setTheme] = useState(
      localStorage.getItem("orbita-theme") || "dark",
    ),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [help, setHelp] = useState(false),
    [toastMessage, setToast] = useState<{
      text: string;
      error: boolean;
    } | null>(null);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ id: string; name: string; email: string }>("/auth/me"),
  });
  const workspace = useQuery({
    queryKey: ["workspace", demo],
    queryFn: () => api<Workspace>("/workspace?summary=true", {}, demo),
    enabled: !!me.data,
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => ["running", "queued"].includes(r.status))
        ? 2000
        : false,
  });
  const toast = (text: string, error = false) => setToast({ text, error });
  const navigate = (p: string) => {
    setPage(p);
    location.hash = p;
    setSidebar(false);
    setSearchOpen(false);
  };
  useEffect(() => {
    const change = () => setRoute(location.pathname);
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  useEffect(() => {
    if (me.data && ["/login", "/register"].includes(route)) {
      history.replaceState({}, "", "/app");
      setRoute("/app");
    } else if (
      me.isError &&
      (me.error as Error & { status?: number }).status === 401 &&
      route === "/app"
    ) {
      history.replaceState({}, "", "/login");
      setRoute("/login");
    }
  }, [me.data, me.isError, route]);
  useEffect(() => {
    const f = () => setPage(location.hash.slice(1) || "visao-geral");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("orbita-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const w = workspace.data;
  const quickJobs = useQuery({
    queryKey: ["jobs", "quick", search],
    queryFn: () =>
      api<{ items: Workspace["jobs"] }>(
        "/jobs?search=" + encodeURIComponent(search) + "&pageSize=5",
      ),
    enabled: !!me.data && searchOpen && search.trim().length >= 2,
  });
  const Page = pages[page as keyof typeof pages];
  const notificationCount = w?.notices.filter((n) => !n.read).length || 0;
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
            {toastMessage.error ? (
              <AlertCircle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>{toastMessage.text}</span>
            <button aria-label="Fechar mensagem" onClick={() => setToast(null)}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {route === "/" ? (
        <Suspense
          fallback={
            <div className="app-loading">
              <Logo />
              <span>Preparando a EmpreGatos…</span>
            </div>
          }
        >
          <Landing />
        </Suspense>
      ) : route === "/privacy" ? (
        <Privacy />
      ) : !["/login", "/register", "/app"].includes(route) ? (
        <div className="error-page">
          <h1>Página não encontrada</h1>
          <a className="button primary" href="/">
            Voltar ao início
          </a>
        </div>
      ) : me.isPending ? (
        <div className="app-loading">
          <Logo />
          <span>Preparando seu espaço…</span>
        </div>
      ) : me.isError &&
        (me.error as Error & { status?: number }).status !== 401 ? (
        <div className="error-page">
          <Logo />
          <h2>Não conseguimos verificar sua sessão agora.</h2>
          <p>
            O serviço pode estar reiniciando. Seus dados continuam na sua conta.
          </p>
          <Button onClick={() => me.refetch()}>Tentar novamente</Button>
        </div>
      ) : !me.data ? (
        <Auth
          onSuccess={async () => {
            await client.invalidateQueries({ queryKey: ["me"] });
            history.replaceState({}, "", "/app");
            setRoute("/app");
          }}
          toast={toast}
        />
      ) : (
        <div className="app-shell">
          {sidebar && (
            <button
              className="sidebar-scrim"
              aria-label="Fechar navegação"
              onClick={() => setSidebar(false)}
            />
          )}
          <aside className={`sidebar ${sidebar ? "open" : ""}`}>
            <a
              href="#visao-geral"
              className="brand"
              onClick={() => navigate("visao-geral")}
            >
              <Logo />
              <span>
                EmpreGatos<span className="brand-period">.</span>
              </span>
            </a>
            <button
              className="workspace-picker"
              onClick={() => navigate("perfil")}
            >
              <span className="workspace-avatar">
                {me.data.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                Meu espaço
                <span className="workspace-sub">Busca por oportunidades</span>
              </span>
              <ChevronDown size={14} />
            </button>
            <button
              className="sidebar-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span>Busca rápida</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="nav-caption">SUAS OPORTUNIDADES</div>
            <nav>
              {nav.map((item, i) => (
                <div key={item.id}>
                  {i === 5 && (
                    <div className="nav-caption secondary">
                      SEU PERFIL E ATIVIDADE
                    </div>
                  )}
                  <button
                    className={`nav-item ${page === item.id ? "active" : ""}`}
                    aria-label={item.label}
                    aria-current={page === item.id ? "page" : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon size={17} />
                    <span>{item.label}</span>
                    {item.id === "candidaturas" && !!w?.applications.length && (
                      <span className="nav-count">{w.applications.length}</span>
                    )}
                    {item.id === "notificacoes" && notificationCount > 0 && (
                      <span className="nav-count">{notificationCount}</span>
                    )}
                  </button>
                </div>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <button
                className="routine-widget"
                onClick={() => navigate("automacao")}
              >
                <div>
                  <span
                    className={`live-dot ${w?.routine.enabled && !demo ? "on" : ""}`}
                  />
                  <strong>
                    {w?.routine.enabled && !demo
                      ? "Automação ativa"
                      : "Você está no controle"}
                  </strong>
                </div>
                <span>
                  {w?.routine.enabled && !demo
                    ? `Próxima busca às ${w.routine.time}`
                    : "Configure sua rotina de busca"}
                </span>
                <Zap size={15} />
              </button>
              <button
                className={`nav-item ${page === "configuracoes" ? "active" : ""}`}
                onClick={() => navigate("configuracoes")}
              >
                <Settings2 size={17} />
                <span>Configurações</span>
              </button>
              <button className="nav-item" onClick={() => setHelp(true)}>
                <HelpCircle size={17} />
                <span>Guia de primeiros passos</span>
              </button>
              <div className="user-block">
                <div className="avatar">
                  {me.data.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{me.data.name}</strong>
                  <span>Seu espaço pessoal</span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Sair da conta"
                  onClick={async () => {
                    await api("/auth/logout", { method: "POST" });
                    client.clear();
                    setDemo(false);
                    history.replaceState({}, "", "/login");
                    setRoute("/login");
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div>
                <button
                  className="icon-button mobile-menu"
                  aria-label="Abrir navegação"
                  onClick={() => setSidebar(true)}
                >
                  <Menu size={20} />
                </button>
                <span className="topbar-workspace">Meu espaço</span>
                <span className="breadcrumb-slash">/</span>
                <span>
                  {nav.find((n) => n.id === page)?.label || "Configurações"}
                </span>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  aria-label={
                    theme === "dark"
                      ? "Ativar tema claro"
                      : "Ativar tema escuro"
                  }
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <button
                  className="icon-button bell"
                  aria-label="Abrir notificações"
                  onClick={() => navigate("notificacoes")}
                >
                  <Bell size={18} />
                  {notificationCount > 0 && <i />}
                </button>
                <span className="avatar mini">
                  {me.data.name.slice(0, 1).toUpperCase()}
                </span>
              </div>
            </header>
            {demo && (
              <div className="demo-banner">
                <FlaskConical size={14} />
                <strong>Modo demonstração</strong>
                <span>
                  Vagas e candidaturas fictícias. Nenhum envio é realizado.
                </span>
              </div>
            )}
            <main>
              {workspace.isPending ? (
                <div className="skeleton-page">
                  <div className="skeleton wide-line" />
                  <div className="skeleton-metrics">
                    {[1, 2, 3, 4].map((i) => (
                      <div className="skeleton" key={i} />
                    ))}
                  </div>
                  <div className="skeleton large-block" />
                </div>
              ) : workspace.error ? (
                <div className="error-page">
                  <AlertCircle />
                  <h2>Não conseguimos carregar seu espaço.</h2>
                  <p>{workspace.error.message}</p>
                  <Button onClick={() => workspace.refetch()}>
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                w && (
                  <Context.Provider
                    key={demo ? "demo" : "live"}
                    value={{ w, demo, navigate, toast }}
                  >
                    <Suspense
                      fallback={<div className="skeleton large-block" />}
                    >
                      {w.onboarding?.completed === false &&
                      page === "visao-geral" ? (
                        <Onboarding />
                      ) : page === "visao-geral" || !Page ? (
                        <Dashboard />
                      ) : (
                        <Page />
                      )}
                    </Suspense>
                    <Suspense fallback={null}>
                      <GuidedTour
                        openHelp={help}
                        onClose={() => setHelp(false)}
                      />
                    </Suspense>
                  </Context.Provider>
                )
              )}
            </main>
            <footer className="app-footer">
              <span>
                <Logo small />
                EmpreGatos · Cada candidatura, um passo adiante.
              </span>
              <span>
                Horários de Brasília <span className="sep">·</span>{" "}
                {demo ? "Dados de demonstração" : "Dados do seu espaço"}
              </span>
            </footer>
          </div>
          <Modal
            title="Busca rápida"
            description="Encontre uma página ou oportunidade no seu espaço."
            open={searchOpen}
            onOpenChange={setSearchOpen}
          >
            <div className="command-input">
              <Search size={18} />
              <input
                placeholder="Buscar páginas e oportunidades…"
                aria-label="Busca rápida"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-list">
              {[
                ...nav,
                {
                  id: "configuracoes",
                  label: "Configurações",
                  icon: Settings2,
                },
              ]
                .filter((n) =>
                  n.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((n) => (
                  <button key={n.id} onClick={() => navigate(n.id)}>
                    <n.icon size={17} />
                    {n.label}
                    <Command size={13} />
                  </button>
                ))}
              {quickJobs.data?.items.map((j) => (
                <button
                  key={j.id}
                  onClick={() => {
                    const url = new URL(location.href);
                    url.searchParams.set("vaga", j.id);
                    history.replaceState(
                      {},
                      "",
                      url.pathname + url.search + "#vagas",
                    );
                    navigate("vagas");
                  }}
                >
                  <BriefcaseBusiness size={16} />
                  <span>
                    {j.title}
                    <small>{j.company}</small>
                  </span>
                </button>
              ))}
            </div>
          </Modal>
        </div>
      )}
    </MotionConfig>
  );
}
