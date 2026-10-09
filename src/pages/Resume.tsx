import { useState } from "react";
import {
  FileText,
  Upload,
  CheckCircle2,
  Download,
  Eye,
  UserRound,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Mascot,
  Modal,
  PageHead,
  Panel,
} from "../components";
import { date, useAction, useApp } from "../lib";
import type { Resume as ResumeType } from "../../shared/types";
import ResumeBuilder from "../ResumeBuilder";
import ResumeTargets from "../ResumeTargets";
export default function Resume() {
  const { w, demo, navigate, toast } = useApp();
  const a = useAction();
  const [building, setBuilding] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [view, setView] = useState<ResumeType | null>(null);
  if (building)
    return (
      <ResumeBuilder
        onCancel={() => setBuilding(false)}
        onComplete={() => setBuilding(false)}
      />
    );
  return (
    <div>
      <PageHead
        eyebrow="SUA HISTÓRIA PROFISSIONAL"
        title="Meu currículo"
        description="Envie seu currículo, confira a extração e escolha versões aprovadas para suas candidaturas."
      >
        <Button className="primary" onClick={() => setBuilding(true)}>
          <FileText size={15} />
          Ainda não tenho currículo
        </Button>
        <Button onClick={() => navigate("perfil")}>
          <UserRound size={15} />
          Revisar perfil
        </Button>
      </PageHead>
      <div className="settings-grid">
        <div className="stack">
          <Panel
            title="Um bom ponto de partida"
            detail="PDF com texto selecionável ou DOCX. Até 5 MB."
          >
            <form
              className="upload-zone"
              onSubmit={(e) => {
                e.preventDefault();
                if (!file) return;
                const form = new FormData();
                form.append("file", file);
                a.mutate(
                  { path: "/resumes", body: form },
                  {
                    onSuccess: () => {
                      setFile(null);
                      toast(
                        "Currículo extraído. Revise seu perfil e aprove esta versão.",
                      );
                    },
                  },
                );
              }}
            >
              <Mascot
                className="upload-mascot"
                variant={
                  a.isError
                    ? "surprised"
                    : a.isPending
                      ? "thinking"
                      : "handing-resume"
                }
                animated={a.isPending}
                eager
              />
              <h3>Seu próximo passo começa pelo currículo</h3>
              <p>
                Escolha um arquivo para identificar suas competências e
                preservar sua versão original.
              </p>
              <input
                type="file"
                accept=".pdf,.docx"
                aria-label="Selecionar currículo"
                disabled={demo || a.isPending}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Button
                className="primary"
                disabled={!file || demo || a.isPending}
              >
                <Sparkles size={15} />
                {a.isPending
                  ? "Extraindo texto e competências…"
                  : "Enviar e analisar currículo"}
              </Button>
              {demo && (
                <p className="muted">
                  Volte aos seus dados para enviar seu currículo real.
                </p>
              )}
            </form>
          </Panel>
          <Panel
            title="Suas versões"
            detail={`${w.resumes.length} versões no seu espaço`}
          >
            {w.resumes.length ? (
              w.resumes.map((r) => (
                <article className="resume-card" key={r.id}>
                  <div className="resume-card-head">
                    <span className="connection-icon">
                      <FileText size={19} />
                    </span>
                    <div>
                      <strong>{r.name}</strong>
                      <p>Adicionado em {date(r.uploadedAt, true)}</p>
                    </div>
                    <Badge tone={r.approved ? "green" : "amber"}>
                      {r.approved ? "Aprovado" : "Revisão pendente"}
                    </Badge>
                  </div>
                  <p className="resume-analysis">{r.analysis}</p>
                  <div className="skill-tags">
                    {r.skills.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                  <ResumeTargets
                    key={`${r.id}:${r.targetsMethod}:${r.targets?.map((t) => t.title).join(",")}`}
                    resume={r}
                  />
                  <div className="resume-actions">
                    <Button
                      disabled={demo || a.isPending}
                      onClick={() =>
                        a.mutate(
                          { path: `/resumes/${r.id}/analyze` },
                          {
                            onSuccess: () =>
                              toast(
                                "Análise atualizada. Confira os cargos sugeridos.",
                              ),
                          },
                        )
                      }
                    >
                      <Sparkles size={14} />
                      Analisar novamente
                    </Button>
                    <Button onClick={() => setView(r)}>
                      <Eye size={14} />
                      Revisar texto
                    </Button>
                    {!demo && (
                      <a
                        className="button"
                        href={`/api/resumes/${r.id}/download?demo=false`}
                      >
                        <Download size={14} />
                        Baixar original
                      </a>
                    )}
                    <Button
                      disabled={a.isPending}
                      onClick={() =>
                        a.mutate(
                          {
                            path: `/resumes/${r.id}`,
                            method: "PATCH",
                            body: { approved: !r.approved },
                          },
                          {
                            onSuccess: () =>
                              toast(
                                r.approved
                                  ? "Aprovação removida."
                                  : "Versão aprovada para candidaturas.",
                              ),
                          },
                        )
                      }
                    >
                      <CheckCircle2 size={14} />
                      {r.approved ? "Revogar aprovação" : "Aprovar esta versão"}
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <Empty
                mascot="writing"
                title="Sua história ainda não chegou aqui"
                description="Envie o currículo e mantenha as versões que melhor representam sua experiência."
                icon={<FileText size={27} />}
              />
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Da extração à sua confirmação">
            <div className="integration-info">
              <p>
                A análise identifica habilidades e informações presentes no
                texto do arquivo, para qualquer profissão.
              </p>
              <p>
                Experiências, formação, idiomas, cursos e anos de experiência
                precisam da sua revisão no perfil.
              </p>
              <p>
                PDFs digitalizados precisam de OCR externo. Nenhuma informação é
                preenchida por suposição.
              </p>
              <Button className="full" onClick={() => navigate("perfil")}>
                Conferir meu perfil
              </Button>
            </div>
          </Panel>
          <Panel title="Versões para cada direção">
            <div className="integration-info">
              <p>
                Você pode criar ou enviar versões para diferentes áreas e
                objetivos. Apenas versões aprovadas podem ser usadas em
                candidaturas.
              </p>
              <p>
                A versão mais recente aprovada é a padrão para novas
                candidaturas.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <Modal
        title={view?.name || "Texto do currículo"}
        description="Confira o texto extraído antes de aprovar a versão."
        open={!!view}
        onOpenChange={(v) => !v && setView(null)}
        wide
      >
        <pre className="resume-text">{view?.text}</pre>
        <div className="modal-footer">
          <Button
            onClick={() => {
              setView(null);
              navigate("perfil");
            }}
          >
            Corrigir perfil
          </Button>
          <Button className="primary" onClick={() => setView(null)}>
            Concluir revisão
          </Button>
        </div>
      </Modal>
    </div>
  );
}
