/**
 * Canonical answer topics and the user's answer memory.
 *
 * Principle: AI may draft answers and the CV may prove facts, but only the user
 * defines personal facts and preferences. Missing information is never "No".
 * Classification here is rule based (deterministic). AI is never used to pick a
 * value; an optional AI topic suggestion is intentionally not wired (see
 * README note in server/answer-topics.ts).
 */

/** Same normalization as server/job-identity `normalized` (kept here so the browser bundle does not import node:crypto). */
export const normalizedText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();

export type AnswerTopic =
  | "relocation_willingness"
  | "travel_availability"
  | "weekend_availability"
  | "contract_type"
  | "salary_expectation"
  | "start_availability"
  | "work_modality"
  | "english_level"
  | "spanish_level"
  | "tech_experience_years"
  | "driver_license"
  | "own_vehicle"
  | "night_shift"
  | "current_employment"
  | "work_authorization";

export type TopicMatch = { topic: AnswerTopic; params?: { technology?: string; modality?: Modality; contract?: Contract } };
export type Modality = "remoto" | "hibrido" | "presencial";
export type Contract = "clt" | "pj" | "estagio" | "freelancer";

export const topicLabels: Record<AnswerTopic, string> = {
  relocation_willingness: "Mudança de cidade",
  travel_availability: "Disponibilidade para viagens",
  weekend_availability: "Trabalho aos fins de semana",
  contract_type: "Tipo de contratação",
  salary_expectation: "Pretensão salarial",
  start_availability: "Disponibilidade para início",
  work_modality: "Modalidade de trabalho",
  english_level: "Nível de inglês",
  spanish_level: "Nível de espanhol",
  tech_experience_years: "Anos de experiência",
  driver_license: "CNH",
  own_vehicle: "Veículo próprio",
  night_shift: "Turno noturno",
  current_employment: "Emprego atual",
  work_authorization: "Autorização de trabalho",
};

/** Ordered: the first matching topic wins. Patterns run on normalizedText. */
const catalog: { topic: AnswerTopic; patterns: RegExp[] }[] = [
  { topic: "relocation_willingness", patterns: [
    /realoca|relocat|mudanca de (?:cidade|estado|pais)|disponibilidade (?:para|de) mudanca|mudar(?:-se)? de cidade|residir em outra|morar em outra|se mudar|willing to move|move to (?:another|a different)/,
  ] },
  { topic: "travel_availability", patterns: [/viage|viajar|travel/] },
  { topic: "weekend_availability", patterns: [/fins? de semana|final de semana|sabado|domingo|weekend/] },
  { topic: "night_shift", patterns: [/turno noturno|periodo noturno|trabalhar a noite|night shift|madrugada/] },
  { topic: "driver_license", patterns: [/\bcnh\b|carteira de (?:motorista|habilitacao)|habilitacao|driver s? licen|driving licen/] },
  { topic: "own_vehicle", patterns: [/veiculo proprio|carro proprio|moto propria|own (?:a )?(?:car|vehicle)|have a car/] },
  { topic: "work_authorization", patterns: [/autorizacao (?:para|de) trabalh|authori[sz]ed to work|work authori[sz]ation|right to work|permissao de trabalho|eligible to work/] },
  { topic: "salary_expectation", patterns: [/pretensao salarial|expectativa salarial|salary expectation|expected salary|desired salary|salario pretendido/] },
  { topic: "start_availability", patterns: [/disponibilidade (?:para|de) inicio|quando (?:pode|poderia) comecar|data de inicio|aviso previo|notice period|start date|when can you start|availability to start|disponibilidade para comecar/] },
  { topic: "contract_type", patterns: [/\bclt\b|\bpj\b|pessoa juridica|regime de contrata|tipo de contrata|modelo de contrata|freelanc|\bestagio\b|contract type|employment type/] },
  { topic: "work_modality", patterns: [/\bremot|\bhibrid|\bpresencial|home office|on.?site|\bhybrid\b|modelo de trabalho|modalidade de trabalho|work model|in office/] },
  { topic: "english_level", patterns: [/\bingles\b|\benglish\b/] },
  { topic: "spanish_level", patterns: [/\bespanhol\b|\bspanish\b|\bespanol\b/] },
  { topic: "current_employment", patterns: [/(?:esta|estou) (?:empregad|trabalhando)|currently employed|trabalha atualmente|emprego atual|currently working/] },
];

const experienceQuestion = /anos de experiencia|tempo de experiencia|quantos anos|how many years|years of experience|ha quanto tempo/;

function modalityIn(text: string): Modality | undefined {
  if (/\bremot|home office/.test(text)) return "remoto";
  if (/\bhibrid|\bhybrid/.test(text)) return "hibrido";
  if (/\bpresencial|on.?site|in office/.test(text)) return "presencial";
  return undefined;
}
function contractIn(text: string): Contract | undefined {
  if (/\bpj\b|pessoa juridica/.test(text)) return "pj";
  if (/\bclt\b/.test(text)) return "clt";
  if (/\bestagio\b|internship/.test(text)) return "estagio";
  if (/freelanc/.test(text)) return "freelancer";
  return undefined;
}

export function classifyQuestion(question: string, _options?: string[]): TopicMatch | null {
  const text = normalizedText(question);
  if (!text) return null;
  if (experienceQuestion.test(text)) {
    const technology = text
      .replace(/.*(?:experiencia (?:com|em)|experience (?:with|in)|trabalha com|worked with)\s+/, "")
      .replace(/\b(?:voce|you|possui|tem|have)\b.*$/, "")
      .trim();
    if (technology && technology !== text && technology.split(" ").length <= 4)
      return { topic: "tech_experience_years", params: { technology } };
  }
  for (const entry of catalog)
    if (entry.patterns.some((p) => p.test(text))) {
      if (entry.topic === "work_modality") {
        const modality = modalityIn(text);
        return modality ? { topic: entry.topic, params: { modality } } : { topic: entry.topic };
      }
      if (entry.topic === "contract_type") {
        const contract = contractIn(text);
        return contract ? { topic: entry.topic, params: { contract } } : { topic: entry.topic };
      }
      return { topic: entry.topic };
    }
  return null;
}

/** Stable key used to group pending questions: topic (+technology) or the normalized question. */
export function topicKey(match: TopicMatch | null, question: string) {
  if (!match) return `q:${normalizedText(question).replace(/\s*\*$/, "")}`;
  return match.topic === "tech_experience_years" && match.params?.technology
    ? `${match.topic}:${match.params.technology}`
    : match.topic;
}

export type AnswerMemoryEntry = {
  id: string;
  topic: AnswerTopic;
  params?: { technology?: string };
  /**
   * Canonical value: "yes" | "no" | "conditional" for yes/no topics,
   * comma list for work_modality / contract_type, number for salary/years,
   * free text for levels and start availability.
   */
  value: string;
  conditions?: { cities?: string[]; modalities?: Modality[]; minSalary?: number };
  source: "user" | "resume" | "preferences";
  confirmedAt: string;
  examples: string[];
  reuse?: boolean;
};

export type JobContext = { location?: string; modality?: string; title?: string; salary?: number };

const yesNoTopics = new Set<AnswerTopic>([
  "relocation_willingness", "travel_availability", "weekend_availability", "driver_license",
  "own_vehicle", "night_shift", "current_employment", "work_authorization",
]);

const yesOption = (o: string) => /^(?:sim|yes|s|y|tenho|possuo|aceito|i do|i am|disponivel)\b/.test(normalizedText(o));
const noOption = (o: string) => /^(?:nao|no|n|nunca|never)\b/.test(normalizedText(o));

const englishQuestion = (question: string) =>
  !/[áàâãéêíóôõúç]|\bvoce\b|\bqual\b|\bcomo\b|\bpossui\b|\btem\b|\baceita\b|\besta\b/i.test(question);

function yesNo(answer: boolean, question: string, options?: string[]) {
  if (options?.length) return options.find(answer ? yesOption : noOption);
  return englishQuestion(question) ? (answer ? "Yes" : "No") : answer ? "Sim" : "Não";
}

const levelWords: [RegExp, RegExp][] = [
  [/nao falo|nenhum|none/, /nao falo|nenhum|none|no knowledge|nao possuo/],
  [/basic/, /basic|elementar|beginner/],
  [/intermediario|intermediate/, /intermedia/],
  [/avancado|advanced/, /avancad|advanced|upper/],
  [/fluente|proficiente|fluent|proficient/, /fluent|proficien|avancado.*fluente/],
  [/nativ/, /nativ/],
];
export function mapLevel(level: string, options?: string[]) {
  if (!options?.length) return level;
  const key = normalizedText(level);
  const exact = options.find((o) => normalizedText(o) === key);
  if (exact) return exact;
  const word = levelWords.find(([match]) => match.test(key));
  return word ? options.find((o) => word[1].test(normalizedText(o))) : undefined;
}

const sameCity = (a: string, b: string) => {
  const x = normalizedText(a), y = normalizedText(b);
  return !!x && !!y && (x === y || y.startsWith(`${x} `) || x.startsWith(`${y} `) || y.includes(x));
};

/**
 * Returns an answer only when the memory applies to this job context and maps to
 * an existing form option. Anything else is unknown (undefined), never "No".
 */
export function resolveMemoryAnswer(
  question: string,
  match: TopicMatch,
  memory: AnswerMemoryEntry[],
  context: JobContext,
  options?: string[],
  salaryOption?: (question: string, amount: number, options: string[]) => string | undefined,
): { value: string; entry: AnswerMemoryEntry } | undefined {
  const entry = memory.find((m) => m.topic === match.topic && m.reuse !== false &&
    (match.topic !== "tech_experience_years" || normalizedText(m.params?.technology || "") === normalizedText(match.params?.technology || "")));
  if (!entry) return undefined;
  const value = normalizedText(entry.value);
  const done = (v?: string) => (v ? { value: v, entry } : undefined);
  if (yesNoTopics.has(match.topic)) {
    if (value === "yes") return done(yesNo(true, question, options));
    if (value === "no") return done(yesNo(false, question, options));
    if (value === "conditional" && match.topic === "relocation_willingness") {
      const cities = entry.conditions?.cities || [];
      return context.location && cities.some((c) => sameCity(c, context.location!)) ? done(yesNo(true, question, options)) : undefined;
    }
    return undefined;
  }
  if (match.topic === "work_modality" || match.topic === "contract_type") {
    const accepted = value.split(" ").filter(Boolean);
    const asked = match.topic === "work_modality"
      ? match.params?.modality || modalityIn(normalizedText(context.modality || ""))
      : match.params?.contract;
    if (asked && (!options?.length || options.some(yesOption))) return done(yesNo(accepted.includes(asked), question, options));
    if (options?.length) return done(options.find((o) => accepted.some((a) => normalizedText(o).split(" ").includes(a) ||
      (a === "estagio" && /estagi|intern/.test(normalizedText(o))))));
    return undefined;
  }
  if (match.topic === "salary_expectation" || match.topic === "tech_experience_years") {
    const amount = Number(entry.value.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    if (!options?.length) return done(String(amount));
    if (match.topic === "salary_expectation") return done(salaryOption?.(question, amount, options));
    return done(options.find((o) => normalizedText(o) === String(amount)));
  }
  if (match.topic === "english_level" || match.topic === "spanish_level") return done(mapLevel(entry.value, options));
  if (match.topic === "start_availability") {
    if (!options?.length) return done(entry.value);
    return done(options.find((o) => normalizedText(o) === value));
  }
  return undefined;
}

/** Stored entries first; derived entries fill topics the user did not set. Pure, no persistence. */
export function effectiveAnswerMemory(profile: {
  answerMemory?: AnswerMemoryEntry[];
  applicationPreferences?: { english?: string; spanish?: string; confirmedAt?: string } | Record<string, unknown>;
  acceptsPj?: boolean;
  salaryDesired?: number;
  availability?: string;
  candidateDetailsConfirmedAt?: string;
  confirmed?: boolean;
}): AnswerMemoryEntry[] {
  const stored = profile.answerMemory || [];
  const has = (topic: AnswerTopic) => stored.some((m) => m.topic === topic);
  const derived: AnswerMemoryEntry[] = [];
  const prefs = profile.applicationPreferences as { english?: string; spanish?: string; confirmedAt?: string } | undefined;
  if (profile.confirmed && prefs?.confirmedAt) {
    if (prefs.english && !has("english_level"))
      derived.push({ id: "pref-english", topic: "english_level", value: prefs.english, source: "preferences", confirmedAt: prefs.confirmedAt, examples: [] });
    if (prefs.spanish && !has("spanish_level"))
      derived.push({ id: "pref-spanish", topic: "spanish_level", value: prefs.spanish, source: "preferences", confirmedAt: prefs.confirmedAt, examples: [] });
  }
  if (profile.confirmed && profile.candidateDetailsConfirmedAt) {
    if (profile.salaryDesired && profile.salaryDesired > 0 && !has("salary_expectation"))
      derived.push({ id: "pref-salary", topic: "salary_expectation", value: String(profile.salaryDesired), source: "preferences", confirmedAt: profile.candidateDetailsConfirmedAt, examples: [] });
  }
  return [...stored, ...derived];
}

export type PendingGroup = {
  key: string;
  topic: AnswerTopic | null;
  label: string;
  questions: string[];
  options: string[];
  applicationIds: string[];
};

/** Groups pending questions of paused applications by topic (or normalized question). Used by the UI and a future e-mail digest. */
export function groupPendingQuestions(applications: {
  id: string; status: string; missingQuestions?: string[]; questionOptions?: Record<string, string[]>;
}[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const application of applications) {
    if (application.status !== "Requer ação manual" || !application.missingQuestions?.length) continue;
    for (const question of application.missingQuestions) {
      const match = classifyQuestion(question, application.questionOptions?.[question]);
      const key = topicKey(match, question);
      const group = groups.get(key) || {
        key, topic: match?.topic || null,
        label: match ? topicLabels[match.topic] + (match.params?.technology ? `: ${match.params.technology}` : "") : question,
        questions: [], options: [], applicationIds: [],
      };
      if (!group.questions.includes(question)) group.questions.push(question);
      for (const option of application.questionOptions?.[question] || []) if (!group.options.includes(option)) group.options.push(option);
      if (!group.applicationIds.includes(application.id)) group.applicationIds.push(application.id);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.applicationIds.length - a.applicationIds.length);
}

/** Plain-text digest of pending groups (next step: periodic e-mail; not sent anywhere yet). */
export function pendingDigest(groups: PendingGroup[]) {
  if (!groups.length) return "Nenhuma pergunta pendente.";
  return [
    `Só precisamos de ${groups.length} resposta${groups.length > 1 ? "s" : ""}:`,
    ...groups.map((g) => `- ${g.label} (destrava ${g.applicationIds.length} vaga${g.applicationIds.length > 1 ? "s" : ""})`),
  ].join("\n");
}
