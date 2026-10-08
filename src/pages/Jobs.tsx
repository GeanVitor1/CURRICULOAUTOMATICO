import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Search,
  SlidersHorizontal,
  Plus,
  LayoutGrid,
  List,
  Bookmark,
  Radar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  JobCard,
  JobDetail,
  JobRow,
  PageHead,
  DiscoveryStatus,
} from "../components";
import { FiltersModal, ImportModal } from "../JobForms";
import { api, useAction, useApp } from "../lib";
import type { Job } from "../../shared/types";
import { isPortalId, portalSearchUrl } from "../../shared/portals";
export default function Jobs() {
  const { w, navigate } = useApp();
  const a = useAction();
  const radar = location.hash === "#radar";
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("all"),
    [view, setView] = useState("grid"),
    [sort, setSort] = useState("score"),
    [filters, setFilters] = useState(false),
    [importOpen, setImport] = useState(false),
    [selected, setSelected] = useState<Job | null>(null),
    [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    setTab("all");
    setPage(1);
  }, [radar]);
  const result = useQuery({
    queryKey: [
      "jobs",
      {
        search,
        page,
        radar,
        tab,
        sort,
        filters: w.filters,
        run: w.runs[0] ? { id: w.runs[0].id, status: w.runs[0].status } : null,
      },
    ],
    queryFn: () =>
      api<{ items: Job[]; total: number; page: number; pageSize: number }>(
        "/jobs?" +
          new URLSearchParams({
            search,
            page: String(page),
            pageSize: "12",
            radar: String(radar),
            tab,
            sort,
          }),
      ),
  });
  const jobs = result.data?.items || [];
  const requestedJob = new URLSearchParams(location.search).get("vaga");
  const detail = useQuery({
    queryKey: ["jobs", "detail", requestedJob],
    queryFn: () => api<Job>("/jobs/" + encodeURIComponent(requestedJob!)),
    enabled: !!requestedJob,
  });
  useEffect(() => {
    if (detail.data) setSelected(detail.data);
  }, [detail.data]);
  const total = result.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 12));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => {
    if (result.data && page > totalPages) setPage(totalPages);
  }, [result.data, page, totalPages]);
  return (
    <div>
      <PageHead
        eyebrow={
          radar ? "CONEXÕES QUE VOCÊ NÃO PROCURAVA" : "SUA PRÓXIMA OPORTUNIDADE"
        }
        title={radar ? "Radar de oportunidades" : "Explorar vagas"}
        description={
          radar
            ? "Outros títulos. Competências em comum. Novas possibilidades."
            : "Encontre as vagas que fazem sentido para o seu próximo passo."
        }
      >
        <Button onClick={() => setImport(true)}>
          <Plus size={15} />
          Adicionar vaga
        </Button>
        <Button className="primary" onClick={() => setFilters(true)}>
          <SlidersHorizontal size={15} />
          Ajustar busca
        </Button>
      </PageHead>
      <DiscoveryStatus />
      {w.sources.some(
        (source) => source.enabled && source.type === "portal",
      ) && (
        <div className="integration-info portal-search-links">
          <strong>Confira também a busca diretamente nos portais</strong>
          <p>
            Anúncios privados ou sem fonte verificável na busca Gemini podem
            aparecer no próprio portal.
          </p>
          <div className="resume-actions">
            {w.sources
              .filter(
                (source) =>
                  source.enabled &&
                  source.type === "portal" &&
                  isPortalId(source.board),
              )
              .map((source) => (
                <a
                  key={source.id}
                  className="button"
                  href={portalSearchUrl(
                    source.board as import("../../shared/portals").PortalId,
                    w.filters.titles.join(", ") || w.profile.headline,
                    w.filters.locations.join(", ") || w.profile.location,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buscar no {source.company}
                </a>
              ))}
          </div>
        </div>
      )}
      {w.runs[0]?.searchSuggestions?.map((html, index) => (
        <iframe
          key={index}
          title={`Sugestões do Google Search ${index + 1}`}
          srcDoc={html}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="search-suggestions"
        />
      ))}
      {radar && (
        <div className="info-inline">
          <Sparkles size={18} />
          <span>
            Seu Radar cruza competências confirmadas com famílias de cargos
            relacionados. Experiência com atendimento ao cliente, por exemplo,
            pode se conectar a funções de recepção ou vendas. Abra uma vaga para
            entender quais informações sustentam a conexão.
          </span>
        </div>
      )}
      <div className="tabs">
        {[
          ["all", "Todas as oportunidades"],
          ["compatible", "Compatíveis"],
          ["saved", "Salvas"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
          >
            {id === "saved" && (
              <Bookmark
                size={13}
                style={{ display: "inline", marginRight: 5 }}
              />
            )}{" "}
            {label}
            {tab === id && (
              <motion.span
                className="tactile-tab-active"
                layoutId="job-tab-active"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Buscar vagas"
            placeholder="Buscar por cargo, empresa ou habilidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Ordenação de vagas"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="score">Maior compatibilidade</option>
          <option value="recent">Mais recentes</option>
        </select>
        {w.searchProfiles.length > 0 && (
          <select
            aria-label="Perfil de busca"
            defaultValue=""
            onChange={(e) =>
              e.target.value &&
              a.mutate({ path: `/search-profiles/${e.target.value}/activate` })
            }
          >
            <option value="">Perfis de busca</option>
            {w.searchProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <div className="view-toggle">
          <button
            aria-label="Visualização em cards"
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            aria-label="Visualização em lista"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={16} />
          </button>
        </div>
      </div>
      <div className="filter-summary">
        {w.filters.skills.map((s) => (
          <button className="badge" key={s} onClick={() => setFilters(true)}>
            {s}
          </button>
        ))}
        {w.filters.levels.map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
        {w.filters.modalities.map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
        <button className="text-button" onClick={() => setFilters(true)}>
          Editar filtros
        </button>
      </div>
      <div className="count-caption">
        {result.isPending
          ? "Consultando suas oportunidades…"
          : total +
            (total === 1 ? " oportunidade" : " oportunidades") +
            " · Compatibilidade com seu perfil"}
      </div>
      {result.isPending ? (
        <div className="panel loading-reveal" role="status">
          <Empty
            title="Preparando suas oportunidades"
            description="Estamos consultando os registros da sua busca."
            icon={<Search size={28} />}
          />
        </div>
      ) : result.isError ? (
        <div className="panel">
          <Empty
            title="Não foi possível carregar as vagas"
            description={result.error.message}
            action={
              <Button onClick={() => result.refetch()}>Tentar novamente</Button>
            }
          />
        </div>
      ) : jobs.length ? (
        view === "grid" ? (
          <div className="job-grid">
            {jobs.map((j) => (
              <JobCard job={j} key={j.id} onClick={() => setSelected(j)} />
            ))}
          </div>
        ) : (
          <div className="panel">
            {jobs.map((j) => (
              <JobRow job={j} key={j.id} onClick={() => setSelected(j)} />
            ))}
          </div>
        )
      ) : (
        <div className="panel">
          <Empty
            title={
              search
                ? "Nenhuma conexão com essa busca"
                : radar
                  ? "Seu Radar está pronto para descobrir"
                  : w.runs.length
                    ? "Nenhuma vaga corresponde à sua busca"
                    : "Vamos encontrar suas oportunidades"
            }
            description={
              search
                ? "Tente outro cargo, habilidade ou empresa."
                : radar
                  ? "Confirme suas competências e busque vagas. As conexões com títulos diferentes aparecerão aqui."
                  : w.runs.length
                    ? "Confira se as empresas conectadas cobrem sua cidade e profissão. Você pode ajustar seus filtros ou adicionar uma fonte com outra cobertura."
                    : "Escolha uma empresa em Configurações para consultar oportunidades reais. Você também pode adicionar uma vaga encontrada por conta própria."
            }
            icon={radar ? <Radar size={28} /> : <Search size={28} />}
            action={
              <Button
                onClick={() => navigate(radar ? "perfil" : "configuracoes")}
              >
                {radar ? "Confirmar perfil" : "Conectar fontes"}
              </Button>
            }
          />
        </div>
      )}
      <div className="pagination">
        <span>
          Página {currentPage} de {totalPages}
        </span>
        <div>
          <Button
            disabled={currentPage <= 1 || result.isFetching}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={14} />
            Anterior
          </Button>
          <Button
            disabled={currentPage >= totalPages || result.isFetching}
            onClick={() => setPage(currentPage + 1)}
          >
            Próxima
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
      {filters && <FiltersModal open close={() => setFilters(false)} />}{" "}
      {importOpen && <ImportModal open close={() => setImport(false)} />}
      <JobDetail
        job={
          selected ? jobs.find((j) => j.id === selected.id) || selected : null
        }
        close={() => {
          setSelected(null);
          if (requestedJob) {
            const url = new URL(location.href);
            url.searchParams.delete("vaga");
            history.replaceState({}, "", url.pathname + url.search + url.hash);
          }
        }}
      />
    </div>
  );
}
