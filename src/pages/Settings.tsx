import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plug,
  Plus,
  Trash2,
  Download,
  ShieldCheck,
  Cpu,
  ExternalLink,
  Search,
  Check,
  ArrowRight,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHead,
  Panel,
} from "../components";
import { api, date, useAction, useApp } from "../lib";
import { isPortalId, portalSearchUrl } from "../../shared/portals";
import type { VerifiedOrganization } from "../../server/source-registry";
const labels: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  jobicy: "Jobicy",
  adzuna: "Adzuna",
  authorized: "Envio autorizado",
  manual: "Registro manual",
  gemini: "Gemini",
  portal: "Portal de vagas",
  local: "Análise local",
  openai: "OpenAI",
  ollama: "Ollama",
};

export default function Settings() {
  const { w, toast, navigate } = useApp();
  const a = useAction();
  const client = useQueryClient();
  const [section, setSection] = useState("sources"),
    [add, setAdd] = useState(false),
    [deletion, setDeletion] = useState(false),
    [password, setPassword] = useState(""),
    [sourceType, setSourceType] = useState("greenhouse"),
    [connecting, setConnecting] = useState("");
  const [ai, setAi] = useState({
    provider:
      w.intelligence?.provider === "zen"
        ? "gemini"
        : w.intelligence?.provider || "gemini",
    model:
      (w.intelligence?.provider !== "zen" && w.intelligence?.model) ||
      w.intelligence?.geminiModel ||
      "gemini-2.5-flash",
    enabled:
      w.intelligence?.provider !== "zen" && (w.intelligence?.enabled || false),
    consent:
      w.intelligence?.provider !== "zen" && (w.intelligence?.consent || false),
    apiKey: "",
    clearKey: false,
  });
  const registry = useQuery({
    queryKey: ["source-registry"],
    queryFn: () => api<VerifiedOrganization[]>("/source-registry"),
  });
  const [searchTitle, setSearchTitle] = useState(
    w.filters.titles.join(", ") || w.profile.headline,
  );
  const [searchLocation, setSearchLocation] = useState(
    w.filters.locations.join(", ") || w.profile.location,
  );
  const connect = async (
    source:
      | VerifiedOrganization
      | {
          type: "jobicy";
          company: string;
          board: string;
          sector: string;
          country: string;
        },
  ) => {
    const key = source.type + ":" + source.board;
    setConnecting(key);
    try {
      if (!searchTitle.trim())
        throw new Error("Informe o cargo que procura antes de pesquisar.");
      await api("/filters", {
        method: "PUT",
        body: JSON.stringify({
          ...w.filters,
          titles: searchTitle
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean),
          locations: searchLocation
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (
        !w.sources.some(
          (s) => s.type === source.type && s.board === source.board,
        )
      )
        await api("/sources", {
          method: "POST",
          body: JSON.stringify({ ...source, enabled: true }),
        });
      const run = await api("/discover", { method: "POST" });
      await client.invalidateQueries({ queryKey: ["workspace"] });
      toast(run.message);
      navigate("vagas");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Não conseguimos iniciar a busca. Tente novamente.",
        true,
      );
    } finally {
      setConnecting("");
    }
  };
  return (
    <div>
      <PageHead
        eyebrow="DO SEU JEITO"
        title="Configurações"
        description="Escolha onde procurar e como cuidar das suas informações."
      />
      <div className="settings-columns">
        <nav className="settings-nav" aria-label="Seções de configurações">
          {[
            ["sources", "Onde procurar", Plug],
            ["ai", "Análise do currículo", Cpu],
            ["data", "Meus dados", ShieldCheck],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Plug;
            return (
              <button
                key={String(id)}
                className={section === id ? "active" : ""}
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(String(id))}
              >
                <I size={16} />
                {String(label)}
              </button>
            );
          })}
        </nav>
        <div className="stack">
          {section === "sources" && (
            <>
              <Panel
                title="1. Escolha onde vamos procurar"
                detail="Escolha um portal e procure vagas por cargo e cidade."
              >
                <div className="integration-info">
                  <p>
                    A Gupy e o LinkedIn têm consulta de páginas públicas, sem
                    depender da análise por IA. InfoJobs e Indeed usam a busca
                    Gemini. Escolha os cargos e mantenha seus filtros de cidade
                    e modalidade.
                  </p>
                  <p>
                    Ao selecionar <strong>Adicionar e pesquisar</strong>,
                    buscamos anúncios com links de origem. Você confere os
                    requisitos e conclui a candidatura no portal.
                  </p>
                </div>
                <div className="form-grid source-search-fields">
                  <Field
                    label="Quais cargos você procura?"
                    help="Separe por vírgulas ou confirme as sugestões em Meu currículo."
                  >
                    <input
                      value={searchTitle}
                      onChange={(e) => setSearchTitle(e.target.value)}
                      placeholder="Ex.: atendente, auxiliar administrativo"
                    />
                  </Field>
                  <Field label="Cidade ou região">
                    <input
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      placeholder="Ex.: São Paulo"
                    />
                  </Field>
                </div>
                {registry.isPending ? (
                  <div className="skeleton large-block" />
                ) : registry.isError ? (
                  <div className="integration-info">
                    <p role="alert">
                      Não conseguimos carregar a lista de portais:{" "}
                      {registry.error.message}
                    </p>
                    <Button onClick={() => registry.refetch()}>
                      Tentar de novo
                    </Button>
                  </div>
                ) : (
                  <div className="source-registry">
                    {registry.data?.map((s) => {
                      const key = s.type + ":" + s.board,
                        exists = w.sources.some(
                          (item) =>
                            item.type === s.type && item.board === s.board,
                        );
                      return (
                        <article className="registry-card" key={key}>
                          <div className="registry-card-head">
                            <strong>{s.company}</strong>
                            <span>{s.sector}</span>
                          </div>
                          <p>{s.coverage}</p>
                          <a
                            className="text-button"
                            href={
                              isPortalId(s.board)
                                ? portalSearchUrl(
                                    s.board,
                                    searchTitle,
                                    searchLocation,
                                  )
                                : s.referenceUrl
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Abrir busca no portal <ExternalLink size={12} />
                          </a>
                          <small>
                            {s.board === "gupy" || s.board === "linkedin"
                              ? "Consulta pública de vagas"
                              : "Busca com Gemini"}{" "}
                            · você finaliza no portal
                          </small>
                          <Button
                            className={exists ? "" : "primary"}
                            disabled={!!connecting || a.isPending}
                            onClick={() => connect(s)}
                          >
                            {connecting === key
                              ? "Iniciando busca…"
                              : exists
                                ? "Pesquisar neste conjunto de fontes"
                                : "Adicionar e pesquisar"}
                            <Search size={14} />
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className="integration-info source-alternative">
                  <h3>Quer conferir oportunidades remotas?</h3>
                  <p>
                    A Jobicy publica vagas remotas. Confira o país aceito:
                    remoto não significa que a empresa contrata em qualquer
                    lugar. Atualizamos essa fonte no máximo uma vez por hora.
                  </p>
                  <Button
                    disabled={!!connecting}
                    onClick={() =>
                      connect({
                        type: "jobicy",
                        company: "Jobicy",
                        board: "public",
                        sector: "Vagas remotas",
                        country: "",
                      })
                    }
                  >
                    Pesquisar com Jobicy <ArrowRight size={14} />
                  </Button>
                </div>
              </Panel>
              <Panel
                title="2. Suas fontes conectadas"
                detail="Acompanhe a última consulta e eventuais erros."
                action={
                  <Button onClick={() => setAdd(true)}>
                    <Plus size={14} />
                    Adicionar fonte avançada
                  </Button>
                }
              >
                {w.sources.length ? (
                  w.sources.map((s) => (
                    <div className="source-row" key={s.id}>
                      <span className="connection-icon">
                        <Plug size={18} />
                      </span>
                      <div>
                        <strong>{s.company}</strong>
                        <p>
                          {labels[s.type] || s.type} ·{" "}
                          {s.sector || "Setor não informado"}
                        </p>
                        <small>
                          {s.status}
                          {s.lastCheckedAt &&
                            " · " + date(s.lastCheckedAt, true)}
                        </small>
                        {s.lastError && (
                          <p className="negative" role="status">
                            {s.lastError}
                          </p>
                        )}
                        <div className="capability-row">
                          <Badge tone={s.discovery ? "green" : ""}>
                            {s.discovery ? "Busca disponível" : "Sem busca"}
                          </Badge>
                          <Badge tone={s.application ? "green" : "amber"}>
                            {s.application
                              ? "Envio autorizado"
                              : "Você finaliza no site oficial"}
                          </Badge>
                        </div>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Remover fonte ${s.company}`}
                        disabled={a.isPending}
                        onClick={() =>
                          a.mutate({
                            path: `/sources/${s.id}`,
                            method: "DELETE",
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="integration-info">
                    <p>
                      Ainda não há fontes conectadas. Escolha um portal na lista
                      acima para começar.
                    </p>
                  </div>
                )}
              </Panel>
              <Panel title="Encontrou uma vaga em outro site?">
                <div className="integration-info">
                  <p>
                    Você pode registrar uma oportunidade do LinkedIn, Gupy,
                    InfoJobs, Indeed ou outro portal. Use o link oficial e
                    finalize a candidatura no próprio site.
                  </p>
                  <Button onClick={() => navigate("vagas")}>
                    Adicionar uma oportunidade <ArrowRight size={14} />
                  </Button>
                </div>
              </Panel>
            </>
          )}
          {section === "ai" && (
            <Panel
              title="Ajuda para entender seu currículo"
              detail="Ative Gemini para analisar o currículo e sugerir quais cargos procurar."
            >
              <form
                className="form-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  a.mutate(
                    { path: "/intelligence", method: "PUT", body: ai },
                    {
                      onSuccess: () => {
                        setAi((old) => ({ ...old, apiKey: "" }));
                        toast("Preferências de análise salvas.");
                      },
                    },
                  );
                }}
              >
                <p className="settings-explainer">
                  A análise ajuda a identificar o que você sabe fazer e a
                  explicar os requisitos de uma vaga. Você sempre confere e
                  aprova as informações antes de usá-las.
                </p>
                <Field label="Como você quer analisar seu currículo?">
                  <select
                    value={ai.provider}
                    onChange={(e) =>
                      setAi((old) => ({
                        ...old,
                        provider: e.target.value,
                        enabled: false,
                        consent: false,
                        apiKey: "",
                        model:
                          e.target.value === "gemini"
                            ? w.intelligence?.geminiModel || "gemini-2.5-flash"
                            : "",
                      }))
                    }
                  >
                    <option value="local">
                      No próprio sistema · sem enviar dados à IA
                    </option>
                    <option value="gemini">
                      Gemini · análise e sugestões de cargos
                    </option>
                    <option value="ollama">
                      Ollama · modelo instalado no servidor
                    </option>
                    <option value="openai">
                      OpenAI · chave e créditos próprios
                    </option>
                  </select>
                </Field>
                {ai.provider !== "local" && (
                  <>
                    <Field label="Modelo">
                      <input
                        required
                        value={ai.model}
                        onChange={(e) =>
                          setAi((old) => ({ ...old, model: e.target.value }))
                        }
                        placeholder="gemini-2.5-flash"
                      />
                    </Field>
                    {ai.provider === "gemini" && (
                      <div className="notice-inline">
                        {w.intelligence?.geminiConfigured
                          ? "A chave Gemini está configurada no servidor."
                          : "Configure uma chave Gemini válida no servidor."}{" "}
                        A chave não aparece nesta página.
                      </div>
                    )}
                    {ai.provider === "openai" && (
                      <Field
                        label="Sua chave de API"
                        help="Será criptografada no servidor. Deixe vazio para manter a chave já salva."
                      >
                        <input
                          type="password"
                          autoComplete="off"
                          value={ai.apiKey}
                          onChange={(e) =>
                            setAi((old) => ({ ...old, apiKey: e.target.value }))
                          }
                        />
                      </Field>
                    )}
                    {["gemini", "openai"].includes(ai.provider) && (
                      <div className="consent-panel">
                        <ShieldCheck size={20} />
                        <div>
                          <strong>
                            Antes de ativar, entenda o envio dos dados.
                          </strong>
                          <p>
                            {ai.provider === "gemini"
                              ? "O Google recebe os dados profissionais necessários para analisar o currículo e sugerir cargos. Contato e documentos são removidos. O uso e a busca podem consumir a cota do seu projeto."
                              : "Os dados profissionais necessários serão enviados à OpenAI. Confira a política do provedor."}
                          </p>
                          <a
                            href={
                              ai.provider === "gemini"
                                ? "https://ai.google.dev/gemini-api/terms"
                                : "https://platform.openai.com/docs/guides/your-data"
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-button"
                          >
                            Ler a política do provedor{" "}
                            <ExternalLink size={12} />
                          </a>
                          <label className="checkbox-field">
                            <input
                              type="checkbox"
                              checked={ai.consent}
                              onChange={(e) =>
                                setAi((old) => ({
                                  ...old,
                                  consent: e.target.checked,
                                  enabled: e.target.checked
                                    ? old.enabled
                                    : false,
                                }))
                              }
                            />
                            Li as informações e autorizo o envio dos dados
                            profissionais necessários ao provedor escolhido.
                          </label>
                        </div>
                      </div>
                    )}
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={ai.enabled}
                        disabled={
                          ["gemini", "openai"].includes(ai.provider) &&
                          !ai.consent
                        }
                        onChange={(e) =>
                          setAi((old) => ({
                            ...old,
                            enabled: e.target.checked,
                          }))
                        }
                      />
                      Usar essa ajuda na análise do currículo
                    </label>
                  </>
                )}
                <div className="form-actions">
                  {ai.provider === "gemini" && (
                    <Button
                      type="button"
                      disabled={a.isPending || !ai.model}
                      onClick={() =>
                        a.mutate(
                          {
                            path: "/intelligence/test",
                            body: { model: ai.model, provider: "gemini" },
                          },
                          { onSuccess: (r) => toast(r.message, !r.ok) },
                        )
                      }
                    >
                      Testar conexão com texto fictício
                    </Button>
                  )}
                  <Button className="primary" disabled={a.isPending}>
                    <Check size={15} />
                    {a.isPending
                      ? "Salvando…"
                      : "Salvar preferência de análise"}
                  </Button>
                </div>
                <div className="analysis-health">
                  <strong>Estado da análise</strong>
                  <span>
                    {w.intelligence?.health?.status === "healthy"
                      ? "Última análise concluída"
                      : w.intelligence?.health?.status === "unavailable"
                        ? w.intelligence.health.lastError ||
                          "Provedor indisponível. Usando análise local."
                        : w.intelligence?.health?.status === "not_configured"
                          ? "Falta configurar a chave no servidor"
                          : "Ainda não houve uma análise autenticada nesta sessão."}
                  </span>
                  <small>
                    Consultas: {w.intelligence?.health?.requests || 0} ·
                    Reutilizações: {w.intelligence?.health?.cacheHits || 0}
                  </small>
                </div>
              </form>
            </Panel>
          )}
          {section === "data" && (
            <>
              <Panel title="Seus dados estão sob seu controle">
                <div className="integration-info">
                  <p>
                    Seu perfil, currículos, preferências e histórico pertencem à
                    sua conta. Outras pessoas não podem acessar esses
                    documentos.
                  </p>
                  <p>
                    Baixe seus dados em JSON para guardar uma cópia. Seus
                    arquivos PDF podem ser baixados em Meu currículo.
                  </p>
                  <div className="detail-actions">
                    <a className="button" href="/api/export">
                      <Download size={14} />
                      Exportar meus dados
                    </a>
                    <Button onClick={() => navigate("curriculo")}>
                      Ver meus currículos
                    </Button>
                  </div>
                  <a href="/privacy" className="text-button">
                    Como tratamos seus dados <ExternalLink size={12} />
                  </a>
                </div>
              </Panel>
              <Panel title="Excluir minha conta">
                <div className="integration-info">
                  <p>
                    A exclusão remove sua conta, sessões, histórico e arquivos
                    de currículo desta instalação. Para confirmar, você
                    precisará informar sua senha.
                  </p>
                  <Button
                    className="danger-ghost"
                    onClick={() => setDeletion(true)}
                  >
                    <Trash2 size={14} />
                    Excluir minha conta
                  </Button>
                </div>
              </Panel>
              <Panel title="Informações desta instalação">
                <div className="infrastructure">
                  <div>
                    <span>Armazenamento</span>
                    <strong>{w.infrastructure.database}</strong>
                  </div>
                  <div>
                    <span>Buscas em segundo plano</span>
                    <strong>
                      {w.infrastructure.worker
                        ? "Disponíveis"
                        : "O responsável precisa iniciar o serviço"}
                    </strong>
                  </div>
                  <div>
                    <span>Envio automático autorizado</span>
                    <strong>
                      {w.infrastructure.automatic
                        ? "Configurado"
                        : "Sem integração de envio"}
                    </strong>
                  </div>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
      <Modal
        title="Adicionar outra empresa"
        description="Opção para quem conhece o mural oficial da empresa. Se preferir, use a lista de empresas verificadas."
        open={add}
        onOpenChange={setAdd}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            a.mutate(
              {
                path: "/sources",
                body: {
                  type: sourceType,
                  company: f.get("company"),
                  board: f.get("board"),
                  country: f.get("country") || "",
                  sector: f.get("sector"),
                  enabled: true,
                },
              },
              {
                onSuccess: () => {
                  toast(
                    "Empresa adicionada. Agora você pode pesquisar suas vagas.",
                  );
                  setAdd(false);
                },
              },
            );
          }}
        >
          <Field label="Plataforma do mural">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              {[
                "greenhouse",
                "lever",
                "ashby",
                "jobicy",
                "adzuna",
                ...(w.infrastructure.automatic ? ["authorized"] : []),
              ].map((type) => (
                <option key={type} value={type}>
                  {labels[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome da empresa ou fonte">
            <input required name="company" maxLength={200} />
          </Field>
          <Field
            label={
              sourceType === "adzuna"
                ? "Termo de busca"
                : "Identificador do mural"
            }
            help={
              sourceType === "jobicy"
                ? "Use public. A Jobicy não exige um identificador de empresa."
                : sourceType === "adzuna"
                  ? "Ex.: auxiliar administrativo. A Adzuna exige credenciais e país com cobertura autorizada no servidor."
                  : "É o nome que aparece no endereço do mural, como jobs.lever.co/nome-da-empresa."
            }
          >
            <input
              name="board"
              required
              defaultValue={sourceType === "jobicy" ? "public" : ""}
              maxLength={sourceType === "adzuna" ? 200 : 100}
            />
          </Field>
          <Field label="Setor (opcional)">
            <input
              name="sector"
              maxLength={200}
              placeholder="Ex.: Saúde, varejo ou educação"
            />
          </Field>
          <Field
            label="País (opcional)"
            help="Código de duas letras, como br. Para Adzuna, informe um país autorizado."
          >
            <input
              name="country"
              maxLength={2}
              pattern="[a-z]{2}"
              placeholder="br"
            />
          </Field>
          <div className="modal-footer">
            <Button type="button" onClick={() => setAdd(false)}>
              Voltar
            </Button>
            <Button className="primary" disabled={a.isPending}>
              Adicionar empresa
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        title="Excluir minha conta"
        description="Confirme com sua senha. Seus dados serão removidos desta instalação."
        open={deletion}
        onOpenChange={setDeletion}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            a.mutate(
              { path: "/account", method: "DELETE", body: { password } },
              {
                onSuccess: () => {
                  client.clear();
                  location.href = "/";
                },
              },
            );
          }}
        >
          <Field label="Sua senha">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="modal-footer">
            <Button type="button" onClick={() => setDeletion(false)}>
              Manter minha conta
            </Button>
            <Button className="danger-ghost" disabled={a.isPending}>
              Excluir permanentemente
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
