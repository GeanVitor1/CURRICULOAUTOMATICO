import { BarChart3, MessageSquare, BriefcaseBusiness } from "lucide-react";
import { Empty, PageHead, Panel } from "../components";
import { useApp, submitted } from "../lib";
export default function Analytics() {
  const { w } = useApp();
  const sent = w.applications.filter((a) => submitted(a.status));
  const responses = sent.filter((a) =>
    [
      "Em entrevista",
      "Teste técnico",
      "Proposta recebida",
      "Contratada",
      "Rejeitada",
    ].includes(a.status),
  );
  const interviews = sent.filter((a) =>
    [
      "Em entrevista",
      "Teste técnico",
      "Proposta recebida",
      "Contratada",
    ].includes(a.status),
  );
  const groups = new Map<
    string,
    { total: number; responses: number; interviews: number }
  >();
  sent.forEach((a) => {
    const j = w.jobs.find((j) => j.id === a.jobId);
    if (!j) return;
    const g = groups.get(j.source) || { total: 0, responses: 0, interviews: 0 };
    g.total++;
    if (responses.includes(a)) g.responses++;
    if (interviews.includes(a)) g.interviews++;
    groups.set(j.source, g);
  });
  const resumes = w.resumes.map((r) => ({
    r,
    total: sent.filter((a) => a.resumeId === r.id).length,
    replies: responses.filter((a) => a.resumeId === r.id).length,
  }));
  const byDay = new Map<string, number>();
  sent.forEach((a) => {
    const d = new Date(a.submittedAt || a.createdAt).toLocaleDateString(
      "pt-BR",
      { timeZone: "America/Sao_Paulo" },
    );
    byDay.set(d, (byDay.get(d) || 0) + 1);
  });
  return (
    <div>
      <PageHead
        eyebrow="APRENDA COM SUA JORNADA"
        title="Análises"
        description="Descubra quais fontes e versões do currículo geram conversas e próximos passos."
      />
      <div className="analytics-top">
        <div className="stat-card">
          <span>Candidaturas com envio confirmado</span>
          <strong>{sent.length}</strong>
          <small>Envios assistidos, manuais e autorizados</small>
        </div>
        <div className="stat-card">
          <span>Taxa de resposta registrada</span>
          <strong>
            {sent.length
              ? Math.round((responses.length / sent.length) * 100) + "%"
              : "—"}
          </strong>
          <small>
            {responses.length} respostas em {sent.length} candidaturas
          </small>
        </div>
        <div className="stat-card">
          <span>Conversão para entrevista ou teste</span>
          <strong>
            {sent.length
              ? Math.round((interviews.length / sent.length) * 100) + "%"
              : "—"}
          </strong>
          <small>{interviews.length} candidaturas avançaram</small>
        </div>
      </div>
      {!sent.length ? (
        <div className="panel">
          <Empty
            title="Sua estratégia ganha clareza com o tempo"
            description="Confirme envios e registre respostas. Assim você consegue comparar fontes e versões do currículo usando sua própria experiência."
            icon={<BarChart3 size={28} />}
          />
        </div>
      ) : (
        <div className="stack">
          <div className="settings-grid">
            <Panel
              title="Candidaturas por dia"
              detail="Volume de envios confirmados, sem contar preparação."
            >
              <div className="chart-content">
                {[...byDay].slice(-14).map(([d, n]) => (
                  <div className="chart-row" key={d}>
                    <span>{d}</span>
                    <div className="chart-bar">
                      <i
                        style={{
                          width: `${(n / Math.max(...byDay.values())) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Quais fontes geram conversas?">
              <div className="chart-content">
                {[...groups].map(([name, g]) => (
                  <div key={name} style={{ marginBottom: 22 }}>
                    <div className="chart-row">
                      <span>{name}</span>
                      <div className="chart-bar">
                        <i
                          style={{ width: `${(g.responses / g.total) * 100}%` }}
                        />
                      </div>
                      <strong>
                        {Math.round((g.responses / g.total) * 100)}%
                      </strong>
                    </div>
                    <p className="muted" style={{ fontSize: 12 }}>
                      {g.total} envios · {g.responses} respostas ·{" "}
                      {g.interviews} entrevistas
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel
            title="O desempenho das suas versões"
            detail="Compare a partir de dados registrados no seu workspace."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Versão do currículo</th>
                    <th>Envios</th>
                    <th>Respostas</th>
                    <th>Taxa registrada</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map(({ r, total, replies }) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{total}</td>
                      <td>{replies}</td>
                      <td>
                        {total
                          ? Math.round((replies / total) * 100) + "%"
                          : "Sem dados"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="analytics-notice">
              Os indicadores refletem apenas os status registrados. Diferenças
              entre fontes ou currículos não demonstram causalidade,
              especialmente com poucas candidaturas.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
