import { useMemo, useState } from "react";
import { BrainCircuit, Check, Pencil, Trash2 } from "lucide-react";
import { Button, PageHead } from "./components";
import { date, useAction, useApp } from "./lib";
import { languageLevels } from "../shared/application-preferences";
import {
  effectiveAnswerMemory,
  groupPendingQuestions,
  topicLabels,
  type AnswerMemoryEntry,
  type AnswerTopic,
  type PendingGroup,
} from "../shared/answer-topics";
import "./smart-profile.css";

type Essentials = {
  relocation: "" | "yes" | "conditional" | "no";
  cities: string;
  modalities: string[];
  travel: "" | "yes" | "no";
  weekend: "" | "yes" | "no";
  contracts: string[];
  salary: string;
  start: string;
  english: string;
};
const modalityOptions = [["remoto", "Remoto"], ["hibrido", "Híbrido"], ["presencial", "Presencial"]] as const;
const contractOptions = [["clt", "CLT"], ["pj", "PJ"], ["estagio", "Estágio"], ["freelancer", "Freelancer"]] as const;
const yesNoTopics: AnswerTopic[] = ["relocation_willingness", "travel_availability", "weekend_availability", "driver_license", "own_vehicle", "night_shift", "current_employment", "work_authorization"];
const sourceLabel = { user: "Você", resume: "Currículo", preferences: "Preferências" } as const;

function describe(entry: AnswerMemoryEntry) {
  const v = entry.value;
  if (v === "yes") return "Sim";
  if (v === "no") return "Não";
  if (v === "conditional") return `Depende${entry.conditions?.cities?.length ? `: ${entry.conditions.cities.join(", ")}` : ""}`;
  if (entry.topic === "work_modality") return v.split(",").map((x) => modalityOptions.find(([k]) => k === x)?.[1] || x).join(", ");
  if (entry.topic === "contract_type") return v.split(",").map((x) => contractOptions.find(([k]) => k === x)?.[1] || x).join(", ");
  if (entry.topic === "salary_expectation") return /^\d+$/.test(v) ? `R$ ${Number(v).toLocaleString("pt-BR")}` : v;
  return v;
}

function Choice({ name, value, current, onChange, children }: { name: string; value: string; current: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className={`sp-choice ${current === value ? "selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />
      {children}
    </label>
  );
}
function Check2({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`sp-choice ${checked ? "selected" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function PendingCard({ groups }: { groups: PendingGroup[] }) {
  const { toast } = useApp();
  const action = useAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!groups.length)
    return (
      <section className="sp-card sp-pending done">
        <Check size={20} />
        <div><h2>Nenhuma resposta pendente</h2><p>Quando uma vaga pedir algo que só você pode informar, a pergunta aparece aqui.</p></div>
      </section>
    );
  const total = new Set(groups.flatMap((g) => g.applicationIds)).size;
  const send = (group: PendingGroup) => {
    const value = values[group.key]?.trim();
    if (!value) return;
    setSending(group.key);
    setNotes((n) => ({ ...n, [group.key]: "" }));
    action.mutate(
      { path: "/pending-questions/answer", method: "POST", body: { confirmation: true, key: group.key, question: group.questions[0], value, reuse: true } },
      { onSuccess: (r: any) => {
          const msg = r?.released
            ? `Resposta salva. ${r.released} candidatura(s) voltaram para a fila de envio.`
            : "Resposta salva, mas ela não corresponde a nenhuma opção desta vaga. Escolha outra opção ou edite em Outras respostas aprendidas.";
          toast(msg);
          setNotes((n) => ({ ...n, [group.key]: r?.released ? "" : msg }));
        },
        onError: (e: any) => setNotes((n) => ({ ...n, [group.key]: e?.message || "Não foi possível salvar. Tente novamente." })),
        onSettled: () => setSending(null) },
    );
  };
  return (
    <section className="sp-card sp-pending">
      <header>
        <h2>Só precisamos de {groups.length} resposta{groups.length > 1 ? "s" : ""}</h2>
        <p>Elas destravam {total} candidatura{total > 1 ? "s" : ""}. Responda uma vez e reutilizamos em vagas equivalentes.</p>
      </header>
      <ol className="sp-groups">
        {groups.map((group) => {
          const isYesNo = group.topic && yesNoTopics.includes(group.topic);
          const current = values[group.key] || "";
          const set = (v: string) => setValues((s) => ({ ...s, [group.key]: v }));
          return (
            <li key={group.key}>
              <div className="sp-group-head">
                <strong>{group.label}</strong>
                <span className="sp-count">destrava {group.applicationIds.length} vaga{group.applicationIds.length > 1 ? "s" : ""}</span>
              </div>
              <ul className="sp-examples">{group.questions.slice(0, 3).map((q) => <li key={q}>“{q}”</li>)}</ul>
              <div className="sp-answer">
                {isYesNo ? (
                  <div className="sp-choices">
                    <Choice name={group.key} value="yes" current={current} onChange={set}>Sim</Choice>
                    <Choice name={group.key} value="no" current={current} onChange={set}>Não</Choice>
                  </div>
                ) : group.options.length ? (
                  <select aria-label={group.label} value={current} onChange={(e) => set(e.target.value)}>
                    <option value="">Selecione…</option>
                    {group.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input aria-label={group.label} value={current} placeholder="Sua resposta" onChange={(e) => set(e.target.value)} />
                )}
                <Button className="primary" aria-busy={sending === group.key} disabled={!current.trim() || action.isPending} onClick={() => send(group)}>{sending === group.key ? "Salvando…" : "Salvar resposta"}</Button>
              </div>
              {notes[group.key] && <p className="sp-note" role="status">{notes[group.key]}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function SmartProfile() {
  const { w, toast } = useApp();
  const action = useAction();
  const memory = useMemo(() => effectiveAnswerMemory(w.profile), [w.profile]);
  const pending = useMemo(() => groupPendingQuestions(w.applications), [w.applications]);
  const find = (topic: AnswerTopic) => memory.find((m) => m.topic === topic);
  const initial = (): Essentials => {
    const reloc = find("relocation_willingness");
    return {
      relocation: (reloc?.value as Essentials["relocation"]) || "",
      cities: reloc?.conditions?.cities?.join(", ") || "",
      modalities: find("work_modality")?.value.split(",").filter(Boolean) || [],
      travel: (find("travel_availability")?.value as Essentials["travel"]) || "",
      weekend: (find("weekend_availability")?.value as Essentials["weekend"]) || "",
      contracts: find("contract_type")?.value.split(",").filter(Boolean) || (w.profile.acceptsPj ? ["clt", "pj"] : []),
      salary: find("salary_expectation")?.value || (w.profile.salaryDesired ? String(w.profile.salaryDesired) : ""),
      start: find("start_availability")?.value || w.profile.availability || "",
      english: find("english_level")?.value || "",
    };
  };
  const [form, setForm] = useState<Essentials>(initial);
  const essentialTopics: AnswerTopic[] = ["relocation_willingness","work_modality","travel_availability","weekend_availability","contract_type","salary_expectation","start_availability","english_level"];
  const hasEssentials = essentialTopics.some((t) => memory.some((m) => m.topic === t && m.source === "user"));
  const [editingEssentials, setEditingEssentials] = useState(!hasEssentials);
  const learned = memory.filter((m) => !essentialTopics.includes(m.topic));
  const cancelEssentials = () => { setForm(initial()); setEditingEssentials(false); };
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const set = <K extends keyof Essentials>(key: K, value: Essentials[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: "modalities" | "contracts", value: string, on: boolean) =>
    set(key, on ? [...new Set([...form[key], value])] : form[key].filter((x) => x !== value));

  const save = () => {
    const entries: unknown[] = [];
    if (form.relocation) entries.push({ topic: "relocation_willingness", value: form.relocation,
      ...(form.relocation === "conditional" ? { conditions: { cities: form.cities.split(",").map((c) => c.trim()).filter(Boolean) } } : {}) });
    if (form.modalities.length) entries.push({ topic: "work_modality", value: form.modalities.join(",") });
    if (form.travel) entries.push({ topic: "travel_availability", value: form.travel });
    if (form.weekend) entries.push({ topic: "weekend_availability", value: form.weekend });
    if (form.contracts.length) entries.push({ topic: "contract_type", value: form.contracts.join(",") });
    if (Number(form.salary) > 0) entries.push({ topic: "salary_expectation", value: String(Number(form.salary)) });
    if (form.start.trim()) entries.push({ topic: "start_availability", value: form.start.trim() });
    if (form.english) entries.push({ topic: "english_level", value: form.english });
    if (!entries.length) return toast("Preencha ao menos uma preferência.");
    action.mutate({ path: "/answer-memory", method: "PUT", body: { confirmation: true, entries } },
      { onSuccess: (r: any) => { setEditingEssentials(false); toast(r?.released ? `Preferências salvas. ${r.released} candidatura(s) destravadas.` : "Preferências salvas."); } });
  };
  const remove = (entry: AnswerMemoryEntry) =>
    action.mutate({ path: `/answer-memory/${encodeURIComponent(entry.id)}`, method: "DELETE" }, { onSuccess: () => toast("Resposta excluída.") });
  const update = (entry: AnswerMemoryEntry, value: string) =>
    action.mutate({ path: "/answer-memory", method: "PUT", body: { confirmation: true,
      entries: [{ topic: entry.topic, ...(entry.params ? { params: entry.params } : {}), value, ...(entry.conditions ? { conditions: entry.conditions } : {}) }] } },
      { onSuccess: () => { setEditing(null); toast("Resposta atualizada."); } });

  return (
    <div className="career-flow smart-profile">
      <PageHead eyebrow="PERFIL INTELIGENTE" title="Respostas que só você define"
        description="A IA redige respostas e o currículo comprova experiências. Preferências e fatos pessoais vêm só de você — sem informação, nunca respondemos “não”." />
      <PendingCard groups={pending} />
      <section className="sp-card">
        <header><h2>Preferências essenciais</h2><p>Responda uma vez. Usamos estas respostas em qualquer pergunta equivalente, em português ou inglês.</p></header>
        {!editingEssentials ? (
          <>
            <dl className="sp-summary">
              {essentialTopics.map((t) => { const e = find(t); return (
                <div key={t} className="sp-summary-item"><dt>{topicLabels[t]}</dt><dd className={e ? "" : "muted"}>{e ? describe(e) : "Não informado"}</dd></div>
              ); })}
            </dl>
            <div className="sp-actions"><span className="sp-saved"><Check size={16} aria-hidden="true" /> Preferências salvas</span><Button onClick={() => { setForm(initial()); setEditingEssentials(true); }}><Pencil size={15} aria-hidden="true" /> Editar preferências</Button></div>
          </>
        ) : (<>
        <div className="sp-grid">
          <fieldset className="sp-field wide">
            <legend>Mudança de cidade</legend>
            <div className="sp-choices">
              <Choice name="reloc" value="yes" current={form.relocation} onChange={(v) => set("relocation", v as any)}>Sim, qualquer cidade</Choice>
              <Choice name="reloc" value="conditional" current={form.relocation} onChange={(v) => set("relocation", v as any)}>Depende da cidade e da proposta</Choice>
              <Choice name="reloc" value="no" current={form.relocation} onChange={(v) => set("relocation", v as any)}>Não tenho disponibilidade</Choice>
            </div>
            {form.relocation === "conditional" && (
              <input aria-label="Cidades aceitas" placeholder="Cidades aceitas, separadas por vírgula" value={form.cities} onChange={(e) => set("cities", e.target.value)} />
            )}
          </fieldset>
          <fieldset className="sp-field">
            <legend>Modalidades aceitas</legend>
            <div className="sp-choices">{modalityOptions.map(([k, l]) => <Check2 key={k} checked={form.modalities.includes(k)} onChange={(on) => toggle("modalities", k, on)}>{l}</Check2>)}</div>
          </fieldset>
          <fieldset className="sp-field">
            <legend>Tipo de contratação aceito</legend>
            <div className="sp-choices">{contractOptions.map(([k, l]) => <Check2 key={k} checked={form.contracts.includes(k)} onChange={(on) => toggle("contracts", k, on)}>{l}</Check2>)}</div>
          </fieldset>
          <fieldset className="sp-field">
            <legend>Viagens a trabalho</legend>
            <div className="sp-choices">
              <Choice name="travel" value="yes" current={form.travel} onChange={(v) => set("travel", v as any)}>Tenho disponibilidade</Choice>
              <Choice name="travel" value="no" current={form.travel} onChange={(v) => set("travel", v as any)}>Não tenho</Choice>
            </div>
          </fieldset>
          <fieldset className="sp-field">
            <legend>Fins de semana</legend>
            <div className="sp-choices">
              <Choice name="weekend" value="yes" current={form.weekend} onChange={(v) => set("weekend", v as any)}>Posso trabalhar</Choice>
              <Choice name="weekend" value="no" current={form.weekend} onChange={(v) => set("weekend", v as any)}>Não posso</Choice>
            </div>
          </fieldset>
          <label className="sp-field">
            <span className="sp-legend">Pretensão salarial (R$/mês)</span>
            <input inputMode="numeric" value={form.salary} onChange={(e) => set("salary", e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 8000" />
          </label>
          <label className="sp-field">
            <span className="sp-legend">Disponibilidade para início</span>
            <input value={form.start} onChange={(e) => set("start", e.target.value)} placeholder="Ex.: Imediata, 30 dias" />
          </label>
          <label className="sp-field">
            <span className="sp-legend">Nível de inglês</span>
            <select value={form.english} onChange={(e) => set("english", e.target.value)}>
              <option value="">Selecione…</option>
              {languageLevels.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="sp-actions">{hasEssentials && <Button onClick={cancelEssentials} disabled={action.isPending}>Cancelar</Button>}<Button className="primary" disabled={action.isPending} onClick={save}>{action.isPending ? "Salvando…" : "Salvar preferências"}</Button></div>
        </>)}
      </section>
      <section className="sp-card">
        <header><h2>Outras respostas aprendidas</h2><p>Respostas que você deu a perguntas novas das vagas, além das preferências acima. Você pode corrigir ou excluir a qualquer momento.</p></header>
        {learned.length ? (
          <ul className="sp-memory">
            {learned.map((entry) => (
              <li key={entry.id}>
                <div className="sp-memory-main">
                  <strong>{topicLabels[entry.topic]}{entry.params?.technology ? `: ${entry.params.technology}` : ""}</strong>
                  {editing?.id === entry.id ? (
                    <span className="sp-edit">
                      <input aria-label="Novo valor" value={editing.value} onChange={(e) => setEditing({ id: entry.id, value: e.target.value })} />
                      <Button className="primary" disabled={!editing.value.trim()} onClick={() => update(entry, editing.value.trim())}>Salvar</Button>
                      <Button onClick={() => setEditing(null)}>Cancelar</Button>
                    </span>
                  ) : <span className="sp-value">{describe(entry)}</span>}
                  {!!entry.examples.length && <small>Ex.: {entry.examples.slice(0, 2).map((q) => `“${q}”`).join(" · ")}</small>}
                </div>
                <div className="sp-memory-meta">
                  <small>{sourceLabel[entry.source]} · {date(entry.confirmedAt)}</small>
                  {entry.source === "user" ? (
                    <span className="sp-icons">
                      <button type="button" aria-label="Editar" onClick={() => setEditing({ id: entry.id, value: entry.value })}><Pencil size={15} /></button>
                      <button type="button" aria-label="Excluir" onClick={() => remove(entry)}><Trash2 size={15} /></button>
                    </span>
                  ) : <small>Edite na origem</small>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sp-empty"><BrainCircuit size={18} /> Quando você responder uma pergunta nova de uma vaga, ela aparece aqui para ser reutilizada.</p>
        )}
      </section>
    </div>
  );
}
