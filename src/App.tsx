import { appPathname } from './basePath';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {publicContact} from '../shared/public-contact';
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
  HelpCircle,
  Link2,
  Sparkles,
} from "lucide-react";
import {SetupProgress,ProductHelp} from './GettingStarted';
import {needsCandidateDetailsPage} from '../shared/getting-started';
import {authEntryPath,clearAppReturn,pendingAppReturn,rememberAppReturn,safeAppReturn,saveTheme,storedTheme} from '../shared/browser-navigation';
import { Context, api } from "./lib";
import { Logo, Mascot, Button, Field } from "./components";
import type { Workspace } from "../shared/types";
import loginAnimation from "../Video/output/NOVOVIDEO.mp4";
import GoogleSignIn, {
  googleErrorMessage,
  type AuthIdentity,
} from "./GoogleSignIn";
import { selectedPlan } from "./Pricing";
const Landing = lazy(() => import("./Landing"));
const RemotePortalLogin = lazy(() => import("./RemotePortalLogin"));
const PortalConnectionFlow = lazy(() => import("./PortalConnectionFlow"));
const CandidateDetails = lazy(() => import("./CandidateDetails"));
const pages = {
  dados: CandidateDetails,
  vagas: lazy(() => import("./pages/Jobs")),
  candidaturas: lazy(() => import("./pages/Applications")),
  automacao: lazy(() => import("./SimpleAutomation")),
  curriculo: lazy(() => import("./SimpleResume")),
  'curriculo-perfeito': lazy(() => import('./PerfectResume')),
  preferencias: lazy(() => import("./CareerInterview")),
  conta: lazy(() => import("./SimpleAccount")),
  conexoes: lazy(() => import("./pages/Connections")),
  onboarding: lazy(() => import("./Onboarding")),
};
const nav = [
  { id: "automacao", label: "Automação", icon: Zap },
  { id: "curriculo", label: "Currículo", icon: FileText },
  { id: "curriculo-perfeito", label: "Currículo Perfeito", icon: Sparkles },
  { id: "preferencias", label: "Preferências", icon: Settings2 },
  { id: "conexoes", label: "Conexões", icon: Link2 },
  { id: "candidaturas", label: "Candidaturas", icon: BriefcaseBusiness },
];
const canonicalPage = (page: string) =>
  ({
    "visao-geral": "automacao",
    radar: "vagas",
    perfil: "preferencias",
    analises: "automacao",
    notificacoes: "candidaturas",
    configuracoes: "conta",
  })[page] ||
  page ||
  "automacao";
function optionalStorage(kind:'localStorage'|'sessionStorage'){
  try{return window[kind];}catch{return null;}
}
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
      <h2>Extensão do Chrome</h2>
      <p>A extensão localiza as abas do EmpreGatos e do portal escolhido para realizar a conexão que você autorizou. Ela não lê senhas nem a sessão do Google. A autorização de acesso é solicitada separadamente para cada portal.</p>
      <p>No LinkedIn, o reconhecimento acontece no próprio Chrome. Cookies, tokens e armazenamento de autenticação do LinkedIn não são transferidos. O servidor guarda somente a data da verificação, sua versão da extensão e o resultado associado à sua conta; esse registro não habilita candidaturas automáticas pelo LinkedIn.</p>
      <p>Em Gupy, InfoJobs e Glassdoor, após sua autorização, cookies seguros e entradas de armazenamento relacionadas à autenticação do portal são enviados por HTTPS à sua conta do EmpreGatos para verificação em um navegador privado. A sessão fica armazenada de forma cifrada após a confirmação. Esses dados de autenticação não são enviados aos provedores de IA.</p>
      <p>A extensão guarda no Chrome apenas o portal selecionado e o estado de abertura do login. Ela não guarda credenciais no armazenamento da extensão nem coleta sessões em segundo plano. As URLs das abas dos portais selecionados são usadas para localizar o login. Na área de conexões, você pode remover a conexão do projeto; na conta, pode solicitar a exclusão dos dados associados.</p>
      <h2>Assinaturas e pagamentos</h2>
      <p>
        Os planos pagos são assinaturas mensais com renovação automática. O
        Stripe processa o cartão em sua própria página de pagamento; a
        EmpreGatos não armazena o número do cartão. Dados de identificação e o
        estado da assinatura são utilizados para gerenciar a cobrança. Em Minha
        conta, você pode gerenciar o pagamento e cancelar a renovação. Ao
        excluir a conta, o sistema cancela as assinaturas ativas; registros
        financeiros podem ser mantidos pelo processador conforme suas
        obrigações.
      </p>
      <h2>Responsável e contato</h2>
      <p>O EmpreGatos é operado por <strong>{publicContact.name}</strong>. Para suporte, dúvidas sobre seus dados ou solicitações de privacidade, entre em contato pelo e-mail <a href={`mailto:${publicContact.email}`}>{publicContact.email}</a>.</p>
      <h2>Armazenamento e retenção</h2>
      <p>Conta, perfil, currículos, preferências e histórico permanecem associados à sua conta enquanto ela existir, até você remover esses dados ou excluir a conta. As conexões dos portais podem ser removidas separadamente na área de conexões. Excluir dados no EmpreGatos não exclui suas contas ou os dados mantidos pelos próprios portais de vagas.</p>
      <p>Na configuração do banco conferida em 29 de outubro de 2026, o histórico técnico de versões tem retenção de uma hora e não há backups periódicos agendados. Isso não representa uma funcionalidade de recuperação oferecida pelo EmpreGatos. Você pode exportar os dados da conta antes de solicitar sua exclusão.</p>
      <p>Registros técnicos e dados de cobrança mantidos pelos provedores de infraestrutura e pagamento seguem as regras desses serviços e suas obrigações de segurança. Para esclarecer a retenção de um dado específico ou solicitar sua remoção, use o contato de privacidade acima.</p>
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
        poster={import.meta.env.BASE_URL + "login-video-poster.png"}
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
  const register = appPathname() === "/register";
  const returnTo=pendingAppReturn(location.search,optionalStorage('sessionStorage'));
  useEffect(()=>{if(returnTo)rememberAppReturn(optionalStorage('sessionStorage'),returnTo);},[returnTo]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState(() =>
    googleErrorMessage(
      new URLSearchParams(location.search).get("google_error"),
    ),
  );
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
                Seu
                <br />
                currículo
              </p>
            </li>
            <li>
              <span>
                <ChartNoAxesColumnIncreasing size={23} aria-hidden="true" />
              </span>
              <p>
                Suas
                <br />
                preferências
              </p>
            </li>
            <li>
              <span>
                <UsersRound size={23} aria-hidden="true" />
              </span>
              <p>
                Você escolhe
                <br />
                quando começar
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
              ? "Comece sem cartão. Depois, vamos guiar você pelo currículo, pelos dados e pelas vagas que procura."
              : "Retome sua configuração ou acompanhe suas candidaturas. Seu próximo passo estará no painel."}
          </p>
          <GoogleSignIn disabled={busy} />
          <div className="auth-divider">
            <span>ou use seu e-mail</span>
          </div>
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
                {busy ? register ? "Criando sua conta…" : "Entrando na sua conta…" : register ? "Criar minha conta" : "Entrar"}
              </span>
              <ArrowRight size={22} aria-hidden="true" />
            </Button>
          </form>
          {register&&<p className="auth-entry-note">Depois do cadastro: adicione ou crie seu currículo, confirme seus dados e escolha as vagas. Os envios só começam quando você autorizar a rotina.</p>}
          <a className="auth-switch" href={authEntryPath(register?'/login':'/register',returnTo)}>
            <UserRound size={22} aria-hidden="true" />
            {register ? "Já tenho uma conta" : "Criar uma conta"}
          </a>
          <div className="auth-foot">
            <LockKeyhole size={19} aria-hidden="true" />
            Criar a conta não inicia candidaturas.
          </div>
        </div>
      </main>
      <span className="auth-version">EmpreGatos · Seu próximo passo</span>
    </div>
  );
}
export default function App() {
  const client = useQueryClient();
  const [route, setRoute] = useState(appPathname());
  const [page, setPage] = useState(canonicalPage(location.hash.slice(1)));
  const [sidebar, setSidebar] = useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 780px)").matches,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const helpButtonRef=useRef<HTMLButtonElement>(null);
  const loggingOut = useRef(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [theme, setTheme] = useState(()=>storedTheme(optionalStorage('localStorage')));
  const [toastMessage, setToast] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const identity=await api<AuthIdentity>('/auth/me');
      const previous=client.getQueryData<AuthIdentity>(['me']);
      if(previous&&previous.id!==identity.id)client.removeQueries({predicate:q=>!['me','auth-providers'].includes(String(q.queryKey[0]))});
      return identity;
    },
    staleTime:0,
    refetchOnWindowFocus:true,
    enabled: ["/login", "/register", "/app"].includes(route),
  });
  const workspace = useQuery({
    queryKey: ["workspace", false,me.data?.id],
    queryFn: () => api<Workspace>("/workspace?summary=true"),
    enabled: !!me.data && route === "/app",
  });
  useEffect(()=>{setHelpOpen(false);},[me.data?.id]);
  useQuery({
    queryKey: ["workspace-version", me.data?.id],
    enabled: !!me.data && !!workspace.data && route === "/app",
    queryFn: async ({ signal }) => {
      const version = await api<{ revision: string | null }>(
        "/workspace/version",
        { signal },
      );
      const current = client.getQueryData<Workspace>(["workspace", false,me.data?.id]);
      // While work is active, check one timestamp. Fetch the dashboard and
      // dependent lists only when a worker has actually changed the workspace.
      if (version.revision && current && version.revision !== current.revision)
        await Promise.all([
          client.invalidateQueries({ queryKey: ["workspace"] }),
          client.invalidateQueries({ queryKey: ["jobs"] }),
          client.invalidateQueries({ queryKey: ["billing"] }),
          client.invalidateQueries({ queryKey: ["automation-sites"] }),
        ]);
      return version;
    },
    refetchInterval: (q) => {
      if (q.state.status === "error") return 30000;
      const data = workspace.data;
      if(data?.routine.enabled && data.routine.progress && Date.now()-Date.parse(data.routine.progress.updatedAt)<10*60_000 && ['sending','searching','researching'].includes(data.routine.progress.state)) return 15000;
      if (data?.runs.some((run) => ["running", "queued"].includes(run.status)))
        return 15000;
      if (
        data?.applications.some(
          (application) =>
            application.status === "Aguardando aprovação" &&
            (!!application.singleSubmission || (data.routine.enabled && data.routine.mode === "automatic")),
        )
      )
        return 15000;
      if (
        data?.applications.some(
          (application) => application.status === "Enviando",
        )
      )
        return 15000;
      // Wake near the scheduled daily search; idle dashboards do not poll.
      const next =
        data?.routine.enabled && data.routine.nextRun
          ? Date.parse(data.routine.nextRun) - Date.now()
          : NaN;
      return Number.isFinite(next)
        ? Math.min(2147483647, next > 0 ? Math.max(60000, next) : 1800000)
        : false;
    },
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
      setRoute(appPathname());
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
      const returnTo=rememberAppReturn(optionalStorage('sessionStorage'),appPathname()+location.search+location.hash);
      client.clear();
      history.replaceState({}, "", authEntryPath('/login',returnTo));
      setRoute("/login");
    } else if (me.data && (["/login", "/register"].includes(route)||(route==='/app'&&pendingAppReturn('',optionalStorage('sessionStorage'))))) {
      const destination = selectedPlan() ? "conta" : "automacao";
      const activePortal=new URLSearchParams(location.search).get('portal');
      const currentPortal=route==='/app'&&['gupy','linkedin','infojobs','glassdoor'].includes(activePortal||'')?safeAppReturn(appPathname()+location.search):null;
      const target=currentPortal||pendingAppReturn(location.search,optionalStorage('sessionStorage'))||`/app#${destination}`;
      clearAppReturn(optionalStorage('sessionStorage'));
      history.replaceState({}, "", target);
      setPage(canonicalPage(location.hash.slice(1)));
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
    saveTheme(optionalStorage('localStorage'),theme);
  }, [theme]);
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toastMessage]);
  const w = workspace.data;
  const displayPage=w&&needsCandidateDetailsPage(w,page)?'dados':page;
  const remotePortal = new URLSearchParams(location.search).get("portal");
  const Page = pages[page as keyof typeof pages] || pages.automacao;
  const title =
    nav.find((item) => item.id === displayPage)?.label ||
    (displayPage === "vagas" ? "Vagas encontradas" : displayPage==='dados'?'Seus dados':"Minha conta");
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
      ) : route === "/app" && me.isPending ? (
        <div className="app-loading">
          <Mascot
            className="page-state-mascot"
            variant="thinking"
            animated
            decorative
          />
          <span>Carregando sua conta...</span>
        </div>
      ) : route === "/app" &&
        me.isError &&
        (me.error as Error & { status?: number }).status !== 401 ? (
        <div className="error-page">
          <h2>Não foi possível acessar sua conta agora.</h2>
          <p>Tente novamente em instantes.</p>
          <Button onClick={() => me.refetch()}>Tentar novamente</Button>
        </div>
      ) : !me.data ? (
        <Auth
          onSuccess={async () => {
            client.removeQueries({predicate:q=>!['me','auth-providers'].includes(String(q.queryKey[0]))});
            await client.invalidateQueries({ queryKey: ["me"] });
          }}
        />
      ) : route === "/app" &&
        (remotePortal === "gupy" ||
          remotePortal === "infojobs" ||
          remotePortal === "glassdoor" || remotePortal==='linkedin') ? (
        <Suspense
          fallback={<div className="app-loading">Carregando navegador…</div>}
        >
          {new URLSearchParams(location.search).get('flow')==='connections'
            ? <PortalConnectionFlow portal={remotePortal}/>
            : <RemotePortalLogin portal={remotePortal} workspace={w} />}
        </Suspense>
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
                      setHelpOpen(false);
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
              <div className="topbar-actions"><button type="button" ref={helpButtonRef} className="start-help-button" aria-label="Como usar o EmpreGatos" title="Como usar" onClick={()=>setHelpOpen(true)}><HelpCircle size={17} aria-hidden="true"/><span>Como usar</span></button><button
                className="icon-button"
                aria-label={
                  theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
                }
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button></div>
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
                    <SetupProgress page={displayPage}/>
                    {helpOpen&&<ProductHelp open onClose={()=>{setHelpOpen(false);requestAnimationFrame(()=>helpButtonRef.current?.focus());}}/>}
                    <Suspense
                      fallback={
                        <div className="app-loading">Carregando...</div>
                      }
                    >
                      {page === "onboarding" || (!w.onboarding?.completed && !w.interview?.completed && !w.resumes.length) ? (
                        <pages.onboarding />
                        ) : needsCandidateDetailsPage(w,page) ? (
                        <CandidateDetails />
                      ) : (
                        <Page />
                      )}
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
