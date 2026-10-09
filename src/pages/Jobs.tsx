import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Empty,
  JobCard,
  JobDetail,
  PageHead,
  DiscoveryStatus,
  Field,
} from "../components";
import { api, useAction, useApp } from "../lib";
import type { Filters, Job } from "../../shared/types";

export default function Jobs() {
  const { w, navigate } = useApp();
  const a = useAction();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Job | null>(null);
  const [city, setCity] = useState(w.filters.locations.join("; "));
  const [salaryMin, setSalaryMin] = useState(String(w.filters.salaryMin || ""));
  useEffect(
    () => setCity(w.filters.locations.join("; ")),
    [w.filters.locations.join("; ")],
  );
  useEffect(
    () => setSalaryMin(String(w.filters.salaryMin || "")),
    [w.filters.salaryMin],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);
  const change = (patch: Partial<Filters>) => {
    setPage(1);
    a.mutate({
      path: "/filters",
      method: "PUT",
      body: { ...w.filters, ...patch },
    });
  };
  const result = useQuery({
    queryKey: [
      "jobs",
      "simple",
      page,
      search,
      w.filters,
      w.runs[0]?.id,
      w.runs[0]?.status,
    ],
    queryFn: ({ signal }) =>
      api<{ items: Job[]; total: number; pageSize: number }>(
        "/jobs?" +
          new URLSearchParams({
            page: String(page),
            pageSize: "12",
            search,
            sort: "recent",
          }),
        { signal },
      ),
  });
  const requested = new URLSearchParams(location.search).get("vaga");
  const detail = useQuery({
    queryKey: ["jobs", "detail", requested],
    enabled: !!requested,
    queryFn: ({ signal }) =>
      api<Job>("/jobs/" + encodeURIComponent(requested!), { signal }),
  });
  useEffect(() => {
    if (detail.data) setSelected(detail.data);
  }, [detail.data]);
  const searching = ["queued", "running"].includes(w.runs[0]?.status || "");
  const total = result.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 12));
  const sourceFailed = ["failed", "partial"].includes(w.runs[0]?.status || "");
  useEffect(() => {
    if (page > totalPages && result.data) setPage(totalPages);
  }, [page, totalPages, result.data]);
  return (
    <div className="jobs-page">
      <PageHead
        title="Vagas encontradas"
        description="As vagas que atendem às suas preferências. Os mesmos critérios orientam a automação."
      >
        <Button onClick={() => navigate("automacao")}>
          <ArrowLeft size={15} />
          Voltar à automação
        </Button>
        <Button
          className="primary"
          disabled={a.isPending || searching}
          onClick={() =>
            w.sources.some((source) => source.enabled && source.discovery)
              ? a.mutate({ path: "/discover" })
              : navigate("preferencias")
          }
        >
          <Search size={15} />
          {searching ? "Buscando…" : "Buscar vagas"}
        </Button>
      </PageHead>
      <div className="simple-job-filters" aria-label="Filtros de vagas">
        <label>
          <span>Modalidade</span>
          <select
            aria-label="Modalidade"
            disabled={a.isPending}
            value={
              w.filters.modalities.length === 1 ? w.filters.modalities[0] : ""
            }
            onChange={(e) =>
              change({
                modalities: e.target.value ? [e.target.value] : [],
                remoteAnywhere: true,
              })
            }
          >
            <option value="">Todas</option>
            <option>Remoto</option>
            <option>Presencial</option>
            <option>Híbrido</option>
          </select>
        </label>
        <label>
          <span>Publicação</span>
          <select
            aria-label="Publicação"
            disabled={a.isPending}
            value={w.filters.dateKnownOnly ? w.filters.ageDays : 365}
            onChange={(e) =>
              change({
                ageDays: Number(e.target.value),
                dateKnownOnly: Number(e.target.value) !== 365,
              })
            }
          >
            <option value={1}>Últimas 24 horas</option>
            <option value={3}>Últimos 3 dias</option>
            <option value={7}>Última semana</option>
            <option value={30}>Último mês</option>
            <option value={365}>Qualquer data</option>
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            change({
              locations: city
                .split(";")
                .map((part) => part.trim())
                .filter(Boolean),
              remoteAnywhere: true,
            });
          }}
        >
          <label>
            <span>Cidade (presencial/híbrido)</span>
            <input
              aria-label="Cidade para vagas presenciais"
              value={city}
              placeholder="Todas as cidades"
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={a.isPending}>
            Aplicar cidade
          </Button>
        </form>
        <details className="salary-filter">
          <summary>
            Salário{" "}
            {w.filters.salaryMin > 0
              ? `· a partir de R$ ${w.filters.salaryMin.toLocaleString("pt-BR")}`
              : ""}
          </summary>
          <div>
            <Field label="Mínimo mensal (R$)">
              <input
                type="number"
                min={0}
                max={10000000}
                value={salaryMin}
                disabled={a.isPending}
                onChange={(e) => setSalaryMin(e.target.value)}
                onBlur={(e) => {
                  if (!e.currentTarget.checkValidity()) {
                    e.currentTarget.reportValidity();
                    return;
                  }
                  if (
                    !a.isPending &&
                    Number(e.target.value) !== w.filters.salaryMin
                  )
                    change({ salaryMin: Number(e.target.value) });
                }}
              />
            </Field>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={!w.filters.salaryOnly}
                disabled={a.isPending}
                onChange={(e) => change({ salaryOnly: !e.target.checked })}
              />
              Aceitar salário não anunciado
            </label>
          </div>
        </details>
        <Button
          disabled={a.isPending}
          onClick={() => {
            setCity("");
            setSalaryMin("");
            change({
              modalities: [],
              locations: [],
              salaryMin: 0,
              salaryMax: 0,
              salaryOnly: false,
              dateKnownOnly: false,
              ageDays: 365,
              levels: [],
              skills: [],
              contracts: [],
              requiredSkills: [],
              language: "",
            });
          }}
        >
          Limpar filtros
        </Button>
      </div>
      <div className="search-input simple-job-search">
        <Search size={16} />
        <input
          aria-label="Buscar vagas"
          placeholder="Buscar por cargo ou empresa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <DiscoveryStatus />
      {detail.isError && (
        <div className="recoverable-error" role="alert">
          <p>Não conseguimos abrir esta vaga. {detail.error.message}</p>
          <Button disabled={detail.isFetching} onClick={() => detail.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      <p className="count-caption" role="status">
        {result.isPending
          ? "Carregando vagas…"
          : result.isError
            ? "Consulta indisponível"
            : `${total} ${total === 1 ? "vaga encontrada" : "vagas encontradas"}`}
      </p>
      {result.isPending ? (
        <div className="panel">
          <Empty
            title="Carregando vagas"
            description="Aguarde um instante."
            mascot="thinking"
            animated
          />
        </div>
      ) : result.isError ? (
        <div className="panel">
          <Empty
            title="Não foi possível carregar"
            mascot="surprised"
            description={result.error.message}
            action={
              <Button onClick={() => result.refetch()}>Tentar novamente</Button>
            }
          />
        </div>
      ) : result.data?.items.length ? (
        <div className="job-grid">
          {result.data.items.map((job) => (
            <JobCard key={job.id} job={job} onClick={() => setSelected(job)} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={
              searching
                ? "Estamos consultando suas fontes"
                : sourceFailed
                  ? "A busca precisa de atenção"
                  : !w.runs.length
                    ? "Faça sua primeira busca"
                    : "Nenhuma vaga com estes critérios"
            }
            description={
              searching
                ? "Você pode sair desta página. A busca continua e os resultados aparecerão aqui."
                : sourceFailed
                  ? "Uma ou mais fontes não puderam ser consultadas. Confira o relatório da busca acima e tente novamente."
                  : !w.runs.length
                    ? "Escolha seus critérios e clique em Buscar vagas para consultar as fontes disponíveis."
                    : "Nenhum anúncio corresponde aos filtros atuais. Você pode revisar os critérios ou buscar novamente."
            }
            animated={searching}
            action={
              <div className="empty-actions">
                <Button
                  className="primary"
                  disabled={a.isPending || searching}
                  onClick={() => a.mutate({ path: "/discover" })}
                >
                  <Search size={15} />
                  {searching ? "Buscando…" : "Buscar novamente"}
                </Button>
                <Button onClick={() => navigate("preferencias")}>
                  Revisar minhas preferências
                </Button>
              </div>
            }
          />
        </div>
      )}
      {totalPages > 1 && (
        <div className="pagination">
          <span>
            Página {page} de {totalPages}
          </span>
          <div>
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={15} />
              Anterior
            </Button>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
      <JobDetail job={selected} close={() => setSelected(null)} />
    </div>
  );
}
