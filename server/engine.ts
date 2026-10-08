import { createHash } from "node:crypto";
import type { Filters, Job, Match, Profile } from "../shared/types";
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const vocabulary: Record<string, RegExp> = {
  "Atendimento ao público":
    /atend(?:imento|endo|er|ia|i)?\s+(?:ao |aos |a )?(?:publico|clientes?)|customer service/i,
  "Operação de caixa": /oper(?:acao|ador|adora) de caixa|\bcaixa\b|cashier/i,
  "Reposição de mercadorias": /reposi(?:cao|tor|tora)|repor mercadorias/i,
  Vendas: /\bvendas?\b|vendedor|vendedora|sales/i,
  "Organização de estoque": /\bestoque\b|almoxarif|stock management/i,
  Logística: /logistica|logistics/i,
  "Separação de pedidos": /separa(?:cao|r) (?:de )?pedidos|order picking/i,
  Produção: /auxiliar de producao|linha de producao|operador de producao/i,
  Recepção: /recepcionista|recepcao|receptionist/i,
  "Rotinas administrativas":
    /rotinas? administrativas?|auxiliar administrativo|assistente administrativo/i,
  Excel: /\bexcel\b|planilhas/i,
  Enfermagem: /enfermagem|enfermeir|nursing/i,
  "Cuidados com pacientes": /cuidados? (?:com |aos? )?pacientes|patient care/i,
  Educação: /professor|pedagogia|docencia|ensino de|teacher/i,
  Eletricidade: /eletricista|instalacoes eletricas|electrical/i,
  Mecânica: /mecanica|mecanico|mechanic/i,
  "Condução de veículos": /motorista|condutor|driver/i,
  Limpeza: /limpeza|higienizacao|cleaning/i,
  Cozinha: /cozinheiro|cozinheira|preparo de alimentos/i,
  "C#": /\bc#|\bcsharp\b|\bc sharp\b/i,
  ".NET": /\.net\b|\bdotnet\b|\basp\.?net\b/i,
  "ASP.NET Core": /asp\.?net\s*core/i,
  Angular: /\bangular\b/i,
  React: /\breact(?:js|\.js)?\b/i,
  "SQL Server": /\bsql server\b|\bmssql\b/i,
  PostgreSQL: /\bpostgres(?:ql)?\b/i,
  "Entity Framework": /\bentity framework\b|\bef core\b/i,
  "APIs REST": /\brest(?:ful)?\b|\bapis?\b/i,
  TypeScript: /\btypescript\b/i,
  JavaScript: /\bjavascript\b/i,
  "Node.js": /\bnode\.?js\b/i,
  Python: /\bpython\b/i,
  Java: /\bjava\b/i,
  Docker: /\bdocker\b/i,
  Git: /\bgit\b/i,
  Azure: /\bazure\b/i,
  AWS: /\baws\b|amazon web services/i,
  HTML: /\bhtml5?\b/i,
  CSS: /\bcss3?\b/i,
};
function includesTerm(text: string, term: string): boolean {
  const normalized = normalize(term);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(
    normalize(text),
  );
}
export function extractSkills(text: string, custom: string[] = []): string[] {
  return [
    ...new Set([
      ...Object.entries(vocabulary)
        .filter(([, re]) => re.test(normalize(text)))
        .map(([s]) => s),
      ...custom.filter((s) => s && includesTerm(text, s)),
    ]),
  ];
}
export function parseResume(text: string): Partial<Profile> {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const education = lines.filter((s) =>
    /ensino (fundamental|medio|superior)|formacao:|escolaridade:|graduacao em|tecnico em|bacharel|licenciatura/.test(
      normalize(s),
    ),
  );
  const experience = lines.filter((s) =>
    /^(experiencia|trabalho informal|experiencia informal)\s*:/i.test(
      normalize(s),
    ),
  );
  return {
    skills: extractSkills(text),
    email: text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? "",
    github: text.match(/https?:\/\/(?:www\.)?github\.com\/[\w-]+/i)?.[0] ?? "",
    ...(education.length
      ? { education: education.join("\n").slice(0, 5000) }
      : {}),
    ...(experience.length
      ? { experience: experience.join("\n").slice(0, 10000) }
      : {}),
    ...(lines.find((s) => /^objetivo\s*:/i.test(s))
      ? {
          headline: lines
            .find((s) => /^objetivo\s*:/i.test(s))!
            .replace(/^objetivo\s*:\s*/i, "")
            .slice(0, 200),
        }
      : {}),
    confirmed: false,
  };
}
const roleFamilies = [
  /jovem aprendiz|aprendiz|primeiro emprego|sem experiencia|intern|estagi/,
  /tecnologia|technology|software|desenvolv|developer|back.?end|full.?stack|front.?end|analista de sistemas|programador/,
  /designer|design|\bux\b|\bui\b|criativo|creative/,
  /financ|contabil|contador|accountan|controller|auditor/,
  /venda|sales|comercial|account executive|business development/,
  /atendent|caixa|repositor|auxiliar de loja|supermercado|atendimento|retail|customer (?:support|service)/,
  /recepcion|administrativ|secretari|office assistant/,
  /marketing|growth|social media|publicidade|comunicacao/,
  /\brh\b|recursos humanos|human resources|recruiter|recrut|talent/,
  /\bdata\b|dados|\bbi\b|business intelligence/,
  /operac|operations|logistic|supply chain|estoqu|almoxarif|producao/,
  /saude|health|enferme|nurs|medic|physician|terapeut|fisioterap/,
  /professor|teacher|educa|instrutor|instructor/,
  /advog|jurid|lawyer|legal/,
  /motorista|condutor|transporte|driver/,
  /eletric|mecanic|manutencao/,
  /cozinheir|cozinha|restaurante|alimentacao/,
  /limpeza|servicos gerais|higieniz/,
];
/** Search suggestions only: these titles never create qualifications in the profile. */
export function suggestRoles(
  profile: Partial<Profile>,
  titles: string[] = [],
): string[] {
  const text = normalize(
    [profile.headline, profile.experience, ...(profile.skills || []), ...titles]
      .filter(Boolean)
      .join(" "),
  );
  const suggestions: string[] = [...titles];
  if (
    /supermercado|auxiliar de loja|atendimento|atendent|caixa|repositor/.test(
      text,
    )
  )
    suggestions.push(
      "Atendente",
      "Operador de caixa",
      "Repositor",
      "Auxiliar de loja",
    );
  if (/administrativ|recepcion|secretari/.test(text))
    suggestions.push("Auxiliar administrativo", "Recepcionista");
  if (/logistic|estoque|almoxarif/.test(text))
    suggestions.push("Auxiliar de logística", "Auxiliar de estoque");
  if (/primeiro emprego|jovem aprendiz|sem experiencia/.test(text))
    suggestions.push("Jovem aprendiz", "Auxiliar sem experiência");
  return [...new Set(suggestions)].slice(0, 20);
}
export function dedupKey(
  job: Pick<Job, "title" | "company" | "location">,
): string {
  return createHash("sha256")
    .update([job.title, job.company, job.location].map(normalize).join("|"))
    .digest("hex");
}
export function classify(text: string) {
  const n = normalize(text);
  return {
    contract: /jovem aprendiz|contrato de aprendizagem/.test(n)
      ? "Aprendiz"
      : /estagio|internship/.test(n)
        ? "Estágio"
        : /\bclt\b/.test(n)
          ? "CLT"
          : /temporari|temporary/.test(n)
            ? "Temporário"
            : /\bpj\b|pessoa juridica|contractor/.test(n)
              ? "PJ"
              : "Não especificado",
    level: /jovem aprendiz|aprendiz|apprentice/.test(n)
      ? "Aprendiz"
      : /sem experiencia|primeiro emprego|no experience/.test(n)
        ? "Primeiro emprego"
        : /senior|\bsr\b|staff|principal|lead/.test(n)
          ? "Sênior"
          : /pleno|\bmid/.test(n)
            ? "Pleno"
            : /junior|\bjr\b|engineer i\b|entry.level|associate/.test(n)
              ? "Júnior"
              : /estagio|intern/.test(n)
                ? "Estágio"
                : /trainee/.test(n)
                  ? "Trainee"
                  : "Não especificado",
    modality: /hybrid|hibrid/.test(n)
      ? "Híbrido"
      : /remote|remoto|home office/.test(n)
        ? "Remoto"
        : /on.site|presencial/.test(n)
          ? "Presencial"
          : "Não especificado",
    requiredYears: (() => {
      const m = n.match(
        /(?:at least|minimo(?: de)?|minimum(?: of)?)?\s*(\d{1,2})\+?\s*(?:anos|years)\s+(?:de experiencia|of (?:relevant )?experience)|(?:at least|minimum of|minimo de)\s*(\d{1,2})\+?\s*(?:anos|years)/,
      );
      return m ? Number(m[1] || m[2]) : null;
    })(),
  };
}
const stateNames: Record<string, string> = {
  sp: "sao paulo",
  mg: "minas gerais",
  rj: "rio de janeiro",
  pr: "parana",
  sc: "santa catarina",
  rs: "rio grande do sul",
  ba: "bahia",
  pe: "pernambuco",
  ce: "ceara",
  df: "distrito federal",
  go: "goias",
  es: "espirito santo",
  am: "amazonas",
  pa: "para",
  ma: "maranhao",
  rn: "rio grande do norte",
  pb: "paraiba",
  al: "alagoas",
  se: "sergipe",
  pi: "piaui",
  mt: "mato grosso",
  ms: "mato grosso do sul",
  ro: "rondonia",
  rr: "roraima",
  ap: "amapa",
  to: "tocantins",
  ac: "acre",
};
export function locationMatches(
  jobLocation: string,
  desired: string[],
): boolean {
  if (!desired.length) return true;
  const location = normalize(jobLocation);
  return desired.filter(Boolean).some((item) => {
    const target = normalize(item);
    if (["br", "brasil", "brazil"].includes(target)) {
      if (
        /\b(?:us|usa|united states|estados unidos|uk|united kingdom|canada|paraguay|paraguai|argentina|portugal)\b/.test(
          location,
        )
      )
        return false;
      return (
        /\bbrasil\b|\bbrazil\b|\bbr\b/.test(location) ||
        Object.entries(stateNames).some(
          ([state, name]) =>
            new RegExp(`(?:^|[,/ -])${state}(?:$|[,/ -])`).test(location) ||
            new RegExp(`\\b${name}\\b`).test(location),
        )
      );
    }
    if (stateNames[target])
      return (
        location.includes(stateNames[target]) ||
        new RegExp(`(?:^|[,/ -])${target}(?:$|[,/ -])`).test(location)
      );
    const city = target.split(/[,/]/)[0].trim();
    return (
      !!city &&
      (location.includes(target) ||
        location.split(/[,/]/)[0].trim() === city ||
        location.includes(city))
    );
  });
}
export function matchesObjectiveFilters(
  job: Job,
  profile: Profile,
  filters: Filters,
): boolean {
  if (job.availability === "closed") return false;
  const content = [job.title, job.description, ...job.skills].join(" ");
  const cited = extractSkills(content, filters.skills);
  if (
    filters.skills.length &&
    !filters.skills.some((skill) =>
      cited.some((s) => normalize(s) === normalize(skill)),
    )
  )
    return false;
  if (filters.language) {
    const synonyms: Record<string, string[]> = {
      ingles: ["inglês", "English"],
      english: ["inglês", "English"],
      portugues: ["português", "Portuguese"],
      portuguese: ["português", "Portuguese"],
      espanhol: ["espanhol", "Spanish"],
      spanish: ["espanhol", "Spanish"],
      frances: ["francês", "French"],
      french: ["francês", "French"],
    };
    const desiredLanguage = synonyms[normalize(filters.language)] || [
      filters.language,
    ];
    if (!desiredLanguage.some((language) => includesTerm(content, language)))
      return false;
  }
  const title = normalize(job.title);
  const desired = normalize(
    (filters.titles.length ? filters.titles : [profile.headline]).join(" "),
  );
  const firstJobWanted = filters.titles.some((title) =>
    /primeiro emprego|sem experiencia/.test(normalize(title)),
  );
  const beginnerRole =
    firstJobWanted &&
    (job.level === "Primeiro emprego" ||
      job.requiredYears === 0 ||
      /sem experiencia|nao exige experiencia|no experience/.test(
        normalize(job.description),
      ));
  if (
    filters.titles.length &&
    !beginnerRole &&
    !filters.titles.some((t) =>
      normalize(t)
        .split(" ")
        .filter((token) => !["de", "do", "da", "e"].includes(token))
        .every((token) => title.includes(token)),
    ) &&
    !roleFamilies.some((family) => family.test(title) && family.test(desired))
  )
    return false;
  // Related role families cannot silently erase an explicitly requested specialization.
  const specialties = [
    "C#",
    ".NET",
    "Angular",
    "React",
    "Java",
    "Python",
    "SQL Server",
    "PostgreSQL",
    "Excel",
    "SAP",
    "COREN",
    "CRM",
    "CNH B",
    "CNH C",
    "CNH D",
    "CNH E",
  ];
  if (
    filters.titles.length &&
    !filters.titles.some((t) =>
      specialties
        .filter((s) => includesTerm(t, s))
        .every((s) => includesTerm(content, s)),
    )
  )
    return false;
  const assessment = analyze(job, profile, filters);
  return !assessment.blockers.some((s) =>
    /fora das suas preferencias|fora das suas preferências|fora do periodo|fora do período|abaixo do minimo|abaixo do mínimo|empresa bloqueada|termo excluido|termo excluído|seu filtro|seu limite|vaga nao cita|vaga não cita/.test(
      s.toLowerCase(),
    ),
  );
}
export function matchSignature(
  profile: Profile,
  job: Job,
  filters: Filters,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        profile,
        filters,
        job: {
          title: job.title,
          description: job.description,
          company: job.company,
          location: job.location,
          modality: job.modality,
          level: job.level,
          contract: job.contract,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          salaryPeriod: job.salaryPeriod,
          skills: job.skills,
          requiredSkills: job.requiredSkills,
          requiredYears: job.requiredYears,
          publishedAt: job.publishedAt,
        },
      }),
    )
    .digest("hex");
}
export function analyze(job: Job, profile: Profile, filters: Filters): Match {
  const known = new Set(
    [
      ...profile.skills,
      ...extractSkills(profile.experience + " " + profile.education),
    ].map(normalize),
  );
  const matchedSkills = job.skills.filter((s) => known.has(normalize(s)));
  const missingSkills = job.skills.filter((s) => !known.has(normalize(s)));
  const strengths: string[] = [],
    gaps: string[] = [],
    blockers: string[] = [];
  const text = normalize(job.title + " " + job.description);
  const jobTitle = normalize(job.title);
  const directTitle = [...filters.titles, profile.headline]
    .filter(Boolean)
    .some((t) => {
      const tokens = normalize(t)
        .split(" ")
        .filter((s) => !["de", "do", "da", "com", "e"].includes(s));
      return (
        tokens.length > 0 && tokens.every((token) => jobTitle.includes(token))
      );
    });
  const target = normalize(filters.titles.join(" ") + " " + profile.headline);
  const roleFamily = roleFamilies.some(
    (family) => family.test(jobTitle) && family.test(target),
  );
  const radar = !directTitle && roleFamily && matchedSkills.length >= 2;
  const evidenceText = normalize(
    [profile.education, profile.experience, ...profile.skills].join("\n"),
  );
  const qualificationText = evidenceText
    .split(/[\n.;]/)
    .filter(
      (s) =>
        !/nao (?:possuo|tenho|conclui)|sem (?:registro|cnh|formacao)|incomplet|cursando|vencid|inativ/.test(
          s,
        ),
    )
    .join(" ");
  const licenses = [
    "COREN",
    "CRM",
    "CREFITO",
    "CRP",
    "CRF",
    "CREA",
    "OAB",
    "CRN",
    "CREF",
  ];
  for (const license of licenses) {
    const re = new RegExp(`\\b${license.toLowerCase()}\\b`);
    const mandatory = text
      .split(/[\n.;]/)
      .some(
        (sentence) =>
          re.test(sentence) &&
          /obrigatori|exig|necessari|registro|ativ[oa]/.test(sentence) &&
          !/desejav|diferencial|opcional|nao obrig|nao exig/.test(sentence),
      );
    if (mandatory && !re.test(qualificationText))
      blockers.push(
        `Registro profissional obrigatório não confirmado: ${license}.`,
      );
  }
  const driving = text.match(/cnh\s*(?:categoria\s*)?([abcde])\b/);
  if (
    driving &&
    !new RegExp(`cnh\\s*(?:categoria\\s*)?${driving[1]}\\b`).test(
      qualificationText,
    )
  )
    blockers.push(
      `Habilitação exigida não confirmada: CNH ${driving[1].toUpperCase()}.`,
    );
  const schooling = (s: string) =>
    /ensino superior|graduacao|bacharel|licenciatura/.test(s)
      ? 3
      : /ensino medio/.test(s)
        ? 2
        : /ensino fundamental/.test(s)
          ? 1
          : 0;
  const requiredSchooling = schooling(text),
    confirmedSchooling = schooling(qualificationText);
  if (requiredSchooling && confirmedSchooling < requiredSchooling)
    gaps.push(
      "Escolaridade citada na vaga ainda não confirmada no seu perfil.",
    );
  if (requiredSchooling && confirmedSchooling >= requiredSchooling)
    strengths.push("Escolaridade informada atende ao nível citado na vaga.");
  if (
    /disponibilidade|escala|horario|turno|plantao/.test(text) &&
    !profile.availability
  )
    gaps.push(
      "Confirme sua disponibilidade de horário e compare com a escala da vaga.",
    );
  if (matchedSkills.length)
    strengths.push(`Competências em comum: ${matchedSkills.join(", ")}.`);
  if (missingSkills.length)
    gaps.push(
      `Conhecimentos citados a confirmar: ${missingSkills.join(", ")}.`,
    );
  if (!profile.confirmed)
    blockers.push("Confirme seu perfil antes de preparar uma candidatura.");
  if (!profile.skills.length)
    gaps.push("Adicione suas competências para calcular uma aderência útil.");
  if (!job.skills.length)
    gaps.push("A fonte não identificou competências; revise a descrição.");
  for (const required of [...job.requiredSkills, ...filters.requiredSkills]) {
    if (!known.has(normalize(required)))
      blockers.push(`Competência indispensável não confirmada: ${required}.`);
  }
  for (const required of filters.requiredSkills)
    if (!job.skills.some((s) => normalize(s) === normalize(required)))
      blockers.push(
        `A vaga não cita sua competência indispensável: ${required}.`,
      );
  if (job.requiredYears !== null && job.requiredYears > filters.maxYears)
    blockers.push(
      `Exige ${job.requiredYears} anos; seu limite é ${filters.maxYears}.`,
    );
  if (
    job.requiredYears !== null &&
    profile.years !== null &&
    job.requiredYears > profile.years
  )
    gaps.push(
      `Exige ${job.requiredYears} anos; você confirmou ${profile.years}.`,
    );
  if (
    job.level === "Júnior" &&
    job.requiredYears !== null &&
    job.requiredYears >= 5
  )
    blockers.push("O título é júnior, mas a experiência exigida é elevada.");
  if (
    job.salaryMax !== null &&
    job.currency === "BRL" &&
    (() => {
      const period = normalize(job.salaryPeriod || "");
      const monthly = /^(month|monthly|mensal|mes)$/.test(period)
        ? job.salaryMax
        : /^(year|yearly|annual|annually|anual|ano)$/.test(period)
          ? job.salaryMax / 12
          : !period && job.source === "Manual"
            ? job.salaryMax
            : null;
      return (
        monthly !== null &&
        monthly < Math.max(filters.salaryMin, profile.salaryMin)
      );
    })()
  )
    blockers.push("Faixa salarial abaixo do mínimo configurado.");
  if (job.salaryMin === null) gaps.push("Salário não divulgado.");
  else if (!job.salaryPeriod && job.source !== "Manual")
    gaps.push(
      "Período salarial não informado; o valor não foi comparado ao mínimo mensal.",
    );
  if (filters.salaryOnly && job.salaryMin === null)
    blockers.push("Seu filtro exige salário divulgado.");
  if (
    filters.blockedCompanies.some(
      (c) => normalize(c) === normalize(job.company),
    )
  )
    blockers.push("Empresa bloqueada nas suas preferências.");
  if (filters.levels.length && !filters.levels.includes(job.level))
    blockers.push("Senioridade fora das suas preferências.");
  if (filters.modalities.length && !filters.modalities.includes(job.modality))
    blockers.push("Modalidade fora das suas preferências.");
  if (filters.contracts.length && !filters.contracts.includes(job.contract))
    blockers.push("Contratação fora das suas preferências.");
  if (
    filters.locations.length &&
    !locationMatches(job.location, filters.locations)
  )
    blockers.push(
      "Localização fora das suas preferências; revise restrições geográficas.",
    );
  if (filters.language && !text.includes(normalize(filters.language)))
    gaps.push(
      `Idioma desejado (${filters.language}) não confirmado pela descrição.`,
    );
  if (filters.excludedTerms.some((t) => text.includes(normalize(t))))
    blockers.push("A descrição contém um termo excluído.");
  if (/pagamento para candid|application fee|taxa de inscricao/.test(text))
    blockers.push("Possível cobrança pela candidatura.");
  if (
    job.publishedAt &&
    Date.now() - Date.parse(job.publishedAt) > filters.ageDays * 86400000
  )
    blockers.push("Publicação fora do período configurado.");
  const criteria: { label: string; earned: number; possible: number }[] = [];
  const criterion = (label: string, earned: number, possible: number) =>
    criteria.push({ label, earned: Math.round(earned * 100) / 100, possible });
  if (job.skills.length)
    criterion(
      "Competências citadas na vaga",
      (60 * matchedSkills.length) / job.skills.length,
      60,
    );
  if (target)
    criterion(
      "Cargo e área desejados",
      directTitle ? 20 : radar ? 17 : roleFamily ? 8 : 0,
      20,
    );
  if (job.level !== "Não especificado" && profile.level !== "Não especificado")
    criterion("Nível de experiência", job.level === profile.level ? 5 : 0, 5);
  if (filters.modalities.length && job.modality !== "Não especificado")
    criterion(
      "Modalidade preferida",
      filters.modalities.includes(job.modality) ? 10 : 0,
      10,
    );
  if (job.requiredYears !== null)
    criterion(
      "Tempo de experiência confirmado",
      profile.years !== null && profile.years >= job.requiredYears ? 5 : 0,
      5,
    );
  if (requiredSchooling)
    criterion(
      "Escolaridade",
      confirmedSchooling >= requiredSchooling ? 15 : 0,
      15,
    );
  if (filters.locations.length && job.location)
    criterion(
      "Localização",
      locationMatches(job.location, filters.locations) ? 10 : 0,
      10,
    );
  if (filters.modalities.includes(job.modality))
    strengths.push(
      `Modalidade ${job.modality.toLowerCase()} alinhada às preferências.`,
    );
  if (job.level === profile.level && job.level !== "Não especificado")
    strengths.push("Nível de experiência alinhado ao perfil confirmado.");
  const enoughProfile =
    known.size > 0 || !!profile.education || profile.years !== null;
  const enoughJob =
    job.skills.length > 0 || !!requiredSchooling || job.requiredYears !== null;
  const confidence =
    enoughProfile && enoughJob && criteria.length >= 2
      ? "sufficient"
      : "insufficient";
  const possible = criteria.reduce((sum, c) => sum + c.possible, 0);
  let score =
    confidence === "sufficient" && possible
      ? (100 * criteria.reduce((sum, c) => sum + c.earned, 0)) / possible
      : 0;
  if (confidence === "insufficient")
    gaps.push(
      "Dados insuficientes para comparar o perfil com os requisitos da vaga.",
    );
  if (blockers.length) score = Math.min(score, 49);
  const result: Match = {
    score: Math.round(score),
    strengths,
    gaps,
    blockers,
    matchedSkills,
    missingSkills,
    radar,
    confidence,
    criteria,
    explanation:
      confidence === "insufficient"
        ? "Dados insuficientes. Complete seu perfil ou revise a descrição; a ausência de informação não significa baixa compatibilidade."
        : `${radar ? "O título é diferente, mas a família profissional e competências se conectam ao perfil. " : ""}Pontuação dos critérios disponíveis: ${criteria.map((c) => `${c.label}: ${c.earned}/${c.possible}`).join("; ")}. ${blockers.length ? "Limitada a 49 por pendências obrigatórias. " : ""}Não representa a probabilidade de contratação.`,
  };
  if (job.match?.advice?.signature === matchSignature(profile, job, filters)) {
    result.advice = job.match.advice;
    result.explanation += `\nLeitura complementar por IA, sujeita à sua revisão: ${job.match.advice.explanation}`;
  }
  return result;
}
export function nextExecution(time: string, from = new Date()): string {
  // Explicit São Paulo UTC-3. Scheduling is intentionally restricted to this timezone.
  const date = new Date(from.getTime() - 3 * 3600000)
    .toISOString()
    .slice(0, 10);
  const next = new Date(`${date}T${time}:00-03:00`);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
