import { useState } from "react";
import { UserRound, CheckCircle2, Save, Sparkles } from "lucide-react";
import { Badge, Button, Field, PageHead, Panel } from "../components";
import { split, useAction, useApp } from "../lib";
export default function Profile() {
  const { w, toast } = useApp();
  const a = useAction();
  const [p, setP] = useState(structuredClone(w.profile));
  const [skillsText, setSkills] = useState(p.skills.join(", "));
  const update = (key: keyof typeof p, value: any) =>
    setP((old) => ({ ...old, [key]: value }));
  return (
    <div>
      <PageHead
        eyebrow="O PONTO DE PARTIDA"
        title="Perfil profissional"
        description="Seu perfil real dá direção a cada conexão. Confira e ajuste as informações."
      />
      <div className="settings-grid">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            a.mutate(
              {
                path: "/profile",
                method: "PUT",
                body: { ...p, skills: split(skillsText) },
              },
              {
                onSuccess: () =>
                  toast("Perfil salvo e compatibilidade atualizada."),
              },
            );
          }}
        >
          <div className="form-card">
            <h3>Sobre você</h3>
            <div className="form-grid">
              <Field label="Nome">
                <input
                  value={p.name}
                  required
                  onChange={(e) => update("name", e.target.value)}
                />
              </Field>
              <Field label="Título profissional">
                <input
                  value={p.headline}
                  onChange={(e) => update("headline", e.target.value)}
                  placeholder="Ex.: Auxiliar administrativo ou atendimento"
                />
              </Field>
              <Field label="E-mail profissional">
                <input
                  type="email"
                  value={p.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </Field>
              <Field label="Cidade e país">
                <input
                  value={p.location}
                  onChange={(e) => update("location", e.target.value)}
                />
              </Field>
              <Field label="Senioridade">
                <select
                  value={p.level}
                  onChange={(e) => update("level", e.target.value)}
                >
                  {[
                    "Primeiro emprego",
                    "Aprendiz",
                    "Estágio",
                    "Trainee",
                    "Júnior",
                    "Pleno",
                    "Sênior",
                    "Não especificado",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Anos de experiência confirmados"
                help="Deixe vazio se ainda precisa conferir."
              >
                <input
                  type="number"
                  min="0"
                  max="70"
                  step="0.5"
                  value={p.years ?? ""}
                  onChange={(e) =>
                    update(
                      "years",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </Field>
            </div>
            <Field
              label="Competências confirmadas"
              help="Separe por vírgulas. Adicione somente conhecimentos que você possui."
            >
              <textarea
                value={skillsText}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Ex.: atendimento ao cliente, planilhas, organização de estoque"
              />
            </Field>
          </div>
          <div className="form-card">
            <h3>Experiência e formação</h3>
            <Field
              label="Experiências e projetos"
              help="Inclua cargo, empresa, períodos e responsabilidades verdadeiras."
            >
              <textarea
                rows={5}
                value={p.experience}
                onChange={(e) => update("experience", e.target.value)}
              />
            </Field>
            <Field label="Formação, cursos e certificações">
              <textarea
                rows={3}
                value={p.education}
                onChange={(e) => update("education", e.target.value)}
              />
            </Field>
            <Field label="Idiomas">
              <input
                value={p.languages}
                onChange={(e) => update("languages", e.target.value)}
                placeholder="Português nativo, inglês intermediário"
              />
            </Field>
          </div>
          <div className="form-card">
            <h3>Seus próximos passos</h3>
            <div className="form-grid">
              <Field label="Salário mínimo mensal (R$)">
                <input
                  type="number"
                  min="0"
                  value={p.salaryMin}
                  onChange={(e) => update("salaryMin", Number(e.target.value))}
                />
              </Field>
              <Field label="Salário desejado mensal (R$)">
                <input
                  type="number"
                  min="0"
                  value={p.salaryDesired}
                  onChange={(e) =>
                    update("salaryDesired", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="GitHub (opcional, para quem usa)">
                <input
                  type="url"
                  value={p.github}
                  onChange={(e) => update("github", e.target.value)}
                  placeholder="https://github.com/seu-usuario"
                />
              </Field>
              <Field label="Portfólio (opcional)">
                <input
                  type="url"
                  value={p.portfolio}
                  onChange={(e) => update("portfolio", e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Disponibilidade">
                <input
                  value={p.availability}
                  onChange={(e) => update("availability", e.target.value)}
                  placeholder="Ex.: início imediato"
                />
              </Field>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={p.confirmed}
                onChange={(e) => update("confirmed", e.target.checked)}
              />
              Revisei e confirmo que as informações do meu perfil são
              verdadeiras.
            </label>
            <div className="form-actions">
              <Button className="primary" disabled={a.isPending}>
                <Save size={15} />
                {a.isPending ? "Salvando…" : "Salvar perfil"}
              </Button>
            </div>
          </div>
        </form>
        <div className="stack">
          <section className="panel profile-summary">
            <span className="avatar">
              {p.name.slice(0, 2).toUpperCase() || <UserRound size={25} />}
            </span>
            <h3>{p.name || "Seu nome"}</h3>
            <p>{p.headline || "Seu título profissional"}</p>
            <p>{p.location || "Localização pendente"}</p>
            <div className="skill-tags">
              {split(skillsText).map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <Badge tone={w.profile.confirmed ? "green" : "amber"}>
              {w.profile.confirmed
                ? "Perfil confirmado"
                : "Aguardando confirmação"}
            </Badge>
          </section>
          <Panel title="Um perfil fiel a você">
            <div className="integration-info">
              <p>
                <Sparkles
                  size={16}
                  style={{
                    display: "inline",
                    color: "var(--accent)",
                    marginRight: 7,
                  }}
                />
                A extração do currículo sugere competências. Você confirma o que
                conhece.
              </p>
              <p>
                Informações não identificadas ficam pendentes. A plataforma não
                cria experiências, certificações ou respostas sobre você.
              </p>
              <p>
                <CheckCircle2
                  size={15}
                  style={{
                    display: "inline",
                    color: "var(--green)",
                    marginRight: 7,
                  }}
                />
                Confirme o perfil para preparar candidaturas.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
