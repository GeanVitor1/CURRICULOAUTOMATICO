import { useRef, useState } from "react";
import { ArrowRight, FileText, Download } from "lucide-react";
import { Button, Field, Mascot, PageHead } from "./components";
import { useAction, useApp } from "./lib";
import ResumeBuilder from "./ResumeBuilder";
import IntelligenceControl from "./IntelligenceControl";

export default function SimpleResume() {
  const { w, navigate, toast } = useApp();
  const a = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [building, setBuilding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadPending = useRef(false);
  const [error, setError] = useState("");
  const resume = w.resumes[0];
  if (building)
    return (
      <ResumeBuilder
        onCancel={() => setBuilding(false)}
        onComplete={() => {
          setBuilding(false);
          navigate("preferencias");
        }}
      />
    );
  const upload = async () => {
    if (!file || uploadPending.current || savingConsent || a.isPending) return;
    uploadPending.current = true;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await a.mutateAsync({ path: "/resumes", body: form });
      toast("Currículo analisado. Vamos conhecer suas preferências.");
      navigate("preferencias");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível analisar o currículo.",
      );
    } finally {
      uploadPending.current = false;
      setUploading(false);
    }
  };
  return (
    <div className="career-flow">
      <PageHead
        title="Seu currículo"
        description="Envie o arquivo. Nós identificamos sua experiência e os cargos que combinam com ela."
      />
      <section className="interview-card">
        <Mascot
          className="journey-mascot"
          variant={uploading ? "thinking" : "handing-resume"}
          animated={uploading}
          decorative
        />
        <h2>
          {uploading
            ? "Analisando seu currículo…"
            : resume
              ? "Seu currículo está salvo"
              : "Vamos começar pelo seu currículo"}
        </h2>
        {resume && (
          <div className="resume-summary">
            <FileText size={20} />
            <div>
              <strong>{resume.name}</strong>
              <p>
                {resume.targets
                  ?.slice(0, 3)
                  .map((target) => target.title)
                  .join(" · ") || "Vamos confirmar os cargos na entrevista."}
              </p>
            </div>
            <a
              href={`/api/resumes/${resume.id}/download`}
              className="button"
              aria-label="Baixar currículo"
            >
              <Download size={16} />
            </a>
          </div>
        )}
        <form
          aria-busy={uploading}
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <Field
            label={
              resume
                ? "Substituir currículo (opcional)"
                : "Escolha seu currículo"
            }
            help="PDF ou DOCX, até 5 MB."
          >
            <input
              aria-label="Selecionar currículo"
              type="file"
              accept=".pdf,.docx"
              disabled={uploading}
              onChange={(e) => {
                const next = e.target.files?.[0] || null;
                setError("");
                if (
                  next &&
                  (!/\.(pdf|docx)$/i.test(next.name) ||
                    next.size > 5 * 1024 * 1024 ||
                    next.size === 0)
                ) {
                  setFile(null);
                  e.target.value = "";
                  setError(
                    next.size === 0
                      ? "O arquivo está vazio. Escolha um currículo válido."
                      : next.size > 5 * 1024 * 1024
                        ? "O arquivo excede 5 MB. Escolha uma versão menor."
                        : "Escolha um currículo em PDF ou DOCX.",
                  );
                  return;
                }
                setFile(next);
              }}
            />
          </Field>
          {error && (
            <p className="negative" role="alert">
              {error}
            </p>
          )}
          <div className="interview-actions">
            {resume && !file ? (
              <Button
                type="button"
                className="primary"
                onClick={() => navigate("preferencias")}
              >
                Continuar para as perguntas
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                className="primary"
                disabled={!file || uploading || savingConsent}
              >
                {uploading ? "Analisando…" : "Enviar e continuar"}
                <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </form>
        <IntelligenceControl
          disabled={uploading || a.isPending}
          onBusyChange={setSavingConsent}
        />
        {!resume && (
          <Button onClick={() => setBuilding(true)}>
            Ainda não tenho currículo
          </Button>
        )}
        {resume && (
          <details className="interview-extra">
            <summary>Ver o que foi identificado</summary>
            <p>{resume.skills.join(" · ")}</p>
            <pre className="resume-extracted">{resume.text}</pre>
            <Button
              disabled={a.isPending || uploading || savingConsent}
              onClick={() =>
                a.mutate({ path: `/resumes/${resume.id}/analyze` })
              }
            >
              Analisar novamente
            </Button>
          </details>
        )}
      </section>
    </div>
  );
}
