import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Save } from "lucide-react";
import { Button, Field, Modal } from "./components";
import { split, useAction, useApp } from "./lib";
import type { Filters } from "../shared/types";
function Choices({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <span className="check-label">{title}</span>
      <div className="check-group">
        {items.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={value.includes(s)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, s]
                    : value.filter((v) => v !== s),
                )
              }
            />
            {s}
          </label>
        ))}
      </div>
    </div>
  );
}
export function FiltersModal({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) {
  const { w, toast } = useApp();
  const a = useAction();
  const [f, setF] = useState<Filters>(structuredClone(w.filters)),
    [name, setName] = useState("");
  const update = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((old) => ({ ...old, [k]: v }));
  return (
    <Modal
      title="Direcione sua busca"
      description="Defina os critérios que fazem uma oportunidade valer seu tempo."
      open={open}
      onOpenChange={(v) => !v && close()}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.mutate(
            { path: "/filters", method: "PUT", body: f },
            {
              onSuccess: () => {
                toast("Filtros atualizados. Compatibilidade recalculada.");
                close();
              },
            },
          );
        }}
      >
        <div className="form-grid">
          <Field
            label="Cargos e títulos"
            help="Separe por vírgulas. O Radar também considera cargos relacionados."
          >
            <textarea
              value={f.titles.join(", ")}
              onChange={(e) =>
                update(
                  "titles",
                  e.target.value.split(",").map((t) => t.trim()),
                )
              }
            />
          </Field>
          <Field
            label="Competências desejadas"
            help="A vaga deve citar pelo menos uma das competências selecionadas. Deixe vazio para não limitar."
          >
            <textarea
              value={f.skills.join(", ")}
              onChange={(e) =>
                update(
                  "skills",
                  e.target.value.split(",").map((t) => t.trim()),
                )
              }
            />
          </Field>
        </div>
        <Choices
          title="Senioridade"
          items={[
            "Primeiro emprego",
            "Aprendiz",
            "Estágio",
            "Trainee",
            "Júnior",
            "Pleno",
            "Sênior",
            "Não especificado",
          ]}
          value={f.levels}
          onChange={(v) => update("levels", v)}
        />
        <Choices
          title="Modalidade"
          items={["Remoto", "Híbrido", "Presencial", "Não especificado"]}
          value={f.modalities}
          onChange={(v) => update("modalities", v)}
        />
        <Choices
          title="Contratação"
          items={[
            "CLT",
            "Aprendiz",
            "PJ",
            "Estágio",
            "Temporário",
            "Freelancer",
            "Não especificado",
          ]}
          value={f.contracts}
          onChange={(v) => update("contracts", v)}
        />
        <div className="form-grid">
          <Field
            label="Salário mínimo (R$)"
            help="Salário não informado permanece desconhecido."
          >
            <input
              type="number"
              min="0"
              value={f.salaryMin}
              onChange={(e) => update("salaryMin", Number(e.target.value))}
            />
          </Field>
          <Field label="Experiência máxima exigida (anos)">
            <input
              type="number"
              min="0"
              max="70"
              value={f.maxYears}
              onChange={(e) => update("maxYears", Number(e.target.value))}
            />
          </Field>
          <Field label={`Compatibilidade mínima: ${f.minScore}/100`}>
            <input
              type="range"
              min="0"
              max="100"
              value={f.minScore}
              onChange={(e) => update("minScore", Number(e.target.value))}
            />
          </Field>
          <Field label="Publicadas nos últimos">
            <select
              value={f.ageDays}
              onChange={(e) => update("ageDays", Number(e.target.value))}
            >
              {[1, 3, 7, 30, 90, 365].map((n) => (
                <option value={n} key={n}>
                  {n} {n === 1 ? "dia" : "dias"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Competências indispensáveis"
            help="Ausência impede preparar a candidatura."
          >
            <input
              value={f.requiredSkills.join(", ")}
              onChange={(e) =>
                update(
                  "requiredSkills",
                  e.target.value.split(",").map((t) => t.trim()),
                )
              }
            />
          </Field>
          <Field
            label="Países e cidades"
            help="Deixe vazio para todas as localizações."
          >
            <input
              value={f.locations.join(", ")}
              onChange={(e) =>
                update(
                  "locations",
                  e.target.value.split(",").map((t) => t.trim()),
                )
              }
            />
          </Field>
          <Field label="Empresas bloqueadas">
            <input
              value={f.blockedCompanies.join(", ")}
              onChange={(e) =>
                update(
                  "blockedCompanies",
                  e.target.value.split(",").map((t) => t.trim()),
                )
              }
            />
          </Field>
          <Field label="Termos a excluir">
            <input
              value={f.excludedTerms.join(", ")}
              onChange={(e) =>
                update(
                  "excludedTerms",
                  e.target.value.split(",").map((t) => t.trim()),
                )
              }
            />
          </Field>
          <Field
            label="Idioma citado na vaga"
            help="A vaga precisa mencionar esse idioma. Deixe vazio para não limitar."
          >
            <input
              value={f.language}
              onChange={(e) => update("language", e.target.value)}
              placeholder="Ex.: inglês"
            />
          </Field>
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={f.salaryOnly}
            onChange={(e) => update("salaryOnly", e.target.checked)}
          />
          Exigir salário divulgado
        </label>
        <div className="info-inline" style={{ marginTop: 20 }}>
          Dados que a fonte não informa ficam pendentes. Restrições geográficas
          de vagas remotas precisam ser conferidas na descrição.
        </div>
        <Field label="Salvar como perfil de busca (opcional)">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Atendimento perto de casa"
            />
            <Button
              type="button"
              disabled={!name.trim() || a.isPending}
              onClick={() =>
                a.mutate(
                  {
                    path: "/search-profiles",
                    body: {
                      name: name.trim(),
                      filters: f,
                      mode: w.routine.mode,
                    },
                  },
                  {
                    onSuccess: () => {
                      setName("");
                      toast("Perfil de busca salvo.");
                    },
                  },
                )
              }
            >
              <Save size={15} />
              Salvar perfil
            </Button>
          </div>
        </Field>
        <div className="modal-footer">
          <Button type="button" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" className="primary" disabled={a.isPending}>
            <Check size={15} />
            Aplicar filtros
          </Button>
        </div>
      </form>
    </Modal>
  );
}
const importSchema = z.object({
  title: z.string().min(2, "Informe o cargo"),
  company: z.string().min(2, "Informe a empresa"),
  description: z
    .string()
    .min(20, "Descreva a vaga com pelo menos 20 caracteres"),
  url: z.union([z.literal(""), z.url()]),
});
export function ImportModal({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) {
  const { toast } = useApp();
  const a = useAction();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof importSchema>>({
    resolver: zodResolver(importSchema),
    defaultValues: { url: "" },
  });
  return (
    <Modal
      title="Adicionar uma oportunidade"
      description="Registre uma vaga encontrada por você e receba uma análise de aderência."
      open={open}
      onOpenChange={(v) => !v && close()}
      wide
    >
      <form
        onSubmit={handleSubmit((values, e) => {
          const form = new FormData(e?.target as HTMLFormElement);
          const number = (key: string) =>
            form.get(key) ? Number(form.get(key)) : null;
          a.mutate(
            {
              path: "/jobs",
              body: {
                ...values,
                location: form.get("location") || "Não especificado",
                modality: form.get("modality"),
                level: form.get("level"),
                contract: form.get("contract"),
                salaryMin: number("salaryMin"),
                salaryMax: number("salaryMax"),
                currency: form.get("currency"),
                requiredYears: number("requiredYears"),
                skills: split(String(form.get("skills") || "")),
                requiredSkills: split(String(form.get("requiredSkills") || "")),
              },
            },
            {
              onSuccess: () => {
                toast("Oportunidade adicionada e analisada.");
                close();
              },
            },
          );
        })}
      >
        <div className="form-grid">
          <Field label="Cargo">
            <input {...register("title")} required />
            {errors.title && (
              <small className="negative">{errors.title.message}</small>
            )}
          </Field>
          <Field label="Empresa">
            <input {...register("company")} required />
            {errors.company && (
              <small className="negative">{errors.company.message}</small>
            )}
          </Field>
          <Field label="Link oficial">
            <input {...register("url")} type="url" placeholder="https://…" />
            {errors.url && <small className="negative">URL inválida</small>}
          </Field>
          <Field label="Localização">
            <input name="location" placeholder="Brasil / São Paulo, SP" />
          </Field>
          <Field label="Modalidade">
            <select name="modality">
              {["Remoto", "Híbrido", "Presencial", "Não especificado"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Senioridade">
            <select name="level">
              {[
                "Júnior",
                "Estágio",
                "Trainee",
                "Pleno",
                "Sênior",
                "Não especificado",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Contratação">
            <select name="contract">
              {[
                "CLT",
                "PJ",
                "Estágio",
                "Freelancer",
                "Temporário",
                "Não especificado",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Moeda">
            <select name="currency">
              <option>BRL</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </Field>
          <Field label="Salário mínimo anunciado">
            <input
              type="number"
              min="0"
              name="salaryMin"
              placeholder="Não divulgado"
            />
          </Field>
          <Field label="Salário máximo anunciado">
            <input
              type="number"
              min="0"
              name="salaryMax"
              placeholder="Não divulgado"
            />
          </Field>
          <Field
            label="Competências citadas"
            help="Separe por vírgulas ou deixe para a extração local."
          >
            <input
              name="skills"
              placeholder="Ex.: atendimento, planilhas, estoque"
            />
          </Field>
          <Field
            label="Requisitos indispensáveis"
            help="Informe apenas competências explicitamente obrigatórias."
          >
            <input name="requiredSkills" />
          </Field>
          <Field label="Anos de experiência exigidos">
            <input
              type="number"
              min="0"
              name="requiredYears"
              placeholder="Não informado"
            />
          </Field>
        </div>
        <Field label="Descrição completa">
          <textarea
            {...register("description")}
            rows={7}
            required
            minLength={20}
          />
          {errors.description && (
            <small className="negative">{errors.description.message}</small>
          )}
        </Field>
        <div className="modal-footer">
          <Button type="button" onClick={close}>
            Cancelar
          </Button>
          <Button className="primary" disabled={a.isPending}>
            Adicionar e analisar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
