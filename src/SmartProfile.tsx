import { useMemo, useState } from "react";
import { BrainCircuit, Check, Pencil, Play, Trash2 } from "lucide-react";
import { candidatePortals, portals } from "../shared/portals";
import type { InterviewAnswers } from "../shared/types";
import { useBilling } from "./Billing";
import ApplicationPreferences from "./ApplicationPreferences";
import { EmailConnection } from "./EmailApplications";
import ReconciledRetry from "./ReconciledRetry";
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
  search: InterviewAnswers;
  answerAutomatically: boolean;
};
const contractOptions = [["clt", "CLT"], ["pj", "PJ"], ["estagio", "Estágio"], ["freelancer", "Freelancer"]] as const;
const modalityOptions = [["remoto", "Remoto"], ["hibrido", "Híbrido"], ["presencial", "Presencial"]] as const;
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

const contractChoices = [
  ["CLT", "clt"], ["PJ", "pj"], ["Estágio", "estagio"], ["Aprendiz", ""], ["Temporário", ""], ["Freelancer", "freelancer"],
] as const;
const modalityLabel: Record<string, string> = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };
const modalityKey = (label: string) => Object.entries(modalityLabel).find(([, l]) => l === label)?.[0] || label.toLowerCase();
const ageLabel = (days: number) => ({ 1: "Últimas 24 horas", 3: "Últimos 3 dias", 7: "Última semana", 30: "Último mês" } as Record<number, string>)[days] || "Qualquer data";
const money = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

export default function SmartProfile() {
  const { w, toast, navigate } = useApp();
  const action = useAction();
  const billing = useBilling();
  const planLimit = billing.data?.dailyLimit || 5;
  const resume = w.resumes[0];
  const memory = useMemo(() => effectiveAnswerMemory(w.profile), [w.profile]);
  const pending = useMemo(() => groupPendingQuestions(w.applications), [w.applications]);
  const find = (topic: AnswerTopic) => memory.find((m) => m.topic === topic);
  const savedInterview = w.interview?.answers.resumeId === resume?.id ? w.interview : undefined;
  const initialSearch = (): InterviewAnswers => savedInterview?.answers || {
    resumeId: resume?.id || "",
    phone: w.profile.phone || "",
    titles: resume?.targets?.slice(0, 3).map((t) => t.title) || w.filters.titles,
    modalities: w.filters.modalities.length ? w.filters.modalities : ["Remoto"],
    city: w.profile.location,
    sameCityOnly: true,
    salaryMin: w.filters.salaryMin,
    salaryMax: w.filters.salaryMax || 0,
    includeUnknownSalary: !w.filters.salaryOnly,
    ageDays: 7,
    contracts: w.filters.contracts,
    sites: candidatePortals.filter((s) => w.sources.some((src) => src.enabled && src.board === s)).length
      ? candidatePortals.filter((s) => w.sources.some((src) => src.enabled && src.board === s))
      : ["linkedin", "gupy"],
    dailyLimit: w.routine.dailyLimit,
  };
  const initial = (): Essentials => {
    const reloc = find("relocation_willingness");
    const search = initialSearch();
    const memoryContracts = find("contract_type")?.value.split(",").filter(Boolean) || [];
    return {
      relocation: (reloc?.value as Essentials["relocation"]) || "",
      cities: reloc?.conditions?.cities?.join(", ") || "",
      modalities: find("work_modality")?.value.split(",").filter(Boolean).map((k) => modalityLabel[k] || k) || search.modalities,
      travel: (find("travel_availability")?.value as Essentials["travel"]) || "",
      weekend: (find("weekend_availability")?.value as Essentials["weekend"]) || "",
      contracts: [...new Set([...search.contracts, ...contractChoices.filter(([, k]) => k && memoryContracts.includes(k)).map(([l]) => l)])],
      salary: "",
      start: find("start_availability")?.value || w.profile.availability || "",
      english: find("english_level")?.value || "",
      search: { ...search, salaryMin: search.salaryMin || Number(find("salary_expectation")?.value) || w.profile.salaryDesired || 0 },
      answerAutomatically: w.profile.answerPolicy?.enabled ?? true,
    };
  };
  const [form, setForm] = useState<Essentials>(initial);
  const [customTitle, setCustomTitle] = useState("");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const essentialTopics: AnswerTopic[] = ["relocation_willingness","work_modality","travel_availability","weekend_availability","contract_type","salary_expectation","start_availability","english_level"];
  const hasEssentials = !!w.interview?.completed || essentialTopics.some((t) => memory.some((m) => m.topic === t && m.source === "user"));
  const [editingEssentials, setEditingEssentials] = useState(!hasEssentials);
  const learned = memory.filter((m) => !essentialTopics.includes(m.topic));
  const cancelEssentials = () => { setForm(initial()); setEditingEssentials(false); };
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const set = <K extends keyof Essentials>(key: K, value: Essentials[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setSearch = <K extends keyof InterviewAnswers>(key: K, value: InterviewAnswers[K]) => setForm((f) => ({ ...f, search: { ...f.search, [key]: value } }));
  const toggle = (key: "modalities" | "contracts", value: string, on: boolean) =>
    set(key, on ? [...new Set([...form[key], value])] : form[key].filter((x) => x !== value));
  const toggleSite = (site: string) => setSearch("sites", form.search.sites.includes(site) ? form.search.sites.filter((s) => s !== site) : [...form.search.sites, site]);

  const keepRoutine: "save" | "prepare" | "automatic" = !w.routine.enabled ? "save" : w.routine.mode === "automatic" ? "automatic" : "prepare";
  const save = async (start: "save" | "prepare" | "automatic", activating = false) => {
    const s = form.search;
    if (resume) {
      if (!s.titles.length) return toast("Escolha pelo menos um cargo.");
      if (!form.modalities.length) return toast("Escolha pelo menos uma modalidade.");
      if (!s.sites.length) return toast("Escolha pelo menos um site.");
      if (s.sameCityOnly && !s.city.trim() && form.modalities.some((m) => m !== "Remoto")) return toast("Informe a cidade onde você mora.");
      if (s.salaryMax && s.salaryMax < s.salaryMin) return toast("O salário máximo deve ser maior que o mínimo.");
      if (!Number.isInteger(s.dailyLimit) || s.dailyLimit < 1 || s.dailyLimit > planLimit) return toast(`Escolha um limite de 1 a ${planLimit} candidaturas por dia.`);
    }
    const entries: unknown[] = [];
    if (form.relocation) entries.push({ topic: "relocation_willingness", value: form.relocation,
      ...(form.relocation === "conditional" ? { conditions: { cities: form.cities.split(",").map((c) => c.trim()).filter(Boolean) } } : {}) });
    if (form.modalities.length) entries.push({ topic: "work_modality", value: form.modalities.map(modalityKey).join(",") });
    if (form.travel) entries.push({ topic: "travel_availability", value: form.travel });
    if (form.weekend) entries.push({ topic: "weekend_availability", value: form.weekend });
    const contractKeys = contractChoices.filter(([l, k]) => k && form.contracts.includes(l)).map(([, k]) => k);
    if (contractKeys.length) entries.push({ topic: "contract_type", value: contractKeys.join(",") });
    if (s.salaryMin > 0) entries.push({ topic: "salary_expectation", value: String(s.salaryMin) });
    if (form.start.trim()) entries.push({ topic: "start_availability", value: form.start.trim() });
    if (form.english) entries.push({ topic: "english_level", value: form.english });
    if (!resume && !entries.length) return toast("Preencha ao menos uma preferência.");
    try {
      let released = 0;
      if (resume) {
        const answers: InterviewAnswers = { ...s, resumeId: resume.id, modalities: form.modalities,
          contracts: form.contracts.filter((c) => c !== "Freelancer") };
        await action.mutateAsync({ path: "/interview", method: "PUT", invalidate: !entries.length,
          body: { step: 5, answers, complete: true, answerAutomatically: form.answerAutomatically, start,
            destinationPolicy: w.routine.destinationPolicy || "any" } });
      }
      if (entries.length) {
        const r: any = await action.mutateAsync({ path: "/answer-memory", method: "PUT", body: { confirmation: true, entries } });
        released = r?.released || 0;
      }
      setEditingEssentials(false);
      toast(activating ? "Preferências salvas e envio automático ativado."
        : released ? `Preferências salvas. ${released} candidatura(s) destravadas.` : "Preferências salvas.");
      if (activating) navigate("automacao");
    } catch { /* useAction already shows the error */ }
  };
  const remove = (entry: AnswerMemoryEntry) =>
    action.mutate({ path: `/answer-memory/${encodeURIComponent(entry.id)}`, method: "DELETE" }, { onSuccess: () => toast("Resposta excluída.") });
  const update = (entry: AnswerMemoryEntry, value: string) =>
    action.mutate({ path: "/answer-memory", method: "PUT", body: { confirmation: true,
      entries: [{ topic: entry.topic, ...(entry.params ? { params: entry.params } : {}), value, ...(entry.conditions ? { conditions: entry.conditions } : {}) }] } },
      { onSuccess: () => { setEditing(null); toast("Resposta atualizada."); } });

  const view = initial(), vs = view.search;
  const summary: [string, string][] = [
    ...(resume ? [
      ["Cargos", vs.titles.join(", ") || "Não informado"],
      ["Cidade", vs.city ? `${vs.city}${vs.sameCityOnly ? " (presencial/híbrido só aqui)" : ""}` : "Não informado"],
    ] as [string, string][] : []),
    ["Modalidade de trabalho", view.modalities.join(", ") || "Não informado"],
    ["Tipo de contratação", view.contracts.join(", ") || "Todos"],
    ["Salário", `${vs.salaryMin ? `A partir de ${money(vs.salaryMin)}` : "Sem mínimo"}${vs.salaryMax ? ` até ${money(vs.salaryMax)}` : ""}${vs.includeUnknownSalary ? " · aceita não anunciado" : ""}`],
    ["Mudança de cidade", find("relocation_willingness") ? describe(find("relocation_willingness")!) : "Não informado"],
    ["Disponibilidade para viagens", find("travel_availability") ? describe(find("travel_availability")!) : "Não informado"],
    ["Trabalho aos fins de semana", find("weekend_availability") ? describe(find("weekend_availability")!) : "Não informado"],
    ["Disponibilidade para início", view.start || "Não informado"],
    ["Nível de inglês", view.english || "Não informado"],
    ...(resume ? [
      ["Publicação da vaga", ageLabel(vs.ageDays)],
      ["Sites", vs.sites.map((site) => portals[site as keyof typeof portals]?.name || site).join(", ")],
      ["Limite por dia", `${vs.dailyLimit} candidatura(s)`],
      ["Telefone", vs.phone || "Não informado"],
    ] as [string, string][] : []),
  ];
  const fs = form.search;

  return (
    <div className="career-flow smart-profile">
      <PageHead eyebrow="PERFIL INTELIGENTE" title="Respostas que só você define"
        description="A IA redige respostas e o currículo comprova experiências. Preferências e fatos pessoais vêm só de você — sem informação, nunca respondemos “não”." />
      <PendingCard groups={pending} />
      <section className="sp-card">
        <header><h2>Preferências essenciais</h2><p>Responda uma vez. Usamos estas respostas para escolher as vagas e para preencher perguntas equivalentes, em português ou inglês.</p></header>
        {!editingEssentials ? (
          <>
            <dl className="sp-summary">
              {summary.map(([label, value]) => (
                <div key={label} className="sp-summary-item"><dt>{label}</dt><dd className={/^Não informado$/.test(value) ? "muted" : ""}>{value}</dd></div>
              ))}
            </dl>
            <div className="sp-actions"><span className="sp-saved"><Check size={16} aria-hidden="true" /> Preferências salvas</span><Button onClick={() => { setForm(initial()); setEditingEssentials(true); }}><Pencil size={15} aria-hidden="true" /> Editar preferências</Button></div>
          </>
        ) : (<>
        {!resume && <p className="sp-note">Envie seu currículo para escolher cargos, sites e ativar o envio automático. <Button onClick={() => navigate("curriculo")}>Enviar currículo</Button></p>}
        <div className="sp-grid">
          {resume && <fieldset className="sp-field wide">
            <legend>Cargos que você procura</legend>
            <div className="sp-choices">
              {[...new Set([...(resume.targets?.map((t) => t.title) || []), ...fs.titles])].map((title) => (
                <Check2 key={title} checked={fs.titles.includes(title)} onChange={(on) => setSearch("titles", on ? [...fs.titles, title].slice(0, 8) : fs.titles.filter((t) => t !== title))}>{title}</Check2>
              ))}
            </div>
            <span className="sp-inline">
              <input aria-label="Outro cargo" placeholder="Adicionar outro cargo" maxLength={100} value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
              <Button disabled={customTitle.trim().length < 2 || fs.titles.length >= 8} onClick={() => { setSearch("titles", [...new Set([...fs.titles, customTitle.trim()])]); setCustomTitle(""); }}>Adicionar</Button>
            </span>
          </fieldset>}
          <fieldset className="sp-field">
            <legend>Modalidade de trabalho</legend>
            <div className="sp-choices">{Object.values(modalityLabel).map((l) => <Check2 key={l} checked={form.modalities.includes(l)} onChange={(on) => toggle("modalities", l, on)}>{l}</Check2>)}</div>
          </fieldset>
          {resume && <label className="sp-field">
            <span className="sp-legend">Em qual cidade você mora?</span>
            <input placeholder="Ex.: Ilhéus, BA" maxLength={200} autoComplete="address-level2" value={fs.city} onChange={(e) => setSearch("city", e.target.value)} />
            {form.modalities.some((m) => m !== "Remoto") && (
              <Check2 checked={fs.sameCityOnly} onChange={(on) => setSearch("sameCityOnly", on)}>Presencial e híbrido somente na minha cidade</Check2>
            )}
          </label>}
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
          <fieldset className="sp-field wide">
            <legend>Tipo de contratação aceito</legend>
            <div className="sp-choices">{contractChoices.map(([l]) => <Check2 key={l} checked={form.contracts.includes(l)} onChange={(on) => toggle("contracts", l, on)}>{l}</Check2>)}</div>
          </fieldset>
          <label className="sp-field">
            <span className="sp-legend">Salário mínimo / pretensão (R$/mês)</span>
            <input inputMode="numeric" value={fs.salaryMin || ""} placeholder="Ex.: 4000" onChange={(e) => setSearch("salaryMin", Number(e.target.value.replace(/\D/g, "")) || 0)} />
          </label>
          <label className="sp-field">
            <span className="sp-legend">Salário máximo (opcional)</span>
            <input inputMode="numeric" value={fs.salaryMax || ""} placeholder="Sem limite" onChange={(e) => setSearch("salaryMax", Number(e.target.value.replace(/\D/g, "")) || 0)} />
            <Check2 checked={fs.includeUnknownSalary} onChange={(on) => setSearch("includeUnknownSalary", on)}>Considerar vagas sem salário anunciado</Check2>
          </label>
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
          {resume && <>
          <label className="sp-field">
            <span className="sp-legend">Quando a vaga deve ter sido publicada?</span>
            <select value={fs.ageDays} onChange={(e) => setSearch("ageDays", Number(e.target.value))}>
              {[1, 3, 7, 30, 365].map((d) => <option key={d} value={d}>{ageLabel(d)}</option>)}
            </select>
          </label>
          <label className="sp-field">
            <span className="sp-legend">Limite de candidaturas por dia (máx. {planLimit})</span>
            <input type="number" min={1} max={planLimit} value={fs.dailyLimit} onChange={(e) => setSearch("dailyLimit", Number(e.target.value))} />
          </label>
          <fieldset className="sp-field wide">
            <legend>Sites para buscar e se candidatar</legend>
            <div className="sp-choices">{candidatePortals.map((site) => <Check2 key={site} checked={fs.sites.includes(site)} onChange={() => toggleSite(site)}>{portals[site].name}</Check2>)}</div>
          </fieldset>
          <label className="sp-field">
            <span className="sp-legend">Telefone para as candidaturas (com DDD)</span>
            <input type="tel" autoComplete="tel" maxLength={30} value={fs.phone || ""} placeholder="Ex.: (73) 99999-9999" onChange={(e) => setSearch("phone", e.target.value)} />
          </label>
          <fieldset className="sp-field wide">
            <legend>Perguntas das vagas</legend>
            <Check2 checked={form.answerAutomatically} onChange={(on) => set("answerAutomatically", on)}>Deixar a IA responder às perguntas das vagas. Verei as respostas no histórico; aceites jurídicos exigem minha autorização.</Check2>
          </fieldset>
          </>}
        </div>
        <div className="sp-actions">
          {hasEssentials && <Button onClick={cancelEssentials} disabled={action.isPending}>Cancelar</Button>}
          <Button disabled={action.isPending} onClick={() => save(resume ? keepRoutine : "save")}>{action.isPending ? "Salvando…" : "Salvar preferências"}</Button>
          {resume && !(w.routine.enabled && w.routine.mode === "automatic") && <Button className="primary" disabled={action.isPending} onClick={() => save("automatic", true)}><Play size={15} aria-hidden="true" /> Salvar e ativar envio automático</Button>}
        </div>
        </>)}
      </section>
      <details className="interview-extra" onToggle={(e) => setExtrasOpen(e.currentTarget.open)}>
        <summary>Outras opções para suas candidaturas</summary>
        {extrasOpen && <><ApplicationPreferences /><ReconciledRetry /><EmailConnection /></>}
      </details>
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
